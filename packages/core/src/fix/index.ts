/**
 * Fix module - generates and applies fixes for drift signals
 */

// Re-export confidence scoring
export { scoreConfidence, scoreColorConfidence, scoreSpacingConfidence } from './confidence.js';
export type { ConfidenceResult } from './confidence.js';

// Re-export fix generator
export { generateFixes, summarizeFixes } from './generator.js';
