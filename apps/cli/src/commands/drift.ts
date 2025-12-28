import { Command } from 'commander';
import { loadConfig } from '../config/loader.js';
import {
  spinner,
  success,
  error,
  info,
  warning,
  header,
  keyValue,
  newline,
} from '../output/reporters.js';
import {
  formatDriftTable,
  formatDriftList,
  formatJson,
  formatMarkdown,
} from '../output/formatters.js';
import type { DriftSignal, Severity } from '@buoy/core';

export function createDriftCommand(): Command {
  const cmd = new Command('drift')
    .description('Detect and manage design system drift');

  // drift check
  cmd
    .command('check')
    .description('Check for drift in the current project')
    .option('-s, --severity <level>', 'Filter by minimum severity (info, warning, critical)')
    .option('-t, --type <type>', 'Filter by drift type')
    .option('--json', 'Output as JSON')
    .option('--markdown', 'Output as Markdown')
    .option('--compact', 'Compact table output (less detail)')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options) => {
      const spin = spinner('Loading configuration...');

      try {
        const { config } = await loadConfig();
        spin.text = 'Scanning for drift...';

        // Import required modules
        const { ReactComponentScanner } = await import('@buoy/scanners/git');
        const { SemanticDiffEngine } = await import('@buoy/core/analysis');

        // First, scan components
        const sourceComponents: Awaited<ReturnType<typeof ReactComponentScanner.prototype.scan>>['items'] = [];

        if (config.sources.react?.enabled) {
          spin.text = 'Scanning React components...';
          const scanner = new ReactComponentScanner({
            projectRoot: process.cwd(),
            include: config.sources.react.include,
            exclude: config.sources.react.exclude,
            designSystemPackage: config.sources.react.designSystemPackage,
          });

          const result = await scanner.scan();
          sourceComponents.push(...result.items);
        }

        spin.text = 'Analyzing drift...';

        // Run semantic diff engine
        const engine = new SemanticDiffEngine();
        const diffResult = engine.analyzeComponents(sourceComponents, {
          checkDeprecated: true,
          checkNaming: true,
          checkDocumentation: true,
        });

        let drifts: DriftSignal[] = diffResult.drifts;

        // Apply filters
        if (options.severity) {
          const severityOrder: Record<Severity, number> = {
            info: 0,
            warning: 1,
            critical: 2,
          };
          const minSeverity = severityOrder[options.severity as Severity] || 0;
          drifts = drifts.filter(d => severityOrder[d.severity] >= minSeverity);
        }

        if (options.type) {
          drifts = drifts.filter(d => d.type === options.type);
        }

        // Apply ignore rules from config
        for (const ignoreRule of config.drift.ignore) {
          drifts = drifts.filter(d => {
            if (d.type !== ignoreRule.type) return true;
            if (!ignoreRule.pattern) return false;
            const regex = new RegExp(ignoreRule.pattern);
            return !regex.test(d.source.entityName);
          });
        }

        spin.stop();

        // Output results
        if (options.json) {
          console.log(formatJson({ drifts, summary: getSummary(drifts) }));
          return;
        }

        if (options.markdown) {
          console.log(formatMarkdown(drifts));
          return;
        }

        header('Drift Analysis');
        newline();

        const summary = getSummary(drifts);
        keyValue('Components scanned', String(sourceComponents.length));
        keyValue('Critical', String(summary.critical));
        keyValue('Warning', String(summary.warning));
        keyValue('Info', String(summary.info));
        newline();

        // Use compact table or detailed list
        if (options.compact) {
          console.log(formatDriftTable(drifts));
        } else {
          console.log(formatDriftList(drifts));
        }
        newline();

        if (summary.critical > 0) {
          warning(`${summary.critical} critical issues require attention.`);
        } else if (drifts.length === 0) {
          success('No drift detected. Your design system is aligned!');
        } else {
          info(`Found ${drifts.length} drift signals. Run with --compact for summary view.`);
        }
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Drift check failed: ${message}`);

        if (options.verbose) {
          console.error(err);
        }

        process.exit(1);
      }
    });

  // drift explain
  cmd
    .command('explain <driftId>')
    .description('Get detailed explanation for a drift signal')
    .action(async (driftId) => {
      info('Claude integration not yet implemented.');
      info(`To explain drift: ${driftId}`);
      info('Enable Claude in buoy.config.ts and ensure ANTHROPIC_API_KEY is set.');
    });

  // drift resolve
  cmd
    .command('resolve <driftId>')
    .description('Mark a drift signal as resolved')
    .option('-r, --resolution <type>', 'Resolution type (ignored, fixed, documented)', 'fixed')
    .option('-m, --message <message>', 'Resolution message')
    .action(async (driftId, options) => {
      info(`Marking drift ${driftId} as ${options.resolution}`);
      if (options.message) {
        info(`Reason: ${options.message}`);
      }
      success('Drift resolved (note: persistence not yet implemented)');
    });

  return cmd;
}

function getSummary(drifts: DriftSignal[]): { critical: number; warning: number; info: number } {
  return {
    critical: drifts.filter(d => d.severity === 'critical').length,
    warning: drifts.filter(d => d.severity === 'warning').length,
    info: drifts.filter(d => d.severity === 'info').length,
  };
}
