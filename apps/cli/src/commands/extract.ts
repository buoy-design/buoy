import { Command } from 'commander';
import chalk from 'chalk';
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { relative } from 'path';
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
  type StyleMatch,
} from '@buoy-design/scanners';
import {
  parseCssValues,
  groupByCategory,
  type ExtractedValue,
} from '@buoy-design/core';

interface ExtractionResult {
  file: string;
  styles: StyleMatch[];
  values: ExtractedValue[];
}

interface ExtractionSummary {
  totalFiles: number;
  totalValues: number;
  byCategory: Record<string, { count: number; unique: number; top: string[] }>;
  results: ExtractionResult[];
}

export function createExtractCommand(): Command {
  const cmd = new Command('extract')
    .description('Extract hardcoded design values from templates and CSS')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Show all extracted values')
    .option('--css', 'Include CSS files in extraction')
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }
      const spin = spinner('Loading configuration...');

      try {
        const { config } = await loadConfig();
        const cwd = process.cwd();
        const results: ExtractionResult[] = [];

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
          const reactConfig = sources.react;
          const patterns = reactConfig.include || ['src/**/*.tsx', 'src/**/*.jsx'];
          const excludePatterns = reactConfig.exclude || [];

          spin.text = 'Finding React components...';

          for (const pattern of patterns) {
            const files = await glob(pattern, {
              cwd,
              ignore: excludePatterns,
              absolute: true,
            });
            for (const file of files) {
              filesToScan.push({ path: file, type: 'react' });
            }
          }
        }

        // Vue files
        if (sources.vue?.enabled) {
          const vueConfig = sources.vue;
          const patterns = vueConfig.include || ['src/**/*.vue'];
          const excludePatterns = vueConfig.exclude || [];

          spin.text = 'Finding Vue components...';

          for (const pattern of patterns) {
            const files = await glob(pattern, {
              cwd,
              ignore: excludePatterns,
              absolute: true,
            });
            for (const file of files) {
              filesToScan.push({ path: file, type: 'vue' });
            }
          }
        }

        // Angular files
        if (sources.angular?.enabled) {
          const angularConfig = sources.angular;
          const patterns = angularConfig.include || ['src/**/*.component.ts'];
          const excludePatterns = angularConfig.exclude || [];

          spin.text = 'Finding Angular components...';

          for (const pattern of patterns) {
            const files = await glob(pattern, {
              cwd,
              ignore: excludePatterns,
              absolute: true,
            });
            for (const file of files) {
              filesToScan.push({ path: file, type: 'angular' });
            }
          }
        }

        // Svelte files
        if (sources.svelte?.enabled) {
          const svelteConfig = sources.svelte;
          const patterns = svelteConfig.include || ['src/**/*.svelte'];
          const excludePatterns = svelteConfig.exclude || [];

          spin.text = 'Finding Svelte components...';

          for (const pattern of patterns) {
            const files = await glob(pattern, {
              cwd,
              ignore: excludePatterns,
              absolute: true,
            });
            for (const file of files) {
              filesToScan.push({ path: file, type: 'svelte' });
            }
          }
        }

        // CSS files (if --css flag is passed)
        if (options.css) {
          spin.text = 'Finding CSS files...';
          const cssPatterns = ['**/*.css', '**/*.scss'];
          const cssExclude = ['**/node_modules/**', '**/dist/**', '**/build/**'];

          for (const pattern of cssPatterns) {
            const files = await glob(pattern, {
              cwd,
              ignore: cssExclude,
              absolute: true,
            });
            for (const file of files) {
              filesToScan.push({ path: file, type: 'css' });
            }
          }
        }

        if (filesToScan.length === 0) {
          spin.stop();
          error('No files to extract from');
          info('Make sure you have sources enabled in buoy.config.mjs');
          info('Run ' + chalk.cyan('buoy init') + ' to set up your project');
          return;
        }

        // Extract from each file
        spin.text = `Extracting from ${filesToScan.length} files...`;
        let processedCount = 0;

        for (const { path: filePath, type } of filesToScan) {
          try {
            const content = await readFile(filePath, 'utf-8');

            // Extract styles based on template type
            const styles = type === 'css'
              ? extractCssFileStyles(content)
              : extractStyles(content, type);

            if (styles.length === 0) continue;

            // Parse CSS values from extracted styles
            const allValues: ExtractedValue[] = [];
            for (const style of styles) {
              const { values } = parseCssValues(style.css);
              // Add file location to each value
              for (const value of values) {
                value.line = style.line;
              }
              allValues.push(...values);
            }

            if (allValues.length > 0) {
              results.push({
                file: relative(cwd, filePath),
                styles,
                values: allValues,
              });
            }

            processedCount++;
            if (processedCount % 10 === 0) {
              spin.text = `Extracting... (${processedCount}/${filesToScan.length})`;
            }
          } catch (err) {
            // Skip files that can't be read
          }
        }

        spin.stop();

        // Summarize results
        const allValues = results.flatMap((r) => r.values);
        const grouped = groupByCategory(allValues);

        const summary: ExtractionSummary = {
          totalFiles: results.length,
          totalValues: allValues.length,
          byCategory: {},
          results,
        };

        for (const [category, values] of Object.entries(grouped)) {
          const uniqueValues = new Set(values.map((v) => v.value));
          const valueCounts = new Map<string, number>();
          for (const v of values) {
            valueCounts.set(v.value, (valueCounts.get(v.value) || 0) + 1);
          }
          const sortedByCount = [...valueCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([value, count]) => `${value} (${count}x)`);

          summary.byCategory[category] = {
            count: values.length,
            unique: uniqueValues.size,
            top: sortedByCount,
          };
        }

        // Output
        if (options.json) {
          console.log(JSON.stringify(summary, null, 2));
          return;
        }

        header('Extraction Results');
        newline();

        keyValue('Files scanned', String(filesToScan.length));
        keyValue('Files with values', String(results.length));
        keyValue('Total values extracted', String(allValues.length));
        newline();

        for (const [category, data] of Object.entries(summary.byCategory)) {
          header(category.charAt(0).toUpperCase() + category.slice(1) + 's');
          keyValue('Total occurrences', String(data.count));
          keyValue('Unique values', String(data.unique));
          if (data.top.length > 0) {
            info('Top values:');
            for (const value of data.top) {
              console.log(`  ${chalk.cyan(value)}`);
            }
          }
          newline();
        }

        if (options.verbose) {
          header('All Extracted Values');
          for (const result of results) {
            console.log(chalk.bold(result.file));
            for (const value of result.values) {
              console.log(`  ${chalk.gray(`L${value.line || '?'}:`)} ${value.property}: ${chalk.cyan(value.value)}`);
            }
            newline();
          }
        }

        success('Extraction complete');
        newline();
        info('Next steps:');
        info('  ' + chalk.cyan('buoy tokenize') + ' - Generate design tokens from extracted values');
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Extraction failed: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}
