/**
 * Fix Command
 *
 * Suggests and applies fixes for hardcoded values by replacing them with design tokens.
 */

import { Command } from 'commander';
import { loadConfig, getConfigPath } from '../config/loader.js';
import { buildAutoConfig } from '../config/auto-detect.js';
import {
  spinner,
  success,
  error,
  warning,
  setJsonMode,
} from '../output/reporters.js';
import {
  formatFixPreview,
  formatFixDiff,
  formatFixResult,
  formatSafetyCheck,
  formatFixesJson,
} from '../output/fix-formatters.js';
import { ScanOrchestrator } from '../scan/orchestrator.js';
import { applyFixes, runSafetyChecks, validateFixTargets } from '../fix/index.js';
import {
  generateFixes,
  type Fix,
  type ConfidenceLevel,
  type DesignToken,
  type DriftSignal,
} from '@buoy-design/core';
import type { BuoyConfig } from '../config/schema.js';

export function createFixCommand(): Command {
  const cmd = new Command('fix')
    .description('Suggest and apply fixes for design drift issues')
    .option('--apply', 'Apply fixes to source files')
    .option('--dry-run', 'Show detailed diff without applying changes')
    .option(
      '-c, --confidence <level>',
      'Minimum confidence level (high, medium, low)',
      'high'
    )
    .option(
      '-t, --type <types>',
      'Fix types to include (comma-separated: hardcoded-color,hardcoded-spacing)',
    )
    .option('-f, --file <patterns>', 'File glob patterns to include (comma-separated)')
    .option('--exclude <patterns>', 'File glob patterns to exclude (comma-separated)')
    .option('--backup', 'Create .bak backup files before modifying')
    .option('--json', 'Output as JSON')
    .option('--force', 'Skip safety checks')
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }

      const spin = spinner('Loading configuration...');

      try {
        // Load or auto-detect config
        const existingConfigPath = getConfigPath();
        let config: BuoyConfig;

        if (existingConfigPath) {
          const result = await loadConfig();
          config = result.config;
        } else {
          spin.text = 'Auto-detecting project setup...';
          const autoResult = await buildAutoConfig(process.cwd());
          config = autoResult.config;
        }

        // Run scan to get drift signals and tokens
        spin.text = 'Scanning for drift signals...';
        const orchestrator = new ScanOrchestrator(config, process.cwd());
        const scanResult = await orchestrator.scan();

        // Get tokens from scan
        const tokens = scanResult.tokens || [];

        if (tokens.length === 0) {
          spin.stop();
          warning('No design tokens found. Run `buoy scan` to detect tokens first.');
          return;
        }

        // Run drift analysis to get hardcoded value signals
        spin.text = 'Analyzing for hardcoded values...';
        const { SemanticDiffEngine } = await import('@buoy-design/core/analysis');
        const engine = new SemanticDiffEngine();
        const components = scanResult.components || [];

        // Pass availableTokens to get token suggestions for hardcoded values
        const diffResult = engine.analyzeComponents(components, {
          availableTokens: tokens as DesignToken[],
        });

        // Get drift signals (hardcoded values specifically)
        const driftSignals: DriftSignal[] = diffResult.drifts.filter(
          (d) => d.type.startsWith('hardcoded-')
        );

        if (driftSignals.length === 0) {
          spin.stop();
          success('No hardcoded values found - nothing to fix');
          return;
        }

        // Parse options
        const minConfidence = parseConfidenceLevel(options.confidence);
        const includeTypes = options.type
          ? options.type.split(',').map((t: string) => t.trim())
          : undefined;
        const includeFiles = options.file
          ? options.file.split(',').map((f: string) => f.trim())
          : [];
        const excludeFiles = options.exclude
          ? options.exclude.split(',').map((f: string) => f.trim())
          : [];

        // Generate fixes
        spin.text = 'Generating fix suggestions...';
        const fixes = generateFixes(driftSignals as DriftSignal[], tokens as DesignToken[], {
          types: includeTypes,
          minConfidence,
          includeFiles,
          excludeFiles,
        });

        spin.stop();

        if (fixes.length === 0) {
          success('No fixable issues found matching your criteria');
          return;
        }

        // Validate fix targets
        const { valid, invalid } = validateFixTargets(fixes);
        if (invalid.length > 0) {
          warning(`${invalid.length} fixes have invalid targets and will be skipped`);
        }

        // Output based on mode
        if (options.json) {
          console.log(formatFixesJson(valid));
          return;
        }

        if (options.apply) {
          // Apply mode: actually modify files
          await handleApplyMode(valid, options);
        } else if (options.dryRun) {
          // Dry-run mode: show detailed diff
          console.log(formatFixDiff(valid));
        } else {
          // Default preview mode
          console.log(formatFixPreview(valid));
        }
      } catch (err) {
        spin.stop();
        error(err instanceof Error ? err.message : 'Fix command failed');
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Handle apply mode - run safety checks and apply fixes
 */
async function handleApplyMode(
  fixes: Fix[],
  options: { backup?: boolean; force?: boolean; confidence?: string }
): Promise<void> {
  // Run safety checks unless forced
  if (!options.force) {
    const safetyResult = runSafetyChecks(fixes);
    console.log(formatSafetyCheck(safetyResult));

    if (!safetyResult.safe) {
      error('Safety checks failed. Use --force to override.');
      process.exit(1);
    }

    if (safetyResult.warnings.length > 0) {
      console.log('');
      warning('Proceeding despite warnings...');
      console.log('');
    }
  }

  // Apply fixes
  const spin = spinner('Applying fixes...');
  const minConfidence = parseConfidenceLevel(options.confidence || 'high');

  try {
    const result = await applyFixes(fixes, {
      dryRun: false,
      backup: options.backup,
      minConfidence,
    });

    spin.stop();
    console.log(formatFixResult(result));

    if (result.failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    spin.stop();
    error(err instanceof Error ? err.message : 'Failed to apply fixes');
    process.exit(1);
  }
}

/**
 * Parse confidence level from string
 */
function parseConfidenceLevel(level: string): ConfidenceLevel {
  const normalized = level.toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized;
  }
  return 'high';
}
