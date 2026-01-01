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
  const seenPositions = new Set<string>();

  // Use a unified approach: find all style={{ and extract balanced braces
  const styleStartRegex = /style\s*=\s*\{\{/g;
  let styleMatch;

  while ((styleMatch = styleStartRegex.exec(content)) !== null) {
    const matchStart = styleMatch.index;
    const objectStartIndex = matchStart + styleMatch[0].length;

    // Extract balanced braces content (handles nested braces and multi-line)
    const objectContent = extractBalancedBraces(content.slice(objectStartIndex));

    if (objectContent !== null) {
      const css = jsObjectToCss(objectContent);
      if (css) {
        // Calculate line number
        const beforeMatch = content.slice(0, matchStart);
        const lineNum = beforeMatch.split('\n').length;
        const lastNewline = beforeMatch.lastIndexOf('\n');
        const column = matchStart - lastNewline;

        // Deduplicate by position
        const posKey = `${lineNum}:${column}`;
        if (!seenPositions.has(posKey)) {
          seenPositions.add(posKey);
          matches.push({
            css,
            line: lineNum,
            column,
            context: 'inline',
          });
        }
      }
    }
  }

  return matches;
}

/**
 * Extract content within balanced braces
 * Returns the content inside the first level of braces
 */
function extractBalancedBraces(content: string): string | null {
  let depth = 1;
  let i = 0;
  let inString: string | null = null;
  let inTemplateLiteral = false;
  let inTemplateExpression = 0;

  while (i < content.length && depth > 0) {
    const char = content[i]!;
    const prevChar = i > 0 ? content[i - 1] : '';

    // Handle string escapes
    if (prevChar === '\\' && inString) {
      i++;
      continue;
    }

    // Handle template literals
    if (char === '`' && !inString) {
      inTemplateLiteral = !inTemplateLiteral;
      i++;
      continue;
    }

    // Handle template expressions ${...}
    if (inTemplateLiteral && char === '$' && content[i + 1] === '{') {
      inTemplateExpression++;
      i += 2;
      continue;
    }

    if (inTemplateExpression > 0) {
      if (char === '{') inTemplateExpression++;
      else if (char === '}') inTemplateExpression--;
      i++;
      continue;
    }

    if (inTemplateLiteral) {
      i++;
      continue;
    }

    // Handle quoted strings
    if ((char === '"' || char === "'") && !inTemplateLiteral) {
      if (inString === char) {
        inString = null;
      } else if (!inString) {
        inString = char;
      }
      i++;
      continue;
    }

    if (inString) {
      i++;
      continue;
    }

    // Count braces
    if (char === '{') depth++;
    else if (char === '}') depth--;

    i++;
  }

  if (depth === 0) {
    // Return content before the final closing brace
    return content.slice(0, i - 1);
  }

  return null;
}

/**
 * Extract CSS custom property declarations like ["--var-name" as string]: value
 */
function extractCssVarProperties(objectContent: string): string[] {
  const props: string[] = [];

  // Find patterns like ["--var-name" as string]: ...
  // Need to manually parse because template literals are complex
  const varStartRegex = /\[\s*["'`](--[\w-]+)["'`]\s*(?:as\s+string)?\s*\]\s*:/g;
  let match;

  while ((match = varStartRegex.exec(objectContent)) !== null) {
    const varName = match[1];
    if (!varName) continue;

    // Find the value after the colon
    const afterColon = objectContent.slice(match.index + match[0].length);
    const value = extractValueAfterColon(afterColon);

    if (value) {
      props.push(`${varName}: ${value}`);
    }
  }

  return props;
}

/**
 * Extract a value after a colon, handling strings and template literals
 */
function extractValueAfterColon(content: string): string | null {
  const trimmed = content.trimStart();
  if (!trimmed) return null;

  const firstChar = trimmed[0];

  // Template literal
  if (firstChar === '`') {
    let i = 1;
    let depth = 0;
    while (i < trimmed.length) {
      if (trimmed[i] === '$' && trimmed[i + 1] === '{') {
        depth++;
        i += 2;
        continue;
      }
      if (depth > 0) {
        if (trimmed[i] === '{') depth++;
        else if (trimmed[i] === '}') depth--;
        i++;
        continue;
      }
      if (trimmed[i] === '`') {
        // Found closing backtick
        const value = trimmed.slice(1, i);
        // Return cleaned value - replace ${...} with placeholder
        return value.replace(/\$\{[^}]+\}/g, '(dynamic)');
      }
      i++;
    }
    return null;
  }

  // Quoted string
  if (firstChar === '"' || firstChar === "'") {
    const closeIndex = trimmed.indexOf(firstChar, 1);
    if (closeIndex > 0) {
      return trimmed.slice(1, closeIndex);
    }
    return null;
  }

  // Unquoted value (up to comma or closing brace)
  const endMatch = trimmed.match(/^([^,}\n]+)/);
  if (endMatch) {
    return endMatch[1]!.trim();
  }

  return null;
}

/**
 * Convert JavaScript object notation to CSS-like text
 * { color: 'red', padding: 16 } → "color: red; padding: 16px"
 */
function jsObjectToCss(objectContent: string): string {
  const cssProps: string[] = [];

  // Handle CSS custom properties: ["--name" as string]: value
  // Need to handle both quoted strings and template literals as values
  const cssVarProps = extractCssVarProperties(objectContent);
  cssProps.push(...cssVarProps);

  // Parse properties using a proper tokenizer approach
  const properties = parseObjectProperties(objectContent);

  for (const { prop: rawProp, value: rawValue } of properties) {
    let prop = rawProp;
    let value = rawValue;

    if (!prop || !value) continue;

    // Skip spread operators
    if (prop === 'rest' || value.startsWith('...')) continue;

    // Convert camelCase to kebab-case
    prop = camelToKebab(prop);

    // Clean value
    value = cleanValue(value);

    // Skip if value is empty after cleaning
    if (!value) continue;

    // Skip dynamic expressions (function calls, complex expressions)
    if (shouldSkipDynamicValue(value)) continue;

    // Add px to numeric values for spacing properties only
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      if (shouldAddPxUnit(prop)) {
        value = `${value}px`;
      }
      // Unitless properties keep the raw number
    }

    cssProps.push(`${prop}: ${value}`);
  }

  return cssProps.join('; ');
}

