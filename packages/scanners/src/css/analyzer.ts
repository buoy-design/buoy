/**
 * CSS Analyzer
 *
 * Extracts and analyzes all hardcoded values from CSS files.
 * Used to diagnose design system maturity and suggest tokens.
 */

export interface ColorValue {
  value: string;
  normalized: string; // lowercase hex
  property: string;
  line: number;
  file?: string;
  count: number;
}

export interface SpacingValue {
  value: string;
  numericValue: number;
  unit: string;
  property: string;
  line: number;
  file?: string;
  count: number;
}

export interface FontValue {
  value: string;
  property: string;
  line: number;
  file?: string;
  count: number;
}

export interface CssAnalysis {
  colors: Map<string, ColorValue>;
  spacing: Map<string, SpacingValue>;
  fonts: Map<string, FontValue>;

  // Statistics
  stats: {
    uniqueColors: number;
    uniqueSpacing: number;
    uniqueFonts: number;
    totalDeclarations: number;
    cssVariableUsage: number;
    hardcodedUsage: number;
    tokenizationScore: number; // 0-100, higher = more tokenized
  };

  // Top offenders
  topColors: ColorValue[];
  topSpacing: SpacingValue[];

  // Suggestions
  suggestedPalette: string[];
  suggestedSpacingScale: number[];
}

// Color patterns
const HEX_COLOR = /#([0-9a-fA-F]{3,8})\b/g;
const RGB_COLOR = /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)/gi;
// const HSL_COLOR = /hsla?\s*\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?(?:\s*,\s*[\d.]+)?\s*\)/gi;
const NAMED_COLORS = /\b(transparent|currentColor|inherit|initial|unset|white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|brown|cyan|magenta|lime|navy|teal|olive|maroon|silver|aqua|fuchsia)\b/gi;

// Spacing patterns (with unit)
const SPACING_VALUE = /:\s*([\d.]+)(px|rem|em|%|vh|vw|vmin|vmax)\b/g;

// CSS variable usage
const CSS_VARIABLE = /var\s*\(\s*--[^)]+\)/g;

// Properties that typically use colors
const COLOR_PROPERTIES = [
  'color', 'background', 'background-color', 'border', 'border-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline', 'outline-color', 'box-shadow', 'text-shadow', 'fill', 'stroke',
  'text-decoration-color', 'caret-color', 'column-rule-color'
];

// Properties that typically use spacing
const SPACING_PROPERTIES = [
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap', 'row-gap', 'column-gap', 'top', 'right', 'bottom', 'left',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'font-size', 'line-height', 'letter-spacing', 'border-radius', 'border-width'
];

/**
 * Normalize a color to lowercase 6-digit hex
 */
function normalizeColor(color: string): string {
  const lower = color.toLowerCase().trim();

  // Already hex
  if (lower.startsWith('#')) {
    const hex = lower.slice(1);
    if (hex.length === 3) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }
    if (hex.length === 6) {
      return `#${hex}`;
    }
    if (hex.length === 8) {
      return `#${hex.slice(0, 6)}`; // Drop alpha
    }
    return lower;
  }

  // RGB(A)
  const rgbMatch = lower.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]!, 10).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2]!, 10).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3]!, 10).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  // Named colors - convert to hex
  const namedColorMap: Record<string, string> = {
    'white': '#ffffff', 'black': '#000000', 'red': '#ff0000',
    'green': '#008000', 'blue': '#0000ff', 'yellow': '#ffff00',
    'orange': '#ffa500', 'purple': '#800080', 'pink': '#ffc0cb',
    'gray': '#808080', 'grey': '#808080', 'brown': '#a52a2a',
    'cyan': '#00ffff', 'magenta': '#ff00ff', 'lime': '#00ff00',
    'navy': '#000080', 'teal': '#008080', 'olive': '#808000',
    'maroon': '#800000', 'silver': '#c0c0c0', 'aqua': '#00ffff',
    'fuchsia': '#ff00ff', 'transparent': 'transparent',
    'currentcolor': 'currentColor', 'inherit': 'inherit',
    'initial': 'initial', 'unset': 'unset'
  };

  return namedColorMap[lower] || lower;
}

/**
 * Parse a CSS declaration to extract property and value
 */
function parseDeclaration(line: string): { property: string; value: string } | null {
  const match = line.match(/^\s*([a-z-]+)\s*:\s*(.+?)\s*;?\s*$/i);
  if (!match) return null;
  return { property: match[1]!.toLowerCase(), value: match[2]! };
}

