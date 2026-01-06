/**
 * buoy learn - Analyze drift history to show repeat patterns
 *
 * Groups drifts by (type + component), surfaces patterns, and gives
 * personalized recommendations based on your mistakes.
 */

import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, getConfigPath } from "../config/loader.js";
import { buildAutoConfig } from "../config/auto-detect.js";
import {
  spinner,
  error,
  info,
  header,
  newline,
  setJsonMode,
} from "../output/reporters.js";
import type { BuoyConfig } from "../config/schema.js";
import { createStore, getProjectName } from "../store/index.js";
import type { DriftSignal } from "@buoy-design/core";

interface RepeatPattern {
  key: string;
  type: string;
  component: string;
  count: number;
  files: Set<string>;
  severity: "critical" | "warning" | "info";
  example: DriftSignal;
}

export function createLearnCommand(): Command {
  return new Command("learn")
    .description("Analyze drift history to show repeat patterns and learnings")
    .option("--json", "Output as JSON")
    .option("-n, --limit <number>", "Number of scans to analyze", "10")
    .option(
      "--threshold <number>",
      "Minimum occurrences to show (default: 2)",
      "2"
    )
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }
      const spin = spinner("Analyzing drift patterns...");

      try {
        // Load config for project name
        const configPath = getConfigPath();
        let config: BuoyConfig;

        if (configPath) {
          const result = await loadConfig();
          config = result.config;
        } else {
          const autoResult = await buildAutoConfig(process.cwd());
          config = autoResult.config;
        }

        const store = createStore();
        const projectName = config.project?.name || getProjectName();

        try {
          const project = await store.getOrCreateProject(projectName);
          const limit = parseInt(options.limit, 10) || 10;
          const threshold = parseInt(options.threshold, 10) || 2;
          const scans = await store.getScans(project.id, limit);

          if (scans.length === 0) {
            spin.stop();
            info(
              "No scan history found. Run " +
                chalk.cyan("buoy sweep") +
                " a few times to build up data."
            );
            store.close();
            return;
          }

          // Aggregate drifts across all scans
          const allDrifts: DriftSignal[] = [];
          for (const scan of scans) {
            if (scan.status === "completed") {
              const drifts = await store.getDriftSignals(scan.id);
              allDrifts.push(...drifts);
            }
          }

          spin.stop();

          if (allDrifts.length === 0) {
            console.log("");
            console.log(chalk.green.bold("  🎉 No drift patterns found!"));
            console.log("");
            console.log(chalk.dim("  Your code follows design system patterns consistently."));
            console.log("");
            store.close();
            return;
          }

          // Group by (type + component)
          const patterns = analyzeRepeatPatterns(allDrifts, threshold);

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  project: project.name,
                  scansAnalyzed: scans.length,
                  totalDrifts: allDrifts.length,
                  patterns: patterns.map((p) => ({
                    type: p.type,
                    component: p.component,
                    count: p.count,
                    files: Array.from(p.files),
                    severity: p.severity,
                    example: {
                      message: p.example.message,
                      details: p.example.details,
                    },
                  })),
                },
                null,
                2
              )
            );
            store.close();
            return;
          }

          // Display results
          header("Your Repeat Mistakes");
          newline();

          if (patterns.length === 0) {
            console.log(
              chalk.green("  No repeat patterns found above threshold.")
            );
            console.log(
              chalk.dim(
                `  (Analyzed ${allDrifts.length} drifts across ${scans.length} scans)`
              )
            );
            newline();
            store.close();
            return;
          }

          // Sort by count descending
          patterns.sort((a, b) => b.count - a.count);

          // Show top patterns
          for (const pattern of patterns.slice(0, 10)) {
            const badge =
              pattern.severity === "critical"
                ? chalk.red("●")
                : pattern.severity === "warning"
                  ? chalk.yellow("●")
                  : chalk.blue("●");

            const countStr = chalk.bold(`${pattern.count}x`);
            const typeStr = formatDriftType(pattern.type);
            const componentStr = pattern.component
              ? ` in ${chalk.cyan(pattern.component)}`
              : "";

            console.log(`${badge} ${typeStr}${componentStr} (${countStr})`);

            // Show affected files
            const files = Array.from(pattern.files).slice(0, 3);
            console.log(chalk.dim(`    Files: ${files.join(", ")}`));

            // Show fix suggestion
            const suggestions = pattern.example.details?.suggestions as
              | string[]
              | undefined;
            if (suggestions?.length) {
              console.log(
                chalk.dim(`    Fix: Use `) +
                  chalk.cyan(suggestions[0]) +
                  chalk.dim(` instead`)
              );
            } else if (pattern.example.details?.expected) {
              console.log(
                chalk.dim(`    Fix: Use `) +
                  chalk.cyan(pattern.example.details.expected) +
                  chalk.dim(` instead`)
              );
            }

            newline();
          }

          // Key insight
          const topPattern = patterns[0];
          if (topPattern) {
            console.log(chalk.bold("Key Insight"));
            console.log(chalk.dim("─".repeat(40)));
            console.log(
              `Your biggest issue is ${chalk.yellow(formatDriftType(topPattern.type))}` +
                (topPattern.component
                  ? ` in ${chalk.cyan(topPattern.component)}`
                  : "") +
                ` (${topPattern.count}x)`
            );
            newline();
          }

          // Summary
          console.log(chalk.dim(`Analyzed ${scans.length} scans, ${allDrifts.length} total drifts`));
          console.log(
            chalk.dim(
              `Found ${patterns.length} repeat pattern${patterns.length === 1 ? "" : "s"}`
            )
          );
          newline();

          store.close();
        } catch (storeErr) {
          spin.stop();
          store.close();
          const msg =
            storeErr instanceof Error ? storeErr.message : String(storeErr);
          error(`Failed to analyze: ${msg}`);

          info(
            "Run " + chalk.cyan("buoy sweep") + " first to build scan history."
          );
          process.exit(1);
        }
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Learn failed: ${message}`);
        process.exit(1);
      }
    });
}

/**
 * Analyze drifts and group by (type + component) to find repeat patterns
 */
function analyzeRepeatPatterns(
  drifts: DriftSignal[],
  threshold: number
): RepeatPattern[] {
  const patternMap = new Map<string, RepeatPattern>();

  for (const drift of drifts) {
    // Extract component name from entityName or source
    const component = extractComponentName(drift);
    const key = `${drift.type}:${component}`;

    let pattern = patternMap.get(key);
    if (!pattern) {
      pattern = {
        key,
        type: drift.type,
        component,
        count: 0,
        files: new Set(),
        severity: drift.severity,
        example: drift,
      };
      patternMap.set(key, pattern);
    }

    pattern.count++;

    // Track file
    const location = drift.source.location;
    if (location) {
      const file = location.split(":")[0];
      if (file) {
        pattern.files.add(file);
      }
    }

    // Keep highest severity
    if (
      drift.severity === "critical" ||
      (drift.severity === "warning" && pattern.severity === "info")
    ) {
      pattern.severity = drift.severity;
    }
  }

  // Filter by threshold
  return Array.from(patternMap.values()).filter((p) => p.count >= threshold);
}

/**
 * Extract component name from drift signal
 */
function extractComponentName(drift: DriftSignal): string {
  // Try entityName first
  const entityName = drift.source.entityName;
  if (entityName && !entityName.includes("/") && !entityName.includes(".")) {
    return entityName;
  }

  // Try to extract from location path
  const location = drift.source.location;
  if (location) {
    const file = location.split(":")[0];
    if (file) {
      // Extract filename without extension
      const parts = file.split("/");
      const filename = parts[parts.length - 1];
      if (filename) {
        // Remove extension and common suffixes
        return filename
          .replace(/\.(tsx?|jsx?|vue|svelte)$/, "")
          .replace(/\.(component|spec|test|stories)$/, "");
      }
    }
  }

  return entityName || "unknown";
}

/**
 * Format drift type for display
 */
function formatDriftType(type: string): string {
  return type
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