/**
 * Parse object properties handling function calls with commas, template literals, etc.
 */
function parseObjectProperties(content: string): Array<{ prop: string; value: string }> {
  const properties: Array<{ prop: string; value: string }> = [];
  let i = 0;

  while (i < content.length) {
    // Skip whitespace
    while (i < content.length && /\s/.test(content[i]!)) i++;

    if (i >= content.length) break;

    // Skip spread operators
    if (content.slice(i, i + 3) === '...') {
      // Skip until comma or end
      while (i < content.length && content[i] !== ',' && content[i] !== '}') i++;
      if (content[i] === ',') i++;
      continue;
    }

    // Skip computed properties (handled separately for CSS vars)
    if (content[i] === '[') {
      // Skip the entire computed property
      let depth = 1;
      i++;
      while (i < content.length && depth > 0) {
        if (content[i] === '[') depth++;
        else if (content[i] === ']') depth--;
        i++;
      }
      // Skip until comma or end
      while (i < content.length && content[i] !== ',' && content[i] !== '}') i++;
      if (content[i] === ',') i++;
      continue;
    }

    // Read property name (identifier)
    const propStart = i;
    while (i < content.length && /[a-zA-Z0-9_$]/.test(content[i]!)) i++;
    const prop = content.slice(propStart, i);

    if (!prop) {
      i++;
      continue;
    }

    // Skip whitespace
    while (i < content.length && /\s/.test(content[i]!)) i++;

    // Expect colon
    if (content[i] !== ':') {
      // Shorthand property (like { fontSize }) - skip
      while (i < content.length && content[i] !== ',' && content[i] !== '}') i++;
      if (content[i] === ',') i++;
      continue;
    }
    i++; // Skip colon

    // Skip whitespace
    while (i < content.length && /\s/.test(content[i]!)) i++;

    // Read value (handling function calls, strings, template literals)
    const value = extractPropertyValue(content, i);
    if (value !== null) {
      properties.push({ prop, value: value.value });
      i = value.endIndex;
    }

    // Skip to comma or end
    while (i < content.length && content[i] !== ',' && content[i] !== '}') i++;
    if (content[i] === ',') i++;
  }

  return properties;
}

/**
 * Extract a property value starting at the given index
 * Handles function calls (with nested parens), strings, template literals, etc.
 */
