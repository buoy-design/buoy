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
 * Extract inline style attributes from HTML-like content
 */
export function extractHtmlStyleAttributes(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Track line/column positions
  const lines = content.split('\n');
  let currentPos = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;

    // Match style="..." or style='...'
    const styleRegex = /style\s*=\s*["']([^"']+)["']/gi;
    let match;

    while ((match = styleRegex.exec(line)) !== null) {
      const css = match[1];
      if (css) {
        matches.push({
          css,
          line: lineNum + 1,
          column: match.index + 1,
          context: 'inline',
        });
      }
    }

    currentPos += line.length + 1; // +1 for newline
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