/**
 * Analyze CSS content and extract all hardcoded values
 */
export function analyzeCss(content: string, filePath?: string): CssAnalysis {
  const colors = new Map<string, ColorValue>();
  const spacing = new Map<string, SpacingValue>();
  const fonts = new Map<string, FontValue>();

  let totalDeclarations = 0;
  let cssVariableUsage = 0;
  let hardcodedUsage = 0;

  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;
    const decl = parseDeclaration(line);
    if (!decl) continue;

    totalDeclarations++;

    // Check for CSS variable usage
    if (CSS_VARIABLE.test(decl.value)) {
      cssVariableUsage++;
      CSS_VARIABLE.lastIndex = 0;
      continue;
    }

    // Extract colors
    if (COLOR_PROPERTIES.some(p => decl.property.includes(p))) {
      // Hex colors
      let match;
      HEX_COLOR.lastIndex = 0;
      while ((match = HEX_COLOR.exec(decl.value)) !== null) {
        const normalized = normalizeColor(match[0]);
        const existing = colors.get(normalized);
        if (existing) {
          existing.count++;
        } else {
          colors.set(normalized, {
            value: match[0],
            normalized,
            property: decl.property,
            line: lineNum + 1,
            file: filePath,
            count: 1
          });
        }
        hardcodedUsage++;
      }

      // RGB colors
      RGB_COLOR.lastIndex = 0;
      while ((match = RGB_COLOR.exec(decl.value)) !== null) {
        const normalized = normalizeColor(match[0]);
        const existing = colors.get(normalized);
        if (existing) {
          existing.count++;
        } else {
          colors.set(normalized, {
            value: match[0],
            normalized,
            property: decl.property,
            line: lineNum + 1,
            file: filePath,
            count: 1
          });
        }
        hardcodedUsage++;
      }

      // Named colors (excluding special keywords)
      NAMED_COLORS.lastIndex = 0;
      while ((match = NAMED_COLORS.exec(decl.value)) !== null) {
        const name = match[0].toLowerCase();
        if (['transparent', 'currentcolor', 'inherit', 'initial', 'unset'].includes(name)) continue;

        const normalized = normalizeColor(name);
        const existing = colors.get(normalized);
        if (existing) {
          existing.count++;
        } else {
          colors.set(normalized, {
            value: match[0],
            normalized,
            property: decl.property,
            line: lineNum + 1,
            file: filePath,
            count: 1
          });
        }
        hardcodedUsage++;
      }
    }

    // Extract spacing
    if (SPACING_PROPERTIES.some(p => decl.property === p || decl.property.startsWith(p + '-'))) {
      SPACING_VALUE.lastIndex = 0;
      let match;
      while ((match = SPACING_VALUE.exec(`: ${decl.value}`)) !== null) {
        const numericValue = parseFloat(match[1]!);
        const unit = match[2]!;
        const key = `${numericValue}${unit}`;

        const existing = spacing.get(key);
        if (existing) {
          existing.count++;
        } else {
          spacing.set(key, {
            value: key,
            numericValue,
            unit,
            property: decl.property,
            line: lineNum + 1,
            file: filePath,
            count: 1
          });
        }
        hardcodedUsage++;
      }
    }

    // Extract fonts
    if (decl.property === 'font-family') {
      const fontValue = decl.value.split(',')[0]?.trim().replace(/["']/g, '');
      if (fontValue) {
        const existing = fonts.get(fontValue);
        if (existing) {
          existing.count++;
        } else {
          fonts.set(fontValue, {
            value: fontValue,
            property: decl.property,
            line: lineNum + 1,
            file: filePath,
            count: 1
          });
        }
      }
    }
  }

  // Calculate tokenization score
  const totalStyleUsage = cssVariableUsage + hardcodedUsage;
  const tokenizationScore = totalStyleUsage > 0
    ? Math.round((cssVariableUsage / totalStyleUsage) * 100)
    : 0;

  // Sort by count for top offenders
  const topColors = [...colors.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const topSpacing = [...spacing.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Generate suggested palette (cluster similar colors)
  const suggestedPalette = generateSuggestedPalette(topColors);

  // Generate suggested spacing scale
  const suggestedSpacingScale = generateSpacingScale(topSpacing);

  return {
    colors,
    spacing,
    fonts,
    stats: {
      uniqueColors: colors.size,
      uniqueSpacing: spacing.size,
      uniqueFonts: fonts.size,
      totalDeclarations,
      cssVariableUsage,
      hardcodedUsage,
      tokenizationScore
    },
    topColors,
    topSpacing,
    suggestedPalette,
    suggestedSpacingScale
  };
}

/**
 * Merge multiple CSS analyses into one
 */
export function mergeAnalyses(analyses: CssAnalysis[]): CssAnalysis {
  const colors = new Map<string, ColorValue>();
  const spacing = new Map<string, SpacingValue>();
  const fonts = new Map<string, FontValue>();

  let totalDeclarations = 0;
  let cssVariableUsage = 0;
  let hardcodedUsage = 0;

  for (const analysis of analyses) {
    totalDeclarations += analysis.stats.totalDeclarations;
    cssVariableUsage += analysis.stats.cssVariableUsage;
    hardcodedUsage += analysis.stats.hardcodedUsage;

    for (const [key, value] of analysis.colors) {
      const existing = colors.get(key);
      if (existing) {
        existing.count += value.count;
      } else {
        colors.set(key, { ...value });
      }
    }

    for (const [key, value] of analysis.spacing) {
      const existing = spacing.get(key);
      if (existing) {
        existing.count += value.count;
      } else {
        spacing.set(key, { ...value });
      }
    }

    for (const [key, value] of analysis.fonts) {
      const existing = fonts.get(key);
      if (existing) {
        existing.count += value.count;
      } else {
        fonts.set(key, { ...value });
      }
    }
  }

  const totalStyleUsage = cssVariableUsage + hardcodedUsage;
  const tokenizationScore = totalStyleUsage > 0
    ? Math.round((cssVariableUsage / totalStyleUsage) * 100)
    : 0;

  const topColors = [...colors.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const topSpacing = [...spacing.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    colors,
    spacing,
    fonts,
    stats: {
      uniqueColors: colors.size,
      uniqueSpacing: spacing.size,
      uniqueFonts: fonts.size,
      totalDeclarations,
      cssVariableUsage,
      hardcodedUsage,
      tokenizationScore
    },
    topColors,
    topSpacing,
    suggestedPalette: generateSuggestedPalette(topColors),
    suggestedSpacingScale: generateSpacingScale(topSpacing)
  };
}

/**
 * Generate a suggested color palette from analyzed colors
 * Clusters similar colors and picks the most common representative
 */
function generateSuggestedPalette(topColors: ColorValue[]): string[] {
  if (topColors.length === 0) return [];

  // Simple clustering: group colors by hue similarity
  const palette: string[] = [];
  const used = new Set<string>();

  for (const color of topColors) {
    if (used.has(color.normalized)) continue;

    // Check if this color is too similar to one already in palette
    const isTooSimilar = palette.some(p => colorDistance(p, color.normalized) < 30);
    if (!isTooSimilar) {
      palette.push(color.normalized);
      used.add(color.normalized);
    }

    if (palette.length >= 12) break; // Max 12 colors for simplicity
  }

  return palette;
}

/**
 * Calculate color distance (simple RGB Euclidean)
 */
function colorDistance(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return Infinity;

  return Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
    Math.pow(rgb1.g - rgb2.g, 2) +
    Math.pow(rgb1.b - rgb2.b, 2)
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return null;
  return {
    r: parseInt(match[1]!, 16),
    g: parseInt(match[2]!, 16),
    b: parseInt(match[3]!, 16)
  };
}

/**
 * Generate a suggested spacing scale from analyzed spacing values
 */
function generateSpacingScale(topSpacing: SpacingValue[]): number[] {
  // Filter to px values and sort
  const pxValues = topSpacing
    .filter(s => s.unit === 'px')
    .map(s => s.numericValue)
    .sort((a, b) => a - b);

  if (pxValues.length === 0) return [4, 8, 12, 16, 24, 32, 48, 64];

  // Try to find a base unit (most common divisor)
  const base = findBaseUnit(pxValues);

  // Generate scale based on base
  const scale: number[] = [];
  for (let i = 1; i <= 16; i++) {
    const value = base * i;
    if (value <= 128) {
      scale.push(value);
    }
  }

  return scale.slice(0, 10);
}

/**
 * Find the most likely base unit from a set of values
 */
function findBaseUnit(values: number[]): number {
  // Common base units to check
  const candidates = [4, 8, 5, 6, 10];

  let bestBase = 4;
  let bestScore = 0;

  for (const base of candidates) {
    let score = 0;
    for (const value of values) {
      if (value % base === 0) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestBase = base;
    }
  }

  return bestBase;
}
