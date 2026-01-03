/**
 * CSS Scanner
 *
 * Scans a project for CSS files and analyzes them for hardcoded values.
 */

import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { analyzeCss, mergeAnalyses, type CssAnalysis } from './analyzer.js';

export interface CssScannerOptions {
  projectRoot: string;
  include?: string[];
  exclude?: string[];
}

export interface CssScanResult {
  analysis: CssAnalysis;
  files: string[];
  errors: Array<{ file: string; message: string }>;
}

const DEFAULT_INCLUDE = [
  '**/*.css',
  '**/*.scss',
  '**/*.sass',
  '**/*.less'
];

const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/vendor/**',
  '**/*.min.css',
  '**/coverage/**'
];

export class CssScanner {
  private options: Required<CssScannerOptions>;

  constructor(options: CssScannerOptions) {
    this.options = {
      projectRoot: options.projectRoot,
      include: options.include || DEFAULT_INCLUDE,
      exclude: options.exclude || DEFAULT_EXCLUDE
    };
  }

  async scan(): Promise<CssScanResult> {
    const files: string[] = [];
    const errors: Array<{ file: string; message: string }> = [];
    const analyses: CssAnalysis[] = [];

    // Find all CSS files
    for (const pattern of this.options.include) {
      const matches = await glob(pattern, {
        cwd: this.options.projectRoot,
        ignore: this.options.exclude,
        nodir: true
      });
      files.push(...matches);
    }

    // Dedupe
    const uniqueFiles = [...new Set(files)];

    // Analyze each file
    for (const file of uniqueFiles) {
      try {
        const fullPath = join(this.options.projectRoot, file);
        const content = await readFile(fullPath, 'utf-8');
        const analysis = analyzeCss(content, file);
        analyses.push(analysis);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ file, message });
      }
    }

    // Merge all analyses
    const mergedAnalysis = analyses.length > 0
      ? mergeAnalyses(analyses)
      : createEmptyAnalysis();

    return {
      analysis: mergedAnalysis,
      files: uniqueFiles,
      errors
    };
  }
}

function createEmptyAnalysis(): CssAnalysis {
  return {
    colors: new Map(),
    spacing: new Map(),
    fonts: new Map(),
    stats: {
      uniqueColors: 0,
      uniqueSpacing: 0,
      uniqueFonts: 0,
      totalDeclarations: 0,
      cssVariableUsage: 0,
      hardcodedUsage: 0,
      tokenizationScore: 0
    },
    topColors: [],
    topSpacing: [],
    suggestedPalette: [],
    suggestedSpacingScale: [4, 8, 12, 16, 24, 32, 48, 64]
  };
}
