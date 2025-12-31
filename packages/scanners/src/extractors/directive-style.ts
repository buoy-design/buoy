/**
 * Directive Style Extractor
 * Extracts style bindings from Angular and Vue templates.
 * Covers: Angular [style.x]="...", [ngStyle]="...", Vue :style="..."
 */

import type { StyleMatch } from './html-style.js';

/**
 * Extract Angular-style property bindings
 * [style.color]="'red'" or [style.background-color]="bgColor"
 */
export function extractAngularStyleBindings(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;

    // Match [style.property]="value"
    const bindingRegex = /\[style\.([a-z-]+)\]\s*=\s*["']([^"']+)["']/gi;
    let match;

    while ((match = bindingRegex.exec(line)) !== null) {
      const prop = match[1];
      let value = match[2];

      if (!prop || !value) continue;

      // Remove surrounding quotes from string literals
      value = value.replace(/^'|'$/g, '').trim();

      // Skip dynamic expressions (variables)
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value) && !isColorName(value)) {
        continue;
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
 * Extract Angular [ngStyle] bindings
 * [ngStyle]="{ 'color': 'red', 'padding': '16px' }"
 */
export function extractNgStyleBindings(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Match [ngStyle]="{ ... }"
  const ngStyleRegex = /\[ngStyle\]\s*=\s*["']\{([^}]+)\}["']/gi;
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
 */
export function extractVueStyleBindings(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Match :style="{ ... }" or v-bind:style="{ ... }"
  const vueStyleRegex = /(?::|v-bind:)style\s*=\s*["']\{([^}]+)\}["']/gi;
  let match;

  while ((match = vueStyleRegex.exec(content)) !== null) {
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

  // Also match plain style="..." which Vue also supports
  const plainStyleRegex = /\bstyle\s*=\s*["']([^"']+)["']/gi;
  while ((match = plainStyleRegex.exec(content)) !== null) {
    // Skip if it's a binding (starts with : or v-bind)
    const beforeMatch = content.slice(Math.max(0, match.index - 10), match.index);
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
 */
function parseStyleObject(objectContent: string): string {
  const cssProps: string[] = [];

  // Match 'property': 'value' or property: 'value'
  const propRegex = /['"]?([a-zA-Z-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
  let match;

  while ((match = propRegex.exec(objectContent)) !== null) {
    const prop = match[1];
    const value = match[2];

    if (!prop || !value) continue;

    // Skip dynamic expressions
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value) && !isColorName(value)) {
      continue;
    }

    cssProps.push(`${prop}: ${value}`);
  }

  return cssProps.join('; ');
}

/**
 * Check if a value is a CSS color name
 */
function isColorName(value: string): boolean {
  const colorNames = new Set([
    'transparent', 'currentcolor', 'inherit',
    'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple',
    'pink', 'brown', 'gray', 'grey', 'cyan', 'magenta', 'lime', 'maroon',
    'navy', 'olive', 'teal', 'aqua', 'fuchsia', 'silver',
  ]);
  return colorNames.has(value.toLowerCase());
}
