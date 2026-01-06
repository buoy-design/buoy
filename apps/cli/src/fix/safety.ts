/**
 * Safety Checks for Fix Application
 *
 * Validates that it's safe to apply fixes to source files.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Fix } from '@buoy-design/core';

export interface SafetyCheckResult {
  safe: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Default paths to exclude from fixes
 */
const DEFAULT_EXCLUDED_PATTERNS = [
  'node_modules/**',
  'dist/**',
  'build/**',
  '.next/**',
  '.nuxt/**',
  'coverage/**',
  '*.min.js',
  '*.min.css',
  'vendor/**',
  '.git/**',
];

/**
 * Run all safety checks before applying fixes
 */
export function runSafetyChecks(
  fixes: Fix[],
  cwd: string = process.cwd()
): SafetyCheckResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check git status
  const gitStatus = checkGitStatus(cwd);
  if (gitStatus.hasUncommittedChanges) {
    warnings.push(
      'You have uncommitted changes. Consider committing or stashing before applying fixes.'
    );
  }
  if (gitStatus.error) {
    warnings.push(`Could not check git status: ${gitStatus.error}`);
  }

  // Check for excluded paths
  for (const fix of fixes) {
    const relativePath = relative(cwd, resolve(cwd, fix.file));
    if (isExcludedPath(relativePath)) {
      errors.push(`Fix targets excluded path: ${fix.file}`);
    }
  }

  // Check files exist
  for (const fix of fixes) {
    const fullPath = resolve(cwd, fix.file);
    if (!existsSync(fullPath)) {
      errors.push(`File not found: ${fix.file}`);
    }
  }

  // Check for duplicate fixes on same location
  const locationMap = new Map<string, Fix[]>();
  for (const fix of fixes) {
    const key = `${fix.file}:${fix.line}:${fix.column}`;
    if (!locationMap.has(key)) {
      locationMap.set(key, []);
    }
    locationMap.get(key)!.push(fix);
  }

  for (const [location, locationFixes] of locationMap) {
    if (locationFixes.length > 1) {
      warnings.push(
        `Multiple fixes at ${location}: ${locationFixes.map((f) => f.id).join(', ')}`
      );
    }
  }

  return {
    safe: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Check git status in the given directory
 */
function checkGitStatus(cwd: string): {
  hasUncommittedChanges: boolean;
  error?: string;
} {
  try {
    const status = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return {
      hasUncommittedChanges: status.trim().length > 0,
    };
  } catch (error) {
    return {
      hasUncommittedChanges: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if a path matches any excluded patterns
 */
function isExcludedPath(
  path: string,
  excludePatterns: string[] = DEFAULT_EXCLUDED_PATTERNS
): boolean {
  for (const pattern of excludePatterns) {
    if (matchGlob(path, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Simple glob pattern matching
 */
function matchGlob(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*');

  // Match pattern at start, end, or with path separators
  const regex = new RegExp(`^${regexStr}$|/${regexStr}$|^${regexStr}/`);
  return regex.test(path);
}

/**
 * Validate fix targets are reasonable
 */
export function validateFixTargets(fixes: Fix[]): {
  valid: Fix[];
  invalid: Array<{ fix: Fix; reason: string }>;
} {
  const valid: Fix[] = [];
  const invalid: Array<{ fix: Fix; reason: string }> = [];

  for (const fix of fixes) {
    // Check line/column are positive
    if (fix.line < 1 || fix.column < 1) {
      invalid.push({
        fix,
        reason: `Invalid location: line ${fix.line}, column ${fix.column}`,
      });
      continue;
    }

    // Check original and replacement are different
    if (fix.original === fix.replacement) {
      invalid.push({
        fix,
        reason: 'Original and replacement are identical',
      });
      continue;
    }

    // Check file path is reasonable
    if (!fix.file || fix.file.includes('\0')) {
      invalid.push({
        fix,
        reason: 'Invalid file path',
      });
      continue;
    }

    valid.push(fix);
  }

  return { valid, invalid };
}

/**
 * Check if we're in a git repository
 */
export function isGitRepository(cwd: string = process.cwd()): boolean {
  try {
    execSync('git rev-parse --git-dir', {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}
