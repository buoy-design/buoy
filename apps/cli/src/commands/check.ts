// apps/cli/src/commands/check.ts
import { Command } from "commander";
import { loadConfig, getConfigPath } from "../config/loader.js";
import { buildAutoConfig } from "../config/auto-detect.js";
import type { BuoyConfig } from "../config/schema.js";
import type { DriftSignal, Severity, DesignToken, Component } from "@buoy-design/core";
import { execSync } from "node:child_process";
import {
  DriftAnalysisService,
  hasDriftsAboveThreshold,
  calculateDriftSummary,
} from "../services/drift-analysis.js";
import { formatUpgradeHint } from "../utils/upgrade-hints.js";
import { generatePRCommentPreview } from "../output/pr-comment-preview.js";
import {
  isLoggedIn,
  submitScanReport,
  getGitMetadata,
  type ScanReportInput,
} from "../cloud/index.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";

export type OutputFormat = "text" | "json" | "ai-feedback";

/**
 * Generate a copy-paste ready diff snippet for a drift fix
 */
function generateFixSnippet(
  file: string,
  line: number | undefined,
  oldValue: string | undefined,
  newValue: string,
): string {
  const location = line ? `${file}:${line}` : file;
  const lines = [`// ${location}`];
  if (oldValue) {
    lines.push(`- ${oldValue}`);
  }
  lines.push(`+ ${newValue}`);
  return lines.join("\n");
}

/**
 * Format drift signals as AI-friendly JSON feedback
 */