function extractPropertyValue(content: string, startIndex: number): { value: string; endIndex: number } | null {
  let i = startIndex;

  // Skip whitespace
  while (i < content.length && /\s/.test(content[i]!)) i++;

  if (i >= content.length) return null;

  const firstChar = content[i]!;

  // Template literal
  if (firstChar === '`') {
    i++;
    let depth = 0;
    const valueStart = i;
    while (i < content.length) {
      if (content[i] === '\\' && i + 1 < content.length) {
        i += 2;
        continue;
      }
      if (content[i] === '$' && content[i + 1] === '{') {
        depth++;
        i += 2;
        continue;
      }
      if (depth > 0) {
        if (content[i] === '{') depth++;
        else if (content[i] === '}') depth--;
        i++;
        continue;
      }
      if (content[i] === '`') {
        const value = content.slice(valueStart, i);
        return { value: `\`${value}\``, endIndex: i + 1 };
      }
      i++;
    }
    return null;
  }

  // Quoted string
  if (firstChar === '"' || firstChar === "'") {
    i++;
    const valueStart = i;
    while (i < content.length) {
      if (content[i] === '\\' && i + 1 < content.length) {
        i += 2;
        continue;
      }
      if (content[i] === firstChar) {
        const value = content.slice(valueStart, i);
        return { value, endIndex: i + 1 };
      }
      i++;
    }
    return null;
  }

  // Unquoted value (number, identifier, function call)
  const valueStart = i;
  let parenDepth = 0;

  while (i < content.length) {
    const char = content[i]!;

    if (char === '(') {
      parenDepth++;
      i++;
      continue;
    }

    if (char === ')') {
      parenDepth--;
      i++;
      continue;
    }

    // Stop at comma or closing brace (but only if not in parens)
    if (parenDepth === 0 && (char === ',' || char === '}' || char === '\n')) {
      break;
    }

    i++;
  }

  const value = content.slice(valueStart, i).trim();
  return value ? { value, endIndex: i } : null;
}

/**
 * Clean a value by removing quotes and template literal markers
 */
