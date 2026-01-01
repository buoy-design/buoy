/**
 * Directive Style Extractor
 * Extracts style bindings from Angular and Vue templates.
 * Covers: Angular [style.x]="...", [style.x.unit]="...", [ngStyle]="...", Vue :style="..."
 */

import type { StyleMatch } from './html-style.js';

/**
 * CSS units supported by Angular [style.property.unit] syntax
 */
const CSS_UNITS = new Set([
  'px',
  'em',
  'rem',
  'vh',
  'vw',
  'vmin',
  'vmax',
  '%',
  'pt',
  'pc',
  'in',
  'cm',
  'mm',
  'ex',
  'ch',
  'fr',
  'deg',
  'rad',
  'grad',
  'turn',
  's',
  'ms',
]);

/**
 * Extract Angular-style property bindings
 * [style.color]="'red'" or [style.background-color]="bgColor"
 * [style.height.px]="100" (with unit suffix)
 * [style.--custom-prop]="value" (CSS custom properties)
 * '[style.x]': 'value' (host binding syntax in decorators)
 */
export function extractAngularStyleBindings(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;
    let match;

    // Match [style.property]="value" with double quotes
    // Handles: regular props, hyphenated props, CSS custom properties (--var)
    const doubleQuoteRegex =
      /\[style\.((?:--)?[a-zA-Z][a-zA-Z0-9-]*)(?:\.([a-zA-Z%]+))?\]\s*=\s*"([^"]*)"/g;

    while ((match = doubleQuoteRegex.exec(line)) !== null) {
      const prop = match[1];
      const unit = match[2];
      let value = match[3];

      if (!prop || value === undefined) continue;

      matches.push(
        processAngularMatch(prop, unit, value, lineNum, match.index)
      );
    }

    // Match [style.property]='value' with single quotes (less common)
    const singleQuoteRegex =
      /\[style\.((?:--)?[a-zA-Z][a-zA-Z0-9-]*)(?:\.([a-zA-Z%]+))?\]\s*=\s*'([^']*)'/g;

    while ((match = singleQuoteRegex.exec(line)) !== null) {
      const prop = match[1];
      const unit = match[2];
      let value = match[3];

      if (!prop || value === undefined) continue;

      matches.push(
        processAngularMatch(prop, unit, value, lineNum, match.index)
      );
    }

    // Match Angular host binding syntax: '[style.x]': 'value'
    // Used in @Component({ host: { '[style.x]': 'expr' } })
    const hostBindingRegex =
      /'\[style\.((?:--)?[a-zA-Z][a-zA-Z0-9-]*)(?:\.([a-zA-Z%]+))?\]'\s*:\s*'([^']*)'/g;

    while ((match = hostBindingRegex.exec(line)) !== null) {
      const prop = match[1];
      const unit = match[2];
      let value = match[3];

      if (!prop || value === undefined) continue;

      // Handle value extraction - host bindings may have double quotes around string values
      value = value.trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }

      // If there's a unit suffix (like px, em, rem, %)
      if (unit && CSS_UNITS.has(unit)) {
        if (/^-?\d+\.?\d*$/.test(value)) {
          value = `${value}${unit}`;
        } else {
          value = `${value} ${unit}`;
        }
      }

      matches.push({
        css: `${prop}: ${value}`,
        line: lineNum + 1,
        column: match.index + 1,
        context: 'inline',
      });
    }
  }

  return matches;
}

/**
 * Process an Angular style match and return a StyleMatch
 */
function processAngularMatch(
  prop: string,
  unit: string | undefined,
  rawValue: string,
  lineNum: number,
  column: number
): StyleMatch {
  let value = rawValue.trim();

  // Remove surrounding single quotes from string literals like "'red'" -> "red"
  if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1);
  }
  // Also handle nested double quotes like '"none"' -> "none"
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }

  // If there's a unit suffix (like px, em, rem, %)
  if (unit && CSS_UNITS.has(unit)) {
    // Check if value is a number - append unit directly
    if (/^-?\d+\.?\d*$/.test(value)) {
      value = `${value}${unit}`;
    } else {
      // It's an expression - append unit with space for readability
      value = `${value} ${unit}`;
    }
  }

  return {
    css: `${prop}: ${value}`,
    line: lineNum + 1,
    column: column + 1,
    context: 'inline',
  };
}

