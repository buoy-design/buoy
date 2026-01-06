import { Command } from 'commander';
import { writeFileSync } from 'fs';
import { resolve, relative } from 'path';
import chalk from 'chalk';
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { getConfigPath } from '../config/loader.js';
import { buildAutoConfig } from '../config/auto-detect.js';
import { detectFrameworks } from '../detect/frameworks.js';
import {
  spinner,
  success,
  error,
  info,
  header,
  newline,
  keyValue,
} from '../output/reporters.js';
import {
  extractStyles,
  extractCssFileStyles,
  type TemplateType,
} from '@buoy-design/scanners';
import {
  parseCssValues,
  generateTokens,
  type ExtractedValue,
} from '@buoy-design/core';

export function createTokensCommand(): Command {
  const cmd = new Command('tokens')
    .description('Generate design tokens from your codebase')
    .option('-o, --output <path>', 'Output file path (auto-detected if not specified)')
    .option('--format <format>', 'Output format: css, json, tailwind, ai-context (auto-detected if not specified)')
    .option('--dry-run', 'Preview without writing files')
    .option('--prefix <prefix>', 'Prefix for CSS custom properties (e.g., "ds-")')
    .action(async (options) => {
      const spin = spinner('Analyzing codebase...');

      try {
        const cwd = process.cwd();

        // Auto-detect project setup
        const frameworks = await detectFrameworks(cwd);
        const hasTailwind = frameworks.some(f => f.name === 'tailwind');

        // Determine format (auto-detect or user-specified)
        const format = options.format || (hasTailwind ? 'tailwind' : 'css');

        // Determine output path (auto-detect or user-specified)
        const defaultOutput = format === 'tailwind'
          ? 'buoy.tokens.js'
          : format === 'json'
            ? 'design-tokens.json'
            : format === 'ai-context'
              ? 'tokens-ai-context.json'
              : 'design-tokens.css';
        const outputPath = resolve(cwd, options.output || defaultOutput);

        // Get config (or auto-detect)
        let config;
        const configPath = getConfigPath();
        if (configPath) {
          const { loadConfig } = await import('../config/loader.js');
          const result = await loadConfig();
          config = result.config;
        } else {
          const autoResult = await buildAutoConfig(cwd);
          config = autoResult.config;

          spin.stop();
          console.log(chalk.cyan.bold('⚡ Zero-config mode'));
          console.log(chalk.dim('   Auto-detected:'));
          for (const d of autoResult.detected) {
            console.log(`   ${chalk.green('•')} ${d.name}`);
          }
          console.log('');
          spin.start();
        }

        // Collect files to scan
        spin.text = 'Finding source files...';
        const filesToScan: { path: string; type: TemplateType | 'css' }[] = [];
        const sources = config.sources || {};

        // Component files (React, Vue, Svelte, etc.)
        const componentSources = [
          { key: 'react', patterns: sources.react?.include || ['src/**/*.tsx', 'src/**/*.jsx'] },
          { key: 'vue', patterns: sources.vue?.include || ['src/**/*.vue'] },
          { key: 'svelte', patterns: sources.svelte?.include || ['src/**/*.svelte'] },
        ];

        for (const { key, patterns } of componentSources) {
          if (sources[key as keyof typeof sources]?.enabled !== false) {
            for (const pattern of patterns) {
              const files = await glob(pattern, {
                cwd,
                ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.*', '**/*.stories.*'],
                absolute: true
              });
              for (const file of files) {
                filesToScan.push({ path: file, type: key as TemplateType });
              }
            }
          }
        }

        // Template files
        if (sources.templates?.enabled) {
          const patterns = sources.templates.include || [];
          for (const pattern of patterns) {
            const files = await glob(pattern, {
              cwd,
              ignore: sources.templates.exclude || [],
              absolute: true
            });
            for (const file of files) {
              filesToScan.push({ path: file, type: sources.templates.type as TemplateType });
            }
          }
        }

        // CSS/SCSS files (always scan)
        const cssPatterns = ['**/*.css', '**/*.scss'];
        const cssIgnore = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.min.css'];

        for (const pattern of cssPatterns) {
          const files = await glob(pattern, { cwd, ignore: cssIgnore, absolute: true });
          for (const file of files) {
            filesToScan.push({ path: file, type: 'css' });
          }
        }

        if (filesToScan.length === 0) {
          spin.stop();
          error('No source files found');
          info('Make sure you have CSS, React, Vue, or other component files in your project.');
          return;
        }

        // Extract values from all files
        spin.text = `Scanning ${filesToScan.length} files...`;
        const allValues: ExtractedValue[] = [];

        for (const { path: filePath, type } of filesToScan) {
          try {
            const content = await readFile(filePath, 'utf-8');
            const styles = type === 'css'
              ? extractCssFileStyles(content)
              : extractStyles(content, type);

            for (const style of styles) {
              const { values } = parseCssValues(style.css);
              allValues.push(...values);
            }
          } catch {
            // Skip files that can't be read
          }
        }

        if (allValues.length === 0) {
          spin.stop();
          info('No hardcoded design values found');
          console.log('');
          info('This could mean:');
          info('  • Your codebase already uses design tokens');
          info('  • Values are using CSS variables or theme objects');
          console.log('');
          success('Your codebase looks clean!');
          return;
        }

        // Generate tokens
        spin.text = 'Generating tokens...';
        const result = generateTokens(allValues, {
          prefix: options.prefix || '',
        });

        spin.stop();

        // Summary
        newline();
        header('Token Generation');
        newline();

        keyValue('Files scanned', String(filesToScan.length));
        keyValue('Values found', String(result.stats.total));
        keyValue('Tokens generated', String(result.tokens.length));

        const { coverage } = result.stats;
        const coverageColor = coverage.percentage >= 80 ? chalk.green :
                              coverage.percentage >= 60 ? chalk.yellow :
                              chalk.red;
        keyValue('Coverage', `${coverageColor(coverage.percentage + '%')}`);
        newline();

        // Show tokens by category
        const byCategory: Record<string, typeof result.tokens> = {};
        for (const token of result.tokens) {
          if (!byCategory[token.category]) {
            byCategory[token.category] = [];
          }
          byCategory[token.category]!.push(token);
        }

        for (const [category, tokens] of Object.entries(byCategory)) {
          console.log(`  ${chalk.bold(category)}: ${tokens.length} tokens`);
        }
        newline();

        // Write or preview
        if (options.dryRun) {
          info('Dry run - no files written');
          newline();
          header('Preview');
          console.log(chalk.dim(getOutput(result, format).slice(0, 800)));
          if (getOutput(result, format).length > 800) {
            console.log(chalk.dim('...'));
          }
        } else {
          const content = getOutput(result, format);
          writeFileSync(outputPath, content, 'utf-8');
          success(`Created ${chalk.cyan(relative(cwd, outputPath))}`);
          newline();

          // Next steps based on format
          if (format === 'css') {
            info('Next: Import in your CSS:');
            console.log(chalk.cyan(`  @import "${relative(cwd, outputPath)}";`));
          } else if (format === 'tailwind') {
            info('Next: Add to your tailwind.config.js:');
            console.log(chalk.cyan(`  const tokens = require("./${relative(cwd, outputPath)}");`));
            console.log(chalk.cyan('  // Spread into theme.extend'));
          } else if (format === 'ai-context') {
            info('Next: Use this file for AI agent context:');
            console.log(chalk.cyan(`  • Add to .claude/skills/design-system/tokens/`));
            console.log(chalk.cyan(`  • Or reference in CLAUDE.md`));
          } else {
            info('Next: Import tokens in your build system');
          }
        }

        // Hint to save config if auto-detected
        if (!configPath) {
          newline();
          console.log(chalk.dim('─'.repeat(50)));
          console.log(
            chalk.dim('💡 ') +
              'Run ' +
              chalk.cyan('buoy dock') +
              ' to save configuration'
          );
        }
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Token generation failed: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}

function getOutput(
  result: ReturnType<typeof generateTokens>,
  format: string
): string {
  switch (format) {
    case 'json':
      return JSON.stringify(result.json, null, 2);
    case 'tailwind':
      return generateTailwindOutput(result);
    case 'ai-context':
      return generateAIContextOutput(result);
    default:
      return result.css;
  }
}

/**
 * Generate AI context format output.
 * This format includes intent metadata to help AI understand token usage.
 */
function generateAIContextOutput(result: ReturnType<typeof generateTokens>): string {
  interface AIToken {
    $value: string;
    $type: string;
    $intent?: {
      hierarchy?: string;
      relationship?: string;
      density?: string;
    };
    $usage?: string;
    $avoid?: string;
    $examples?: string[];
    $deprecated?: boolean;
  }

  const tokens: Record<string, Record<string, AIToken>> = {
    color: {},
    spacing: {},
    typography: {},
    radius: {},
  };

  // Color intent mapping based on naming patterns
  const getColorIntent = (name: string): { hierarchy?: string; usage?: string; avoid?: string } => {
    const lower = name.toLowerCase();
    if (lower.includes('primary')) {
      return {
        hierarchy: 'primary-action',
        usage: 'Primary CTAs, submit buttons, main actions',
        avoid: 'Decorative elements, backgrounds, secondary text',
      };
    }
    if (lower.includes('secondary')) {
      return {
        hierarchy: 'secondary-action',
        usage: 'Secondary buttons, less prominent actions',
        avoid: 'Primary call-to-action contexts',
      };
    }
    if (lower.includes('error') || lower.includes('danger') || lower.includes('destructive')) {
      return {
        hierarchy: 'destructive',
        usage: 'Error states, delete actions, warnings',
        avoid: 'Success states, neutral information',
      };
    }
    if (lower.includes('success') || lower.includes('positive')) {
      return {
        hierarchy: 'positive-feedback',
        usage: 'Success messages, confirmations, positive states',
        avoid: 'Primary actions, warnings',
      };
    }
    if (lower.includes('warning') || lower.includes('caution')) {
      return {
        hierarchy: 'cautionary',
        usage: 'Warning messages, pending states, caution indicators',
        avoid: 'Success or error states',
      };
    }
    if (lower.includes('muted') || lower.includes('subtle') || lower.includes('disabled')) {
      return {
        hierarchy: 'de-emphasized',
        usage: 'Disabled states, placeholder text, subtle backgrounds',
        avoid: 'Interactive elements, important information',
      };
    }
    return {};
  };

  // Spacing intent mapping
  const getSpacingIntent = (value: string): { relationship?: string; density?: string; usage?: string } => {
    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) return {};

    if (numericValue <= 4) {
      return {
        relationship: 'tightly-coupled',
        density: 'compact',
        usage: 'Between inline elements, tight groupings',
      };
    }
    if (numericValue <= 8) {
      return {
        relationship: 'related-elements',
        density: 'standard',
        usage: 'Between related form fields, list items',
      };
    }
    if (numericValue <= 16) {
      return {
        relationship: 'grouped-sections',
        density: 'comfortable',
        usage: 'Card padding, section margins',
      };
    }
    if (numericValue <= 32) {
      return {
        relationship: 'distinct-sections',
        density: 'spacious',
        usage: 'Between major page sections',
      };
    }
    return {
      relationship: 'page-level',
      density: 'expansive',
      usage: 'Page margins, major layout gaps',
    };
  };

  for (const token of result.tokens) {
    const category = token.category === 'font-size' ? 'typography' : token.category;
    const targetCategory = tokens[category] || (tokens[category] = {});

    const aiToken: AIToken = {
      $value: token.value,
      $type: token.category,
      $deprecated: false,
    };

    // Add intent based on category
    if (category === 'color') {
      const intent = getColorIntent(token.name);
      if (intent.hierarchy) {
        aiToken.$intent = { hierarchy: intent.hierarchy };
      }
      if (intent.usage) aiToken.$usage = intent.usage;
      if (intent.avoid) aiToken.$avoid = intent.avoid;
      aiToken.$examples = [`className="text-${token.name}"`, `style={{ color: tokens.${token.name} }}`];
    } else if (category === 'spacing') {
      const intent = getSpacingIntent(token.value);
      if (intent.relationship || intent.density) {
        aiToken.$intent = {
          relationship: intent.relationship,
          density: intent.density,
        };
      }
      if (intent.usage) aiToken.$usage = intent.usage;
      aiToken.$examples = [`className="p-${token.name}"`, `style={{ padding: tokens.${token.name} }}`];
    } else if (category === 'radius') {
      aiToken.$usage = 'Border radius for rounded corners';
      aiToken.$examples = [`className="rounded-${token.name}"`, `style={{ borderRadius: tokens.${token.name} }}`];
    } else if (category === 'typography') {
      aiToken.$usage = 'Font size for text elements';
      aiToken.$examples = [`className="text-${token.name}"`, `style={{ fontSize: tokens.${token.name} }}`];
    }

    targetCategory[token.name] = aiToken;
  }

  const output = {
    $schema: 'https://buoy.design/schemas/ai-context-tokens.json',
    version: '1.0',
    generatedAt: new Date().toISOString(),
    generatedBy: 'buoy tokens --format ai-context',
    tokens,
    rules: {
      colors: 'NEVER hardcode hex colors. Always use color tokens.',
      spacing: 'NEVER use arbitrary pixel values. Use spacing scale tokens.',
      typography: 'NEVER hardcode font sizes. Use typography tokens.',
      radius: 'NEVER hardcode border-radius. Use radius tokens.',
    },
    validation: {
      command: 'buoy check',
      description: 'Run before committing to validate design system compliance',
    },
  };

  return JSON.stringify(output, null, 2);
}

function generateTailwindOutput(result: ReturnType<typeof generateTokens>): string {
  const colors: Record<string, string> = {};
  const spacing: Record<string, string> = {};
  const fontSize: Record<string, string> = {};
  const borderRadius: Record<string, string> = {};

  for (const token of result.tokens) {
    const name = token.name.replace(/^(color|spacing|text|radius)-/, '');

    switch (token.category) {
      case 'color':
        colors[name] = token.value;
        break;
      case 'spacing':
      case 'sizing':
        spacing[name] = token.value;
        break;
      case 'font-size':
        fontSize[name] = token.value;
        break;
      case 'radius':
        borderRadius[name] = token.value;
        break;
    }
  }

  return `// Generated by buoy tokens
// Import and spread into your tailwind.config.js theme.extend

module.exports = {
  colors: ${JSON.stringify(colors, null, 4)},
  spacing: ${JSON.stringify(spacing, null, 4)},
  fontSize: ${JSON.stringify(fontSize, null, 4)},
  borderRadius: ${JSON.stringify(borderRadius, null, 4)},
};
`;
}
