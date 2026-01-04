import type { RawSignal, SignalContext } from '../types.js';
import { createSignalId } from '../types.js';

// Spacing value pattern: number + unit
const SPACING_PATTERN = /^(-?\d+\.?\d*)(px|rem|em|%|vh|vw|vmin|vmax|ch|ex)$/;

// Values to skip
const SKIP_VALUES = new Set([
  '0',
  'auto',
  'inherit',
  'initial',
  'unset',
  'none',
  'fit-content',
  'max-content',
  'min-content',
]);

// Property to category mapping
const PROPERTY_CATEGORIES: Record<string, string> = {
  padding: 'padding',
  paddingTop: 'padding',
  paddingRight: 'padding',
  paddingBottom: 'padding',
  paddingLeft: 'padding',
  paddingInline: 'padding',
  paddingBlock: 'padding',
  margin: 'margin',
  marginTop: 'margin',
  marginRight: 'margin',
  marginBottom: 'margin',
  marginLeft: 'margin',
  marginInline: 'margin',
  marginBlock: 'margin',
  gap: 'gap',
  rowGap: 'gap',
  columnGap: 'gap',
  width: 'size',
  height: 'size',
  minWidth: 'size',
  minHeight: 'size',
  maxWidth: 'size',
  maxHeight: 'size',
  top: 'position',
  right: 'position',
  bottom: 'position',
  left: 'position',
  inset: 'position',
};

/**
 * Check if value is a token reference (should be skipped)
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
 * Extract spacing signals from a value
 */
export function extractSpacingSignals(
  value: string,
  path: string,
  line: number,
  property: string,
  context: SignalContext,
): RawSignal[] {
  // Skip token references
  if (isTokenReference(value)) {
    return [];
  }

  // Skip special values
  if (SKIP_VALUES.has(value)) {
    return [];
  }

  // Match spacing pattern
  const match = value.match(SPACING_PATTERN);
  if (!match) {
    return [];
  }

  const [, numStr, unit] = match;
  const numericValue = parseFloat(numStr!);

  const signal: RawSignal = {
    id: createSignalId('spacing-value', path, line, value),
    type: 'spacing-value',
    value,
    location: {
      path,
      line,
    },
    context,
    metadata: {
      numericValue,
      unit,
      property,
      category: PROPERTY_CATEGORIES[property] || 'other',
    },
  };

  return [signal];
}
