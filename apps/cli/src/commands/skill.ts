/**
 * buoy skill - Generate and manage design system skills for AI agents
 *
 * Exports tokens, components, patterns, and anti-patterns as markdown files
 * optimized for progressive disclosure in AI agent workflows.
 */

import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';

import { loadConfig, getConfigPath } from '../config/loader.js';
import { buildAutoConfig } from '../config/auto-detect.js';
import { ScanOrchestrator } from '../scan/orchestrator.js';
import {
  spinner,
  success,
  error as errorLog,
  info,
  keyValue,
  newline,
  setJsonMode,
} from '../output/reporters.js';
import { bulletList } from '../wizard/menu.js';
import { SkillExportService } from '../services/skill-export.js';
import type { BuoyConfig } from '../config/schema.js';

export function createSkillCommand(): Command {
  const cmd = new Command('skill').description(
    'Generate and manage design system skills for AI agents'
  );

  cmd.addCommand(createExportCommand());

  return cmd;
}

function createExportCommand(): Command {
  return new Command('spill')
    .alias('export')  // Keep 'export' as alias for backwards compatibility
    .description('Spill your design system as a skill for AI agents')
    .option(
      '-o, --output <path>',
      'Output directory',
      '.claude/skills/design-system'
    )
    .option('--global', 'Export to global skills directory (~/.claude/skills/)')
    .option(
      '--sections <sections>',
      'Sections to include (comma-separated)',
      'tokens,components,patterns,anti-patterns'
    )
    .option('--dry-run', 'Show what would be created without writing files')
    .option('--json', 'Output result as JSON')
    .action(async (options) => {
      const cwd = process.cwd();

      if (options.json) {
        setJsonMode(true);
      }

      const spin = spinner('Loading configuration...');

      try {
        // Load or auto-detect config
        let config: BuoyConfig;
        let projectName = 'design-system';

        const configPath = getConfigPath();
        if (configPath) {
          const result = await loadConfig();
          config = result.config;
          projectName = config.project?.name || 'design-system';
        } else {
          const autoResult = await buildAutoConfig(cwd);
          config = autoResult.config;
          projectName = config.project?.name || 'design-system';
        }

        // Scan components and tokens
        spin.text = 'Scanning components and tokens...';
        const orchestrator = new ScanOrchestrator(config, cwd);
        const scanResult = await orchestrator.scan({
          onProgress: (msg) => {
            spin.text = msg;
          },
        });

        // Run drift analysis
        spin.text = 'Analyzing for anti-patterns...';
        const { SemanticDiffEngine } = await import('@buoy-design/core/analysis');
        const engine = new SemanticDiffEngine();
        const diffResult = engine.analyzeComponents(scanResult.components, {
          checkDeprecated: true,
          checkNaming: true,
          checkDocumentation: true,
        });

        spin.stop();

        // Determine output path
        let outputPath: string;
        if (options.global) {
          outputPath = join(homedir(), '.claude', 'skills', 'design-system');
        } else {
          outputPath = resolve(cwd, options.output);
        }

        // Parse sections
        const sections = options.sections.split(',').map((s: string) => s.trim());

        // Generate skill files
        const exportService = new SkillExportService(projectName);
        const result = await exportService.export(
          {
            tokens: scanResult.tokens,
            components: scanResult.components,
            drifts: diffResult.drifts,
            projectName,
          },
          {
            sections,
            outputPath,
          }
        );

        // Handle dry-run
        if (options.dryRun) {
          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  dryRun: true,
                  outputPath,
                  files: result.files.map((f) => f.path),
                  stats: result.stats,
                },
                null,
                2
              )
            );
          } else {
            info('Dry run - files that would be created:');
            newline();
            for (const file of result.files) {
              console.log(`  ${file.path}`);
            }
            newline();
            keyValue('Total files', String(result.files.length));
            keyValue('Tokens', String(result.stats.tokens.total));
            keyValue('Components', String(result.stats.components));
            if (result.stats.patterns.length > 0) {
              keyValue('Patterns', result.stats.patterns.join(', '));
            }
          }
          return;
        }

        // Write files
        for (const file of result.files) {
          const dir = dirname(file.path);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          writeFileSync(file.path, file.content);
        }

        // Output results
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                outputPath,
                files: result.files.map((f) => f.path),
                stats: result.stats,
              },
              null,
              2
            )
          );
        } else {
          success(`Created skill at ${outputPath}`);
          newline();

          bulletList([
            `SKILL.md (entry point)`,
            `tokens/ (${result.stats.tokens.total} tokens)`,
            `components/ (${result.stats.components} components)`,
            result.stats.patterns.length > 0
              ? `patterns/ (${result.stats.patterns.join(', ')})`
              : 'patterns/',
            'anti-patterns/',
          ]);

          // No Dead Ends: Explain empty results and suggest next steps
          if (result.stats.tokens.total === 0 && result.stats.components === 0) {
            newline();
            info('The skill was created but is minimal because:');
            bulletList([
              'No design tokens were found',
              'No components were detected',
            ]);
            newline();
            info('To enrich the skill:');
            bulletList([
              'Run `buoy tokens` to extract tokens from hardcoded values',
              'Add a design-tokens.json or tokens.css file',
              'Ensure components are in src/components/ or similar paths',
            ]);
          } else if (result.stats.tokens.total === 0) {
            newline();
            info('Note: No tokens found. Run `buoy tokens` to extract from codebase.');
          } else if (result.stats.components === 0) {
            newline();
            info('Note: No components found. Ensure component files are in src/.');
          } else {
            newline();
            info('AI agents will now:');
            bulletList([
              'Load your design system skill when building UI',
              'See token rules in project context',
              'Get validation feedback from buoy check',
            ]);
          }

          newline();
          info('To update, run: buoy skill spill');
        }
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        errorLog(`Export failed: ${message}`);
        process.exit(1);
      }
    });
}