function cleanValue(value: string): string {
  // Handle template literals (may include ${} expressions)
  if (value.startsWith('`') && value.endsWith('`')) {
    const inner = value.slice(1, -1);
    // If it contains ${}, replace dynamic parts with a placeholder indicator
    if (inner.includes('${')) {
      // Replace ${...} with (dynamic) for static analysis
      return inner.replace(/\$\{[^}]+\}/g, '(dynamic)');
    }
    return inner;
  }

  // Remove surrounding quotes
  value = value.replace(/^['"]|['"]$/g, '');

  // Handle template literals with expressions that weren't wrapped
  if (value.includes('${')) {
    // Keep the structure but indicate it's dynamic
    return value.replace(/\$\{[^}]+\}/g, '(dynamic)');
  }

  // Remove template literal backticks from inside
  value = value.replace(/`/g, '');

  return value.trim();
}

/**
 * Check if a value should be skipped as a dynamic expression
 */
function shouldSkipDynamicValue(value: string): boolean {
  // Allow values containing (dynamic) placeholder - these represent template expressions
  // that have been processed and should be kept for analysis
  if (value.includes('(dynamic)')) {
    return false;
  }

  // Function calls (except common CSS functions and UI library helpers)
  if (/\([^)]*\)/.test(value)) {
    // Allow CSS functions
    const cssFunction = /^(calc|var|rgb|rgba|hsl|hsla|url|linear-gradient|radial-gradient|conic-gradient|min|max|clamp)\s*\(/i;
    // Allow transform functions
    const transformFunction = /^(rotate|rotateX|rotateY|rotateZ|rotate3d|scale|scaleX|scaleY|scaleZ|scale3d|translate|translateX|translateY|translateZ|translate3d|skew|skewX|skewY|matrix|matrix3d|perspective)\s*\(/i;
    // Allow UI library helpers like rem(), em(), px() from Mantine, Chakra, etc.
    const uiHelperFunction = /^(rem|em|px)\s*\(/i;

    // Check if value starts with an allowed function
    const valueWithoutSpaces = value.replace(/\s+/g, ' ');

    // Handle values that are entirely a function call
    if (cssFunction.test(valueWithoutSpaces) || transformFunction.test(valueWithoutSpaces) || uiHelperFunction.test(valueWithoutSpaces)) {
      return false;
    }

    // Handle values that contain multiple transform functions like "rotate(45deg) scale(1.5)"
    // Split on space and check each part
    const parts = valueWithoutSpaces.split(' ').filter(Boolean);
    const allPartsAreAllowed = parts.every(part => {
      if (!/\([^)]*\)/.test(part)) return true; // No function call in this part
      return cssFunction.test(part) || transformFunction.test(part) || uiHelperFunction.test(part);
    });

    if (!allPartsAreAllowed) {
      return true;
    }
  }

  // Skip if it looks like a JavaScript variable reference (unless it's a valid CSS value)
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value)) {
    return !isValidCssKeyword(value);
  }

  // Skip complex expressions with dots (like chart.color)
  if (/\.[a-zA-Z]/.test(value) && !value.startsWith('.')) {
    return true;
  }

  // Skip ternary expressions
  if (value.includes(' ? ') || value.includes(' : ')) {
    return true;
  }

  return false;
}

/**
 * Check if a word is a valid CSS keyword/value
 */
function isValidCssKeyword(value: string): boolean {
  const lower = value.toLowerCase();

  // CSS keywords
  const keywords = [
    // Generic
    'auto', 'inherit', 'initial', 'unset', 'revert', 'none',
    // Display
    'block', 'inline', 'flex', 'grid', 'inline-block', 'inline-flex',
    // Position
    'static', 'relative', 'absolute', 'fixed', 'sticky',
    // Visibility
    'visible', 'hidden', 'collapse',
    // Text
    'left', 'right', 'center', 'justify', 'start', 'end',
    // Overflow
    'scroll', 'clip',
    // Box sizing
    'border-box', 'content-box',
    // Cursor
    'pointer', 'default', 'move', 'text', 'wait', 'help', 'crosshair',
    // White space
    'nowrap', 'pre', 'normal', 'break-spaces',
    // Flexbox
    'row', 'column', 'wrap', 'wrap-reverse', 'space-between', 'space-around', 'space-evenly', 'stretch', 'baseline',
  ];

  // CSS color names (extended list)
  const colorNames = [
    'red', 'blue', 'green', 'black', 'white', 'gray', 'grey',
    'yellow', 'orange', 'purple', 'pink', 'brown', 'cyan', 'magenta',
    'transparent', 'currentColor', 'aliceblue', 'antiquewhite', 'aqua',
    'aquamarine', 'azure', 'beige', 'bisque', 'blanchedalmond', 'blueviolet',
    'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue',
    'cornsilk', 'crimson', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray',
    'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen',
    'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
    'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
    'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue',
    'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro',
    'ghostwhite', 'gold', 'goldenrod', 'greenyellow', 'honeydew', 'hotpink',
    'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush',
    'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
    'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink',
    'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
    'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen',
    'linen', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid',
    'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen',
    'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
    'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive',
    'olivedrab', 'orangered', 'orchid', 'palegoldenrod', 'palegreen',
    'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru',
    'plum', 'powderblue', 'rebeccapurple', 'rosybrown', 'royalblue',
    'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna',
    'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow',
    'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise',
    'violet', 'wheat', 'whitesmoke', 'yellowgreen',
  ];

  return keywords.includes(lower) || colorNames.includes(lower);
}

/**
 * Convert camelCase to kebab-case
 */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Check if a property should have px units added to numeric values
 * Returns false for unitless CSS properties
 */
function shouldAddPxUnit(prop: string): boolean {
  // Properties that should NOT get px units
  const unitlessProps = [
    'opacity',
    'z-index', 'zIndex',
    'flex', 'flex-grow', 'flex-shrink',
    'order',
    'font-weight', 'fontWeight',
    'line-height', 'lineHeight', // Can be unitless for multiplier
    'orphans', 'widows',
    'column-count', 'columns',
    'tab-size',
    'counter-increment', 'counter-reset',
    'animation-iteration-count',
    'border-image-outset', 'border-image-slice', 'border-image-width',
    'box-flex', 'box-flex-group', 'box-ordinal-group',
    'fill-opacity', 'flood-opacity', 'stop-opacity', 'stroke-dashoffset',
    'stroke-miterlimit', 'stroke-opacity', 'stroke-width',
    // CSS transform individual properties (unitless)
    'scale', 'rotate', // rotate can be unitless for turns, but typically uses deg
    'aspect-ratio', 'aspectRatio',
  ];

  // Check both kebab and camelCase versions
  return !unitlessProps.includes(prop) && !unitlessProps.includes(camelToKebab(prop));
}
