/**
 * CSS Value Parser
 * Extracts design values (colors, spacing, fonts, radii) from CSS text.
 * Framework-agnostic - works on any CSS string.
 */

export interface ExtractedValue {
  property: string;
  value: string;
  rawValue: string;
  category: 'color' | 'spacing' | 'font-size' | 'font-family' | 'radius' | 'other';
  line?: number;
  column?: number;
}

export interface ParseResult {
  values: ExtractedValue[];
  errors: string[];
}

// CSS color keywords (subset of most common)
const CSS_COLORS = new Set([
  'transparent', 'currentcolor', 'inherit',
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple',
  'pink', 'brown', 'gray', 'grey', 'cyan', 'magenta', 'lime', 'maroon',
  'navy', 'olive', 'teal', 'aqua', 'fuchsia', 'silver',
]);

// Properties that accept color values
const COLOR_PROPERTIES = new Set([
  'color', 'background', 'background-color', 'border-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'text-decoration-color', 'fill', 'stroke',
  'box-shadow', 'text-shadow', 'caret-color', 'accent-color',
]);

// Properties that accept spacing values
const SPACING_PROPERTIES = new Set([
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap', 'row-gap', 'column-gap', 'grid-gap',
  'top', 'right', 'bottom', 'left',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'inset', 'inset-block', 'inset-inline',
]);

// Properties for font sizes
const FONT_SIZE_PROPERTIES = new Set(['font-size']);

// Properties for border radius
const RADIUS_PROPERTIES = new Set([
  'border-radius',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
]);

/**
 * Parse CSS text and extract design values
 */
export function parseCssValues(cssText: string): ParseResult {
  const values: ExtractedValue[] = [];
  const errors: string[] = [];

  // Match property: value pairs
  const propertyRegex = /([a-z-]+)\s*:\s*([^;{}]+)/gi;
  let match;

  while ((match = propertyRegex.exec(cssText)) !== null) {
    const property = match[1]?.toLowerCase().trim();
    const rawValue = match[2]?.trim();
    if (!property || !rawValue) continue;

    // Skip CSS variables and calc expressions for now
    if (rawValue.startsWith('var(') || rawValue.startsWith('calc(')) {
      continue;
    }

    const category = categorizeProperty(property);
    if (category === 'other') continue;

    // For color properties, extract color values
    if (category === 'color') {
      const colors = extractColorValues(rawValue);
      for (const color of colors) {
        values.push({
          property,
          value: color,
          rawValue,
          category: 'color',
        });
      }
    }
    // For spacing/font-size/radius, extract numeric values
    else {
      const numerics = extractNumericValues(rawValue);
      for (const numeric of numerics) {
        values.push({
          property,
          value: numeric,
          rawValue,
          category,
        });
      }
    }
  }

  return { values, errors };
}

/**
 * Categorize a CSS property
 */
function categorizeProperty(property: string): ExtractedValue['category'] {
  if (COLOR_PROPERTIES.has(property)) return 'color';
  if (SPACING_PROPERTIES.has(property)) return 'spacing';
  if (FONT_SIZE_PROPERTIES.has(property)) return 'font-size';
  if (RADIUS_PROPERTIES.has(property)) return 'radius';
  if (property === 'font-family') return 'font-family';
  return 'other';
}

/**
 * Extract color values from a CSS value string
 */
function extractColorValues(value: string): string[] {
  const colors: string[] = [];

  // Hex colors: #rgb, #rrggbb, #rrggbbaa
  const hexRegex = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi;
  let match;
  while ((match = hexRegex.exec(value)) !== null) {
    colors.push(match[0].toLowerCase());
  }

  // RGB/RGBA
  const rgbRegex = /rgba?\s*\([^)]+\)/gi;
  while ((match = rgbRegex.exec(value)) !== null) {
    colors.push(normalizeRgb(match[0]));
  }

  // HSL/HSLA
  const hslRegex = /hsla?\s*\([^)]+\)/gi;
  while ((match = hslRegex.exec(value)) !== null) {
    colors.push(match[0].toLowerCase());
  }

  // OKLCH
  const oklchRegex = /oklch\s*\([^)]+\)/gi;
  while ((match = oklchRegex.exec(value)) !== null) {
    colors.push(match[0].toLowerCase());
  }

  // Named colors (only if no other colors found)
  if (colors.length === 0) {
    const words = value.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (CSS_COLORS.has(word)) {
        colors.push(word);
      }
    }
  }

  return colors;
}

/**
 * Extract numeric values with units from a CSS value string
 */
function extractNumericValues(value: string): string[] {
  const numerics: string[] = [];

  // Match numbers with units: 16px, 1.5rem, 0.5em, etc.
  const numericRegex = /(-?\d*\.?\d+)(px|rem|em|%|vh|vw|ch|ex|vmin|vmax)\b/gi;
  let match;
  while ((match = numericRegex.exec(value)) !== null) {
    numerics.push(match[0].toLowerCase());
  }

  // Also match unitless 0
  if (/\b0\b/.test(value) && numerics.length === 0) {
    numerics.push('0');
  }

  return numerics;
}

/**
 * Normalize RGB color format
 */
function normalizeRgb(rgb: string): string {
  return rgb.toLowerCase().replace(/\s+/g, '');
}

/**
 * Normalize a hex color to 6-digit format
 */
export function normalizeHexColor(hex: string): string {
  hex = hex.toLowerCase();
  if (hex.length === 4) {
    // #rgb → #rrggbb
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

/**
 * Convert hex to RGB values
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  hex = normalizeHexColor(hex).replace('#', '');
  if (hex.length !== 6) return null;

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  return { r, g, b };
}

/**
 * Parse a spacing value to pixels (approximate for rem/em)
 */
export function spacingToPx(value: string, baseFontSize = 16): number | null {
  const match = value.match(/^(-?\d*\.?\d+)(px|rem|em)?$/i);
  if (!match || !match[1]) return null;

  const num = parseFloat(match[1]);
  const unit = (match[2] ?? 'px').toLowerCase();

  switch (unit) {
    case 'px':
      return num;
    case 'rem':
    case 'em':
      return num * baseFontSize;
    default:
      return null;
  }
}

/**
 * Group extracted values by category
 */
export function groupByCategory(values: ExtractedValue[]): Record<string, ExtractedValue[]> {
  const grouped: Record<string, ExtractedValue[]> = {};

  for (const value of values) {
    const category = value.category;
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category]!.push(value);
  }

  return grouped;
}

/**
 * Count occurrences of each unique value
 */
export function countOccurrences(values: ExtractedValue[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const v of values) {
    const key = `${v.category}:${v.value}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return counts;
}
