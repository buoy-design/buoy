/**
 * Context Command
 *
 * Generates design system context for CLAUDE.md files.
 * Helps AI agents understand and follow design system rules.
 */

import { Command } from 'commander';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, getConfigPath } from '../config/loader.js';
import { buildAutoConfig } from '../config/auto-detect.js';
import {
  spinner,
  success,
  error,
  warning,
  info,
  setJsonMode,
} from '../output/reporters.js';
import { ScanOrchestrator } from '../scan/orchestrator.js';
import {
  generateContext,
  type DetailLevel,
  type ContextData,
} from '../services/context-generator.js';
import type { BuoyConfig } from '../config/schema.js';

export function createContextCommand(): Command {
  const cmd = new Command('context')
    .description('Generate design system context for CLAUDE.md')
    .option('-o, --output <path>', 'Output file path (default: stdout)')
    .option('--append', 'Append to CLAUDE.md in current directory')
    .option(
      '-d, --detail <level>',
      'Detail level: minimal, standard, comprehensive',
      'standard'
    )
    .option('--no-tokens', 'Exclude token information')
    .option('--no-components', 'Exclude component information')
    .option('--no-validation', 'Exclude validation commands')
    .option('--json', 'Output as JSON with stats')
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

        // Scan for tokens and components
        spin.text = 'Scanning design system...';
        const orchestrator = new ScanOrchestrator(config, process.cwd());
        const scanResult = await orchestrator.scan();

        // Run drift analysis to get anti-patterns
        spin.text = 'Analyzing drift...';
        const { SemanticDiffEngine } = await import('@buoy-design/core/analysis');
        const engine = new SemanticDiffEngine();
        const diffResult = engine.analyzeComponents(scanResult.components, {
          availableTokens: scanResult.tokens,
        });

        // Get project name
        const projectName = await getProjectName(process.cwd());

        // Prepare context data
        const contextData: ContextData = {
          tokens: scanResult.tokens,
          components: scanResult.components,
          drifts: diffResult.drifts,
          projectName,
        };

        // Validate detail level
        const detailLevel = validateDetailLevel(options.detail);

        // Generate context
        spin.text = 'Generating context...';
        const result = generateContext(contextData, {
          detailLevel,
          includeTokens: options.tokens,
          includeComponents: options.components,
          includeValidation: options.validation,
        });

        spin.stop();

        // Handle output
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                content: result.content,
                stats: result.stats,
                detailLevel,
              },
              null,
              2
            )
          );
          return;
        }

        if (options.append) {
          await handleAppend(result.content, process.cwd());
          return;
        }

        if (options.output) {
          await writeFile(options.output, result.content, 'utf-8');
          success(`Context written to ${options.output}`);
          showStats(result.stats);
          return;
        }

        // Default: stdout
        console.log(result.content);
      } catch (err) {
        spin.stop();
        error(err instanceof Error ? err.message : 'Context generation failed');
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Get project name from package.json or directory name
 */
async function getProjectName(cwd: string): Promise<string> {
  const packageJsonPath = join(cwd, 'package.json');

  if (existsSync(packageJsonPath)) {
    try {
      const content = await readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      if (pkg.name) {
        // Clean up package name (remove scope, capitalize)
        const name = pkg.name.replace(/^@[^/]+\//, '');
        return name
          .split('-')
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Fall back to directory name
  const parts = cwd.split('/');
  const dirName = parts[parts.length - 1] || 'Project';
  return dirName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Validate and normalize detail level
 */
function validateDetailLevel(level: string): DetailLevel {
  const normalized = level.toLowerCase();
  if (normalized === 'minimal' || normalized === 'standard' || normalized === 'comprehensive') {
    return normalized;
  }
  return 'standard';
}

/**
 * Handle append mode - append to CLAUDE.md
 */
async function handleAppend(content: string, cwd: string): Promise<void> {
  const claudeMdPath = join(cwd, 'CLAUDE.md');

  if (existsSync(claudeMdPath)) {
    // Check if design system section already exists
    const existing = await readFile(claudeMdPath, 'utf-8');
    if (existing.includes('## Design System Rules')) {
      warning('CLAUDE.md already has a Design System Rules section.');
      info('To update, manually remove the existing section first.');
      return;
    }

    // Append with separator
    const toAppend = '\n\n---\n\n' + content;
    await appendFile(claudeMdPath, toAppend, 'utf-8');
    success('Design system context appended to CLAUDE.md');
  } else {
    // Create new CLAUDE.md
    const header = `# Project Instructions

This file provides guidance to AI tools working with this codebase.

`;
    await writeFile(claudeMdPath, header + content, 'utf-8');
    success('Created CLAUDE.md with design system context');
  }
}

/**
 * Show stats after generation
 */
function showStats(stats: { tokenCount: number; componentCount: number; antiPatternCount: number }): void {
  info(`Included: ${stats.tokenCount} tokens, ${stats.componentCount} components`);
  if (stats.antiPatternCount > 0) {
    info(`Found ${stats.antiPatternCount} anti-patterns from drift analysis`);
  }
}
