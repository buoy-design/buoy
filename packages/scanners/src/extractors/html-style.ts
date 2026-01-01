/**
 * HTML-like Style Extractor
 * Extracts style="..." attributes from HTML-like templates.
 * Covers: Razor, Blade, ERB, Twig, PHP, EJS, Pug, Liquid, Jinja, Django,
 * Thymeleaf, Freemarker, Handlebars, Mustache, Nunjucks, Hugo, Jekyll, Eleventy
 */

export interface StyleMatch {
  css: string;
  line: number;
  column: number;
  context: 'inline' | 'style-block';
}

/**
 * Calculate line and column numbers from a position in the content
 */
function getLineAndColumn(content: string, position: number): { line: number; column: number } {
  const beforeMatch = content.slice(0, position);
  const lines = beforeMatch.split('\n');
  const line = lines.length;
  const lastLine = lines[lines.length - 1] || '';
  const column = lastLine.length + 1;
  return { line, column };
}

/**
 * Extract inline style attributes from HTML-like content
 * Supports multi-line style attributes by processing the entire content at once.
 */
export function extractHtmlStyleAttributes(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Match style="..." with double quotes
  // Use negative lookbehind to avoid matching data-style, ng-style, v-bind:style, :style, etc.
  // Use [\s\S] instead of [^"] to allow newlines in the value
  const doubleQuoteRegex = /(?<![:\w-])style\s*=\s*"((?:[^"\\]|\\.)*)"/gi;
  let match;

  while ((match = doubleQuoteRegex.exec(content)) !== null) {
    const css = match[1];
    // Skip empty or whitespace-only values
    if (css && css.trim()) {
      const { line, column } = getLineAndColumn(content, match.index);
      matches.push({
        css,
        line,
        column,
        context: 'inline',
      });
    }
  }

  // Match style='...' with single quotes (allows nested double quotes)
  // Use [\s\S] instead of [^'] to allow newlines in the value
  const singleQuoteRegex = /(?<![:\w-])style\s*=\s*'((?:[^'\\]|\\.)*)'/gi;
  while ((match = singleQuoteRegex.exec(content)) !== null) {
    const css = match[1];
    // Skip empty or whitespace-only values
    if (css && css.trim()) {
      const { line, column } = getLineAndColumn(content, match.index);
      matches.push({
        css,
        line,
        column,
        context: 'inline',
      });
    }
  }

  return matches;
}

/**
 * Extract <style> block contents from HTML-like content
 */
export function extractStyleBlocks(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Match <style>...</style> blocks
  const styleBlockRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;

  while ((match = styleBlockRegex.exec(content)) !== null) {
    const css = match[1];
    if (css && css.trim()) {
      // Find line number of this match
      const beforeMatch = content.slice(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      matches.push({
        css: css.trim(),
        line: lineNum,
        column: 1,
        context: 'style-block',
      });
    }
  }

  return matches;
}

/**
 * Extract all styles from HTML-like content (inline + blocks)
 */
export function extractAllHtmlStyles(content: string): StyleMatch[] {
  return [
    ...extractHtmlStyleAttributes(content),
    ...extractStyleBlocks(content),
  ];
}
