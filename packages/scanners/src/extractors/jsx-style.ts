/**
 * JSX Style Object Extractor
 * Extracts style={{ ... }} objects from JSX/TSX content.
 * Covers: React, Solid, Qwik, Preact, Astro (JSX)
 */

import type { StyleMatch } from './html-style.js';

/**
 * Extract style={{ ... }} objects from JSX content
 * Converts JS object notation to CSS-like text
 */
export function extractJsxStyleObjects(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Match style={{ ... }} - need to handle nested braces
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;

    // Find style={{ start
    let searchStart = 0;
    while (true) {
      const styleStart = line.indexOf('style={{', searchStart);
      if (styleStart === -1) break;

      // Find matching closing braces
      const objectStart = styleStart + 7; // after 'style={{'
      const objectContent = extractBalancedBraces(line.slice(objectStart));

      if (objectContent) {
        const css = jsObjectToCss(objectContent);
        if (css) {
          matches.push({
            css,
            line: lineNum + 1,
            column: styleStart + 1,
            context: 'inline',
          });
        }
      }

      searchStart = styleStart + 1;
    }
  }

  // Also handle multi-line style objects
  const multilineMatches = extractMultilineStyleObjects(content);
  matches.push(...multilineMatches);

  return matches;
}

/**
 * Extract content within balanced braces
 */
function extractBalancedBraces(content: string): string | null {
  let depth = 1;
  let i = 0;

  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }

  if (depth === 0) {
    // Remove the trailing }} (one for object, one for JSX expression)
    return content.slice(0, i - 1);
  }

  return null;
}

/**
 * Convert JavaScript object notation to CSS-like text
 * { color: 'red', padding: 16 } → "color: red; padding: 16px"
 */
function jsObjectToCss(objectContent: string): string {
  const cssProps: string[] = [];

  // Match property: value pairs
  // Handles: color: 'red', padding: 16, backgroundColor: '#fff'
  const propRegex = /(\w+)\s*:\s*(['"`]?)([^,}]+?)\2\s*(?:,|$)/g;
  let match;

  while ((match = propRegex.exec(objectContent)) !== null) {
    let prop = match[1];
    let value = match[3]?.trim();

    if (!prop || !value) continue;

    // Convert camelCase to kebab-case
    prop = camelToKebab(prop);

    // Remove quotes from string values
    value = value.replace(/^['"`]|['"`]$/g, '');

    // Skip dynamic expressions (variables, function calls)
    if (value.includes('(') || /^[a-zA-Z_$]/.test(value) && !/^#|^rgb|^hsl/.test(value)) {
      // Could be a color name or a variable - check if it looks like a color
      const colorNames = ['red', 'blue', 'green', 'black', 'white', 'gray', 'grey', 'transparent'];
      if (!colorNames.includes(value.toLowerCase())) {
        continue;
      }
    }

    // Add px to numeric values for spacing properties
    if (/^\d+$/.test(value) && isSpacingProperty(prop)) {
      value = `${value}px`;
    }

    cssProps.push(`${prop}: ${value}`);
  }

  return cssProps.join('; ');
}

/**
 * Convert camelCase to kebab-case
 */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Check if a property typically takes spacing values
 */
function isSpacingProperty(prop: string): boolean {
  const spacingProps = [
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'gap', 'row-gap', 'column-gap',
    'top', 'right', 'bottom', 'left',
    'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
    'border-radius', 'font-size', 'line-height',
  ];
  return spacingProps.includes(prop);
}

/**
 * Extract multi-line style objects
 */
function extractMultilineStyleObjects(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Match style={{ across multiple lines
  const multilineRegex = /style\s*=\s*\{\{([\s\S]*?)\}\}/g;
  let match;

  while ((match = multilineRegex.exec(content)) !== null) {
    const objectContent = match[1];
    if (!objectContent) continue;

    const css = jsObjectToCss(objectContent);
    if (css) {
      // Find line number
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