/**
 * Extract Angular [ngStyle] bindings
 * [ngStyle]="{ 'color': 'red', 'padding': '16px' }"
 */
export function extractNgStyleBindings(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Match [ngStyle]="{ ... }" - handle multi-line with dotall flag
  const ngStyleRegex = /\[ngStyle\]\s*=\s*"\{([^}]+)\}"/gi;
  let match;

  while ((match = ngStyleRegex.exec(content)) !== null) {
    const objectContent = match[1];
    if (!objectContent) continue;

    const css = parseStyleObject(objectContent);
    if (css) {
      const beforeMatch = content.slice(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      matches.push({
        css,
        line: lineNum,
        column: 1,
        context: 'inline',
      });
    }
  }

  return matches;
}

/**
 * Extract Vue :style bindings
 * :style="{ color: 'red' }" or v-bind:style="{ ... }"
 * :style="`color: red`" (template literals)
 * :style="{ opacity: isHovering ? 1 : 0 }" (dynamic values)
 * Multi-line support
 */
export function extractVueStyleBindings(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Match :style="{ ... }" or v-bind:style="{ ... }" - including multi-line
  // Use a more permissive regex that handles nested braces carefully
  const vueStyleObjectRegex = /(?::|v-bind:)style\s*=\s*"\{([\s\S]*?)\}"/g;
  let match;

  while ((match = vueStyleObjectRegex.exec(content)) !== null) {
    const objectContent = match[1];
    if (!objectContent) continue;

    const css = parseStyleObjectExtended(objectContent);
    if (css) {
      const beforeMatch = content.slice(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      matches.push({
        css,
        line: lineNum,
        column: 1,
        context: 'inline',
      });
    }
  }

  // Match :style="`...`" or v-bind:style="`...`" (template literals)
  const templateLiteralRegex = /(?::|v-bind:)style\s*=\s*"`([^`]*)`"/g;
  while ((match = templateLiteralRegex.exec(content)) !== null) {
    const templateContent = match[1];
    if (!templateContent) continue;

    // Template literal content is raw CSS (possibly with ${} expressions)
    // Preserve the content as-is, including ${} placeholders
    const beforeMatch = content.slice(0, match.index);
    const lineNum = beforeMatch.split('\n').length;

    matches.push({
      css: templateContent.trim(),
      line: lineNum,
      column: 1,
      context: 'inline',
    });
  }

  // Also match plain style="..." which Vue also supports
  const plainStyleRegex = /\bstyle\s*=\s*"([^"]+)"/g;
  while ((match = plainStyleRegex.exec(content)) !== null) {
    // Skip if it's a binding (preceded by : or v-bind)
    const beforeMatch = content.slice(
      Math.max(0, match.index - 10),
      match.index
    );
    if (beforeMatch.includes(':') || beforeMatch.includes('v-bind')) continue;

    const css = match[1];
    if (css) {
      const beforeFull = content.slice(0, match.index);
      const lineNum = beforeFull.split('\n').length;

      matches.push({
        css,
        line: lineNum,
        column: 1,
        context: 'inline',
      });
    }
  }

  return matches;
}

/**
 * Extract all directive-based styles (Angular + Vue)
 */
export function extractDirectiveStyles(content: string): StyleMatch[] {
  return [
    ...extractAngularStyleBindings(content),
    ...extractNgStyleBindings(content),
    ...extractVueStyleBindings(content),
  ];
}

/**
 * Parse a style object notation to CSS
 * { 'color': 'red', 'padding': '16px' } → "color: red; padding: 16px"
 * Also handles unquoted keys: { color: 'red' }
 */
