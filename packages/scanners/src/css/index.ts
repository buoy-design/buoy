/**
 * CSS Analysis Module
 *
 * Analyzes CSS files to extract hardcoded values and diagnose
 * design system maturity.
 */

export {
  analyzeCss,
  mergeAnalyses,
  type CssAnalysis,
  type ColorValue,
  type SpacingValue,
  type FontValue
} from './analyzer.js';

export {
  CssScanner,
  type CssScannerOptions,
  type CssScanResult
} from './scanner.js';
