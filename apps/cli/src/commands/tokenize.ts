import { Command } from 'commander';
import chalk from 'chalk';
import { glob } from 'glob';
import { readFile, writeFile } from 'fs/promises';
import { loadConfig } from '../config/loader.js';
import {
  spinner,
  success,
  error,
  info,
  header,
  keyValue,
  newline,
  setJsonMode,
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
  type GeneratedToken,
} from '@buoy-design/core';

export function createTokenizeCommand(): Command {
  const cmd = new Command('tokenize')
    .description('Generate design tokens from extracted values')
    .option('-o, --output <path>', 'Output file path (default: design-tokens.css)')
    .option('--json', 'Output as JSON instead of CSS')
    .option('--prefix <prefix>', 'Prefix for CSS custom properties')
    .option('--dry-run', 'Preview tokens without writing files')
    .option('--css', 'Include CSS files in extraction')
    .action(async (options) => {
      if (options.json && !options.output) {
        setJsonMode(true);
      }
      const spin = spinner('Loading configuration...');

      try {
        const { config } = await loadConfig();
        const cwd = process.cwd();
        const allValues: ExtractedValue[] = [];

        // Determine what to scan from config
        const sources = config.sources || {};

        // Collect files to scan
        const filesToScan: { path: string; type: TemplateType }[] = [];

        // Template files
        if (sources.templates?.enabled) {
          const templateConfig = sources.templates;
          const patterns = templateConfig.include || [];
          const excludePatterns = templateConfig.exclude || [];
          const templateType = templateConfig.type as TemplateType;

          spin.text = `Finding ${templateType} templates...`;

          for (const pattern of patterns) {
            const files = await glob(pattern, {
              cwd,
              ignore: excludePatterns,
              absolute: true,
            });
            for (const file of files) {
              filesToScan.push({ path: file, type: templateType });
            }
          }
        }

        // React files
        if (sources.react?.enabled) {
          const patterns = sources.react.include || ['src/**/*.tsx', 'src/**/*.jsx'];
          const excludePatterns = sources.react.exclude || [];

          for (const pattern of patterns) {
            const files = await glob(pattern, { cwd, ignore: excludePatterns, absolute: true });
            for (const file of files) {
              filesToScan.push({ path: file, type: 'react' });
            }
          }
        }

        // Vue files
        if (sources.vue?.enabled) {
          const patterns = sources.vue.include || ['src/**/*.vue'];
          const excludePatterns = sources.vue.exclude || [];

          for (const pattern of patterns) {
            const files = await glob(pattern, { cwd, ignore: excludePatterns, absolute: true });
            for (const file of files) {
              filesToScan.push({ path: file, type: 'vue' });
            }
          }
        }

        // CSS files
        if (options.css) {
          spin.text = 'Finding CSS files...';
          const cssPatterns = ['**/*.css'];
          const cssExclude = ['**/node_modules/**', '**/dist/**', '**/build/**'];

          for (const pattern of cssPatterns) {
            const files = await glob(pattern, { cwd, ignore: cssExclude, absolute: true });
            for (const file of files) {
              filesToScan.push({ path: file, type: 'css' });
            }
          }
        }

        if (filesToScan.length === 0) {
          spin.stop();
          error('No files to extract from');
          info('Make sure you have sources enabled in buoy.config.mjs');
          return;
        }

        // Extract values from all files
        spin.text = `Extracting from ${filesToScan.length} files...`;

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
          error('No design values found');
          info('Run ' + chalk.cyan('buoy extract') + ' to see what values are detected');
          return;
        }

        spin.text = 'Generating tokens...';

        // Generate tokens
        const result = generateTokens(allValues, {
          prefix: options.prefix || '',
        });

        spin.stop();

        // Output
        if (options.json && !options.output) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // Show summary
        header('Token Generation Summary');
        newline();

        keyValue('Total values analyzed', String(result.stats.total));
        keyValue('Tokens generated', String(result.tokens.length));
        newline();

        // Show detailed stats per category
        for (const [category, stats] of Object.entries(result.stats.byCategory)) {
          const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1);
          header(`${categoryTitle} Breakdown`);

          console.log(`  ${chalk.gray('Input values:')}     ${stats.input}`);
          console.log(`  ${chalk.gray('Unique values:')}    ${stats.uniqueValues}`);
          console.log(`  ${chalk.gray('After clustering:')} ${stats.clustered}`);
          console.log(`  ${chalk.green('→ Tokenized:')}      ${stats.tokenized}`);

          if (stats.dropped > 0) {
            console.log(`  ${chalk.yellow('→ Dropped:')}        ${stats.dropped} (kept top ${stats.tokenized} by frequency)`);
            if (stats.droppedValues.length > 0) {
              const preview = stats.droppedValues.slice(0, 5);
              console.log(`    ${chalk.gray(preview.join(', '))}${stats.droppedValues.length > 5 ? ` +${stats.droppedValues.length - 5} more` : ''}`);
            }
          }
          newline();
        }

        // Show generated tokens
        header('Generated Tokens');

        // Group tokens by category
        const byCategory: Record<string, GeneratedToken[]> = {};
        for (const token of result.tokens) {
          if (!byCategory[token.category]) {
            byCategory[token.category] = [];
          }
          byCategory[token.category]!.push(token);
        }

        for (const [category, tokens] of Object.entries(byCategory)) {
          console.log(chalk.bold(`  ${category}:`));
          for (const token of tokens) {
            console.log(`    ${chalk.cyan(`--${token.name}`)}: ${token.value} ${chalk.gray(`(${token.occurrences}x)`)}`);
          }
        }
        newline()

        // Write output
        if (!options.dryRun) {
          const outputPath = options.output || 'design-tokens.css';
          const content = options.json
            ? JSON.stringify(result.json, null, 2)
            : result.css;

          await writeFile(outputPath, content, 'utf-8');
          success(`Tokens written to ${chalk.cyan(outputPath)}`);
        } else {
          info('Dry run - no files written');
          newline();
          header('Generated CSS');
          console.log(result.css);
        }

        newline();
        info('Next steps:');
        info('  1. Import the tokens in your CSS: ' + chalk.cyan('@import "design-tokens.css";'));
        info('  2. Replace hardcoded values with CSS variables');
        info('  3. Run ' + chalk.cyan('buoy drift check') + ' to detect future drift');
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Token generation failed: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}