function parseStyleObject(objectContent: string): string {
  const cssProps: string[] = [];

  // Match both quoted and unquoted property names
  // 'property': 'value' or property: 'value' or "property": "value"
  const propRegex = /['"]?([a-zA-Z-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
  let match;

  while ((match = propRegex.exec(objectContent)) !== null) {
    const prop = match[1];
    const value = match[2];

    if (!prop || !value) continue;

    // Skip dynamic expressions (but allow color names)
    if (
      /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value) &&
      !isColorName(value)
    ) {
      continue;
    }

    cssProps.push(`${prop}: ${value}`);
  }

  return cssProps.join('; ');
}

/**
 * Extended style object parser that handles Vue's dynamic values
 * Supports: quoted values, template literals, ternary expressions, function calls
 * { opacity: isHovering ? 1 : 0 } → "opacity: [dynamic]"
 * { background: `rgb(${r}, ${g}, ${b})` } → "background: rgb(${r}, ${g}, ${b})"
 */
function parseStyleObjectExtended(objectContent: string): string {
  const cssProps: string[] = [];

  // First, try to match quoted string values (standard case)
  // 'property': 'value' or property: 'value' or "property": "value"
  const quotedPropRegex = /['"]?([a-zA-Z-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
  let match;
  const processedProps = new Set<string>();

  while ((match = quotedPropRegex.exec(objectContent)) !== null) {
    const prop = match[1];
    const value = match[2];

    if (!prop || !value) continue;

    // Skip dynamic expressions (but allow color names and CSS keywords)
    if (
      /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value) &&
      !isColorName(value) &&
      !isCssKeyword(value)
    ) {
      continue;
    }

    cssProps.push(`${prop}: ${value}`);
    processedProps.add(prop);
  }

  // Match template literal values: property: `...`
  const templateLiteralRegex = /['"]?([a-zA-Z-]+)['"]?\s*:\s*`([^`]*)`/g;
  while ((match = templateLiteralRegex.exec(objectContent)) !== null) {
    const prop = match[1];
    const value = match[2];

    if (!prop || processedProps.has(prop)) continue;

    cssProps.push(`${prop}: ${value}`);
    processedProps.add(prop);
  }

  // Match dynamic values: property: expression (no quotes)
  // This catches ternary expressions, function calls, variables, etc.
  // Pattern: property: (anything until comma or end of object)
  const dynamicPropRegex =
    /['"]?([a-zA-Z-]+)['"]?\s*:\s*([^,'"}`][^,}]*?)(?:,|\s*$)/g;
  while ((match = dynamicPropRegex.exec(objectContent)) !== null) {
    const prop = match[1];
    const value = match[2]?.trim();

    if (!prop || !value || processedProps.has(prop)) continue;

    // Skip if this is a quoted value we should have caught earlier
    if (value.startsWith("'") || value.startsWith('"')) continue;

    cssProps.push(`${prop}: [dynamic]`);
    processedProps.add(prop);
  }

  return cssProps.join('; ');
}

/**
 * Check if a value is a CSS keyword (not a variable)
 */
function isCssKeyword(value: string): boolean {
  const keywords = new Set([
    'block',
    'inline',
    'flex',
    'grid',
    'none',
    'hidden',
    'visible',
    'auto',
    'inherit',
    'initial',
    'unset',
    'absolute',
    'relative',
    'fixed',
    'sticky',
    'static',
  ]);
  return keywords.has(value.toLowerCase());
}

/**
 * Check if a value is a CSS color name
 */
function isColorName(value: string): boolean {
  const colorNames = new Set([
    'transparent',
    'currentcolor',
    'inherit',
    'black',
    'white',
    'red',
    'green',
    'blue',
    'yellow',
    'orange',
    'purple',
    'pink',
    'brown',
    'gray',
    'grey',
    'cyan',
    'magenta',
    'lime',
    'maroon',
    'navy',
    'olive',
    'teal',
    'aqua',
    'fuchsia',
    'silver',
  ]);
  return colorNames.has(value.toLowerCase());
}