export function formatAiFeedback(
  drifts: DriftSignal[],
  exitCode: number,
  summary: { critical: number; warning: number; info: number; total: number },
): string {
  const issues = drifts.map((drift) => {
    const location = drift.source.location || "";
    const [file, lineStr, colStr] = location.split(":");

    // Extract fix suggestion from details if available
    const suggestions = drift.details?.suggestions as string[] | undefined;
    const firstSuggestion = suggestions?.[0];
    const oldValue = drift.details?.actual as string | undefined;
    const fix = firstSuggestion
      ? {
          type: "replace" as const,
          old: oldValue,
          new: firstSuggestion,
          snippet: generateFixSnippet(
            file || drift.source.entityName,
            lineStr ? parseInt(lineStr, 10) : undefined,
            oldValue,
            firstSuggestion,
          ),
        }
      : undefined;

    return {
      file: file || drift.source.entityName,
      line: lineStr ? parseInt(lineStr, 10) : undefined,
      column: colStr ? parseInt(colStr, 10) : undefined,
      type: drift.type,
      severity: drift.severity,
      message: drift.message,
      entity: drift.source.entityName,
      current: drift.details?.actual,
      suggested: firstSuggestion || drift.details?.expected,
      fix,
    };
  });

  const output = {
    passed: exitCode === 0,
    issues,
    summary: {
      total: summary.total,
      critical: summary.critical,
      warning: summary.warning,
      info: summary.info,
      fixable: issues.filter((i) => i.fix).length,
    },
    instructions:
      exitCode === 0
        ? "All checks passed. Code is design system compliant."
        : [
            "Design system violations detected.",
            "Fix each issue by replacing the current value with the suggested token.",
            "Re-run `buoy check` after making changes to verify fixes.",
          ].join(" "),
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Get list of staged files from git
 */
export function getStagedFiles(): string[] {
  try {
    const output = execSync(
      "git diff --cached --name-only --diff-filter=ACMR",
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return output
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Filter files to only include scannable extensions
 */
export function filterScannableFiles(files: string[]): string[] {
  const scannableExtensions = [
    // React/JS
    ".tsx",
    ".jsx",
    ".ts",
    ".js",
    // Vue
    ".vue",
    // Svelte
    ".svelte",
    // Angular
    ".component.ts",
    // Templates
    ".blade.php",
    ".erb",
    ".twig",
    ".njk",
    ".html",
    // Tokens
    ".css",
    ".scss",
    ".json",
  ];

  return files.filter((file) =>
    scannableExtensions.some((ext) => file.endsWith(ext)),
  );
}

/**
 * Check if a drift signal is from a staged file
 */
export function isFromStagedFile(
  drift: DriftSignal,
  stagedFiles: string[],
): boolean {
  const location = drift.source.location;
  if (!location) return true; // Include drifts without location

  // Extract file path from location (format: "path/to/file.tsx:line")
  const filePath = location.split(":")[0];

  // Check if the file path matches any staged file
  if (!filePath) return true;

  return stagedFiles.some(
    (stagedFile) =>
      filePath === stagedFile ||
      filePath.endsWith(`/${stagedFile}`) ||
      stagedFile.endsWith(`/${filePath}`),
  );
}

/**
 * Calculate a simple maturity score based on tokens and drift
 */
function calculateMaturityScore(tokenCount: number, driftCount: number): number {
  // Base score from having tokens
  let score = Math.min(50, tokenCount * 5); // Up to 50 points for tokens

  // Penalty for drift
  const driftPenalty = Math.min(50, driftCount * 2);
  score += 50 - driftPenalty; // 50 points base minus drift penalty

  return Math.max(0, Math.min(100, score));
}

export function createCheckCommand(): Command {
  const cmd = new Command("check")
    .description("Fast drift check for pre-commit hooks")
    .option(
      "--fail-on <severity>",
      "Exit 1 if drift at this severity or higher: critical, warning, info, none",
      "critical",
    )
    .option("--staged", "Only check staged files (for pre-commit hooks)")
    .option("--quiet", "Suppress all output except errors")
    .option("-v, --verbose", "Show detailed output")
    .option(
      "--format <format>",
      "Output format: text, json, ai-feedback",
      "text",
    )
    .option("--preview-comment", "Preview what a PR comment would look like")
    .option("--report", "Report results to Buoy Cloud (requires login)")
    .option("--repo <repo>", "Repository name (owner/repo) for cloud reporting")
    .option("--pr <number>", "PR number for cloud reporting", parseInt)
    .option("--experimental", "Enable experimental features")
    .action(async (options) => {
      const log = options.quiet
        ? () => {}
        : options.verbose
          ? console.error.bind(console)
          : () => {};

      try {
        log("Loading configuration...");
        const existingConfigPath = getConfigPath();
        let config: BuoyConfig;

        if (existingConfigPath) {
          const loaded = await loadConfig();
          config = loaded.config;
          if (options.verbose) {
            log(`Using config: ${existingConfigPath}`);
          }
        } else {
          const auto = await buildAutoConfig(process.cwd());
          config = auto.config;
          log("No config found, using auto-detected settings");
        }

        // Get staged files if --staged flag is used
        let stagedFiles: string[] = [];
        if (options.staged) {
          stagedFiles = getStagedFiles();
          const scannableStaged = filterScannableFiles(stagedFiles);

          if (scannableStaged.length === 0) {
            log("No scannable files staged, skipping check");
            process.exit(0);
          }

          log(`Checking ${scannableStaged.length} staged file(s)...`);
        }

        log("Scanning for drift...");

        // Use consolidated drift analysis service
        const service = new DriftAnalysisService(config);
        const result = await service.analyze({
          onProgress: log,
          includeBaseline: false,
        });

        let drifts = result.drifts;

        // Filter to staged files only if --staged is used
        if (options.staged && stagedFiles.length > 0) {
          drifts = drifts.filter((d) => isFromStagedFile(d, stagedFiles));
        }

        // Determine exit code using shared utility
        const failOn = options.failOn as Severity | "none";
        const exitCode = hasDriftsAboveThreshold(drifts, failOn) ? 1 : 0;

        // Summary counts using shared utility
        const summary = calculateDriftSummary(drifts);

        // Cloud reporting if --report flag is used
        if (options.report) {
          if (!isLoggedIn()) {
            if (!options.quiet) {
              console.error("Error: Not logged in. Run `buoy ship login` first.");
            }
          } else if (!options.repo) {
            if (!options.quiet) {
              console.error("Error: --repo is required for cloud reporting.");
            }
          } else {
            log("Reporting to Buoy Cloud...");

            // Get git metadata
            const gitMeta = getGitMetadata(process.cwd());

            // Scan for tokens and components to include in report
            const orchestrator = new ScanOrchestrator(config, process.cwd());
            const scanStart = Date.now();
            const scanResults = await orchestrator.scan({
              onProgress: log,
            });
            const scanDuration = Date.now() - scanStart;

            // Convert drift signals to report format
            const driftSignals = drifts.map((d) => {
              const location = d.source.location || "";
              const [file, lineStr, colStr] = location.split(":");
              const suggestions = d.details?.suggestions as string[] | undefined;
              const firstSuggestion = suggestions?.[0];
              const actual = d.details?.actual as string | undefined;

              return {
                type: d.type,
                severity: d.severity as 'error' | 'warning' | 'info',
                file: file || d.source.entityName,
                line: lineStr ? parseInt(lineStr, 10) : 1,
                column: colStr ? parseInt(colStr, 10) : undefined,
                value: actual || '',
                message: d.message,
                suggestion: firstSuggestion ? {
                  token: firstSuggestion,
                  value: firstSuggestion,
                  confidence: 0.8,
                  replacement: firstSuggestion,
                } : undefined,
              };
            });

            // Build report input
            const reportInput: ScanReportInput = {
              repo: options.repo,
              commitSha: gitMeta.commitSha || 'unknown',
              branch: gitMeta.branch,
              prNumber: options.pr,
              scanDuration,
              tokens: scanResults.tokens.map((t: DesignToken) => ({
                name: t.name,
                value: typeof t.value === 'object' ? JSON.stringify(t.value) : String(t.value),
                source: t.source.type,
              })),
              components: scanResults.components.map((c: Component) => ({
                name: c.name,
                path: 'path' in c.source ? c.source.path : c.id,
                source: c.source.type,
              })),
              sources: [], // TODO: detect intent sources
              driftSignals,
              maturityScore: calculateMaturityScore(scanResults.tokens.length, drifts.length),
            };

            const reportResult = await submitScanReport(reportInput);

            if (reportResult.success) {
              log(`Reported to Buoy Cloud (${reportResult.scanId})`);

              // Output PR comment if available
              if (reportResult.prComment?.shouldComment && !options.quiet) {
                console.log("");
                console.log("--- PR Comment ---");
                console.log(reportResult.prComment.body);
                console.log("--- End PR Comment ---");
              }
            } else {
              if (!options.quiet) {
                console.error(`Cloud report failed: ${reportResult.error}`);
              }
            }
          }
        }

        // Handle --preview-comment flag
        if (options.previewComment) {
          console.log(generatePRCommentPreview(drifts, summary));
          process.exit(exitCode);
          return;
        }

        // Output based on format
        const format = options.format as OutputFormat;

        if (format === "ai-feedback") {
          console.log(formatAiFeedback(drifts, exitCode, summary));
          process.exit(exitCode);
          return;
        }

        if (format === "json") {
          console.log(
            JSON.stringify(
              {
                passed: exitCode === 0,
                drifts: drifts.map((d) => ({
                  id: d.id,
                  type: d.type,
                  severity: d.severity,
                  message: d.message,
                  source: d.source,
                  details: d.details,
                })),
                summary,
              },
              null,
              2,
            ),
          );
          process.exit(exitCode);
          return;
        }

        // Default text format
        if (!options.quiet) {
          if (exitCode === 0) {
            if (summary.total === 0) {
              console.log("+ No drift detected");
            } else {
              console.log(
                `+ Check passed (${summary.total} drift${summary.total !== 1 ? "s" : ""} below threshold)`,
              );
            }
          } else {
            console.log("x Drift detected");
            console.log("");
            console.log(`  Critical: ${summary.critical}`);
            console.log(`  Warning:  ${summary.warning}`);
            console.log(`  Info:     ${summary.info}`);

            if (options.verbose) {
              console.log("");
              console.log("Issues:");
              for (const drift of drifts.slice(0, 10)) {
                const sev =
                  drift.severity === "critical"
                    ? "!"
                    : drift.severity === "warning"
                      ? "~"
                      : "i";
                const loc = drift.source.location
                  ? ` (${drift.source.location})`
                  : "";
                console.log(
                  `  [${sev}] ${drift.source.entityName}: ${drift.message}${loc}`,
                );
              }
              if (drifts.length > 10) {
                console.log(`  ... and ${drifts.length - 10} more`);
              }
            }

            console.log("");
            console.log("Run `buoy show drift` for details");
          }

          // Show upgrade hint when check fails
          const hint = formatUpgradeHint('after-check-fail');
          if (hint) {
            console.log('');
            console.log(hint);
          }
        }

        process.exit(exitCode);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!options.quiet) {
          console.error(`Error: ${message}`);
        }
        process.exit(1);
      }
    });

  return cmd;
}
