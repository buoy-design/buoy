/**
 * Fix module for CLI
 *
 * Provides fix application, safety checks, and diff generation.
 */

export { applyFixes, generateFixDiff, generateFullDiff } from './applier.js';
export type { ApplyFixesResult } from './applier.js';

export {
  runSafetyChecks,
  validateFixTargets,
  isGitRepository,
} from './safety.js';
export type { SafetyCheckResult } from './safety.js';
