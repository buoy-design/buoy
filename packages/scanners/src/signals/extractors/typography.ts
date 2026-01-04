import type { RawSignal, SignalContext } from '../types.js';
import { createSignalId } from '../types.js';

// Font size pattern
const FONT_SIZE_PATTERN = /^(\d+\.?\d*)(px|rem|em|pt|%)$/;

// Named font weights to numeric
const NAMED_WEIGHTS: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  normal: 400,
  regular: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

// Generic font families (fallbacks)
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
]);

// Values to skip
const SKIP_VALUES = new Set(['inherit', 'initial', 'unset']);

/**
 * Check if value is a token reference
 */
function isTokenReference(value: string): boolean {
  return (
    value.includes('var(--') ||
    value.includes('theme.') ||
    value.includes('tokens.') ||
    value.includes('$')
  );
}

/**
 * Extract font-size signals
 */
export function extractFontSizeSignals(
  value: string,
  path: string,
  line: number,
  context: SignalContext,
): RawSignal[] {
  if (isTokenReference(value) || SKIP_VALUES.has(value)) {
    return [];
  }

  const match = value.match(FONT_SIZE_PATTERN);
  if (!match) {
    return [];
  }

  const [, numStr, unit] = match;

  return [{
    id: createSignalId('font-size', path, line, value),
    type: 'font-size',
    value,
    location: { path, line },
    context,
    metadata: {
      numericValue: parseFloat(numStr!),
      unit,
    },
  }];
}

/**
 * Extract font-family signals
 */
export function extractFontFamilySignals(
  value: string,
  path: string,
  line: number,
  context: SignalContext,
): RawSignal[] {
  if (isTokenReference(value) || SKIP_VALUES.has(value)) {
    return [];
  }

  // Parse font family list
  const families: string[] = [];
  let fallback: string | undefined;

  // Split by comma, handling quotes
  const parts = value.split(',').map(s => s.trim());

  for (const part of parts) {
    // Remove quotes
    const cleaned = part.replace(/["']/g, '').trim();
    if (!cleaned) continue;

    if (GENERIC_FAMILIES.has(cleaned.toLowerCase())) {
      fallback = cleaned;
    } else {
      families.push(cleaned);
    }
  }

  if (families.length === 0 && !fallback) {
    return [];
  }

  return [{
    id: createSignalId('font-family', path, line, value),
    type: 'font-family',
    value,
    location: { path, line },
    context,
    metadata: {
      families,
      fallback,
    },
  }];
}

/**
 * Extract font-weight signals
 */
export function extractFontWeightSignals(
  value: string,
  path: string,
  line: number,
  context: SignalContext,
): RawSignal[] {
  if (isTokenReference(value) || SKIP_VALUES.has(value)) {
    return [];
  }

  let numericValue: number;
  let namedValue: string | undefined;

  // Check if it's a number
  const numMatch = value.match(/^\d+$/);
  if (numMatch) {
    numericValue = parseInt(value, 10);
  } else {
    // Check named weight
    const normalized = value.toLowerCase().replace(/[-_\s]/g, '');
    if (NAMED_WEIGHTS[normalized] !== undefined) {
      numericValue = NAMED_WEIGHTS[normalized];
      namedValue = value;
    } else {
      return [];
    }
  }

  return [{
    id: createSignalId('font-weight', path, line, value),
    type: 'font-weight',
    value,
    location: { path, line },
    context,
    metadata: {
      numericValue,
      namedValue,
    },
  }];
}
