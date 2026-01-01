/**
 * Template Class Pattern Extractor
 * Extracts dynamic CSS class patterns from JSX/TSX template literals.
 * Detects patterns like:
 *   - className={`${prefix}-${variant}`}
 *   - className={`btn-${size}`}
 *   - className={clsx(bsPrefix, variant && `${bsPrefix}-${variant}`)}
 *
 * These patterns represent token application and should be tracked
 * for design system analysis.
 */

export interface ClassPatternMatch {
  /** The full pattern expression (e.g., `${prefix}-${variant}`) */
  pattern: string;
  /** The template structure with variables as placeholders (e.g., "{prefix}-{variant}") */
  structure: string;
  /** Variables used in the pattern */
  variables: string[];
  /** Static class name parts (e.g., "btn" in "btn-{size}") */
  staticParts: string[];
  /** Line number where pattern was found */
  line: number;
  /** Column where pattern was found */
  column: number;
  /** The full className value including wrappers like clsx() */
  context: 'template-literal' | 'clsx' | 'classnames' | 'cx' | 'conditional';
}

/**
 * Common class name utility function patterns
 */
const CLASS_UTILITIES = ['clsx', 'classnames', 'classNames', 'cx', 'cn', 'twMerge', 'cva'];

/**
 * Extract template literal class patterns from JSX/TSX content
 */
export function extractClassPatterns(content: string): ClassPatternMatch[] {
  const matches: ClassPatternMatch[] = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;

    // Pattern 1: className={`...${...}...`} - Direct template literal
    const templateMatches = extractTemplateClassNames(line, lineNum + 1);
    matches.push(...templateMatches);

    // Pattern 2: className={clsx(...)} or similar utilities with template literals inside
    const utilityMatches = extractUtilityClassNames(line, lineNum + 1);
    matches.push(...utilityMatches);

    // Pattern 3: className={condition ? `...${...}...` : '...'} - Conditional with templates
    const conditionalMatches = extractConditionalClassNames(line, lineNum + 1);
    matches.push(...conditionalMatches);
  }

  // Also handle multi-line patterns
  const multilineMatches = extractMultilinePatterns(content);
  matches.push(...multilineMatches);

  // Deduplicate by pattern and line
  const seen = new Set<string>();
  return matches.filter(m => {
    const key = `${m.line}:${m.pattern}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract template literal class patterns from a single line
 * Matches: className={`prefix-${var}`} or className={`${prefix}-${variant}`}
 */
function extractTemplateClassNames(line: string, lineNum: number): ClassPatternMatch[] {
  const matches: ClassPatternMatch[] = [];

  // Match className={`...`} with template expressions
  const regex = /className\s*=\s*\{`([^`]*\$\{[^`]+)`\}/g;
  let match;

  while ((match = regex.exec(line)) !== null) {
    const templateContent = match[1]!;
    const parsed = parseTemplateContent(templateContent);

    if (parsed.variables.length > 0) {
      matches.push({
        pattern: templateContent,
        structure: parsed.structure,
        variables: parsed.variables,
        staticParts: parsed.staticParts,
        line: lineNum,
        column: match.index + 1,
        context: 'template-literal',
      });
    }
  }

  return matches;
}

/**
 * Extract class patterns from utility functions like clsx(), classnames()
 */
function extractUtilityClassNames(line: string, lineNum: number): ClassPatternMatch[] {
  const matches: ClassPatternMatch[] = [];

  for (const utility of CLASS_UTILITIES) {
    // Match className={clsx(...`${...}`...)}
    const regex = new RegExp(`className\\s*=\\s*\\{${utility}\\s*\\(([^)]*\\$\\{[^)]+)\\)\\}`, 'g');
    let match;

    while ((match = regex.exec(line)) !== null) {
      const content = match[1]!;
      const templateLiterals = extractNestedTemplateLiterals(content);

      for (const template of templateLiterals) {
        const parsed = parseTemplateContent(template);
        if (parsed.variables.length > 0) {
          matches.push({
            pattern: template,
            structure: parsed.structure,
            variables: parsed.variables,
            staticParts: parsed.staticParts,
            line: lineNum,
            column: match.index + 1,
            context: utility === 'clsx' ? 'clsx' : utility === 'cx' ? 'cx' : 'classnames',
          });
        }
      }
    }
  }

  return matches;
}

/**
 * Extract conditional class patterns
 * Matches: className={condition ? `prefix-${var}` : 'default'}
 */
function extractConditionalClassNames(line: string, lineNum: number): ClassPatternMatch[] {
  const matches: ClassPatternMatch[] = [];

  // Match ternary with template literals in className
  const regex = /className\s*=\s*\{[^}]*\?\s*`([^`]*\$\{[^`]+)`[^}]*\}/g;
  let match;

  while ((match = regex.exec(line)) !== null) {
    const templateContent = match[1]!;
    const parsed = parseTemplateContent(templateContent);

    if (parsed.variables.length > 0) {
      matches.push({
        pattern: templateContent,
        structure: parsed.structure,
        variables: parsed.variables,
        staticParts: parsed.staticParts,
        line: lineNum,
        column: match.index + 1,
        context: 'conditional',
      });
    }
  }

  return matches;
}

/**
 * Extract template literals from multi-line content
 */
function extractMultilinePatterns(content: string): ClassPatternMatch[] {
  const matches: ClassPatternMatch[] = [];

  // Find className= and then extract balanced braces content
  const classNameStarts = findAllOccurrences(content, 'className');

  for (const startIdx of classNameStarts) {
    // Find the opening brace
    let i = startIdx + 'className'.length;
    while (i < content.length && content[i] !== '{' && content[i] !== '"' && content[i] !== "'") {
      i++;
    }

    if (content[i] !== '{') continue;

    // Extract balanced brace content
    const braceContent = extractBalancedBracesContent(content, i);
    if (!braceContent || !braceContent.includes('\n')) continue;

    // Find template literals within this multi-line content
    const templateLiterals = extractNestedTemplateLiterals(braceContent);

    for (const template of templateLiterals) {
      const parsed = parseTemplateContent(template);
      if (parsed.variables.length > 0) {
        // Calculate line number
        const beforeMatch = content.slice(0, startIdx);
        const lineNum = beforeMatch.split('\n').length;

        // Determine context
        let context: ClassPatternMatch['context'] = 'template-literal';
        for (const utility of CLASS_UTILITIES) {
          if (braceContent.includes(utility + '(')) {
            context = utility === 'clsx' ? 'clsx' : utility === 'cx' ? 'cx' : 'classnames';
            break;
          }
        }
        if (braceContent.includes('?') && braceContent.includes(':')) {
          context = 'conditional';
        }

        matches.push({
          pattern: template,
          structure: parsed.structure,
          variables: parsed.variables,
          staticParts: parsed.staticParts,
          line: lineNum,
          column: 1,
          context,
        });
      }
    }
  }

  return matches;
}

/**
 * Find all occurrences of a substring in content
 */
function findAllOccurrences(content: string, substring: string): number[] {
  const indices: number[] = [];
  let idx = content.indexOf(substring);
  while (idx !== -1) {
    indices.push(idx);
    idx = content.indexOf(substring, idx + 1);
  }
  return indices;
}

/**
 * Extract content within balanced braces starting at given position
 */
function extractBalancedBracesContent(content: string, startIdx: number): string | null {
  if (content[startIdx] !== '{') return null;

  let depth = 0;
  let i = startIdx;

  while (i < content.length) {
    const char = content[i];

    // Handle string literals to avoid counting braces inside them
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i++;
      while (i < content.length) {
        if (content[i] === '\\') {
          i += 2;
          continue;
        }
        if (content[i] === quote) {
          break;
        }
        // Handle template literal expressions
        if (quote === '`' && content[i] === '$' && content[i + 1] === '{') {
          let templateDepth = 1;
          i += 2;
          while (i < content.length && templateDepth > 0) {
            if (content[i] === '{') templateDepth++;
            else if (content[i] === '}') templateDepth--;
            i++;
          }
          continue;
        }
        i++;
      }
      i++;
      continue;
    }

    if (char === '{') depth++;
    else if (char === '}') depth--;

    if (depth === 0) {
      return content.slice(startIdx + 1, i);
    }
    i++;
  }

  return null;
}

/**
 * Extract all template literals from a string (handling nesting)
 */
function extractNestedTemplateLiterals(content: string): string[] {
  const templates: string[] = [];
  let i = 0;

  while (i < content.length) {
    if (content[i] === '`') {
      // Find matching closing backtick
      let j = i + 1;
      let depth = 0;

      while (j < content.length) {
        if (content[j] === '\\') {
          j += 2; // Skip escaped character
          continue;
        }
        if (content[j] === '$' && content[j + 1] === '{') {
          depth++;
          j += 2;
          continue;
        }
        if (content[j] === '}' && depth > 0) {
          depth--;
          j++;
          continue;
        }
        if (content[j] === '`' && depth === 0) {
          const template = content.slice(i + 1, j);
          // Only include if it has template expressions
          if (template.includes('${')) {
            templates.push(template);
          }
          break;
        }
        j++;
      }
      i = j + 1;
    } else {
      i++;
    }
  }

  return templates;
}

/**
 * Parse template literal content to extract structure and variables
 */
function parseTemplateContent(content: string): {
  structure: string;
  variables: string[];
  staticParts: string[];
} {
  const variables: string[] = [];
  const staticParts: string[] = [];
  let structure = '';
  let currentStatic = '';
  let i = 0;

  while (i < content.length) {
    if (content[i] === '$' && content[i + 1] === '{') {
      // Save current static part
      if (currentStatic) {
        staticParts.push(currentStatic);
        currentStatic = '';
      }

      // Find closing brace
      let depth = 1;
      let j = i + 2;
      while (j < content.length && depth > 0) {
        if (content[j] === '{') depth++;
        else if (content[j] === '}') depth--;
        j++;
      }

      const varExpr = content.slice(i + 2, j - 1);
      variables.push(varExpr);

      // Use simplified variable name for structure
      const simpleName = extractSimpleVarName(varExpr);
      structure += `{${simpleName}}`;

      i = j;
    } else {
      currentStatic += content[i];
      structure += content[i];
      i++;
    }
  }

  // Add final static part
  if (currentStatic) {
    staticParts.push(currentStatic);
  }

  return { structure, variables, staticParts };
}

/**
 * Extract a simple variable name from a complex expression
 * Examples:
 *   "prefix" -> "prefix"
 *   "prefix || 'btn'" -> "prefix"
 *   "variant && `${bsPrefix}-${variant}`" -> "variant"
 */
function extractSimpleVarName(expr: string): string {
  // Strip conditional expressions
  const cleaned = expr
    .replace(/\s*\|\|.*$/, '')  // Remove || fallback
    .replace(/\s*&&.*$/, '')    // Remove && guard
    .replace(/\s*\?.*$/, '')    // Remove ternary
    .trim();

  // Extract just the identifier
  const identMatch = cleaned.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
  return identMatch ? identMatch[1]! : expr;
}

/**
 * Analyze patterns to identify potential token mappings
 */
export function analyzePatternForTokens(match: ClassPatternMatch): {
  potentialTokenType: 'variant' | 'size' | 'color' | 'state' | 'modifier' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  suggestedTokenName?: string;
} {
  const varNames = match.variables.map(v => v.toLowerCase());

  // Check for variant patterns
  if (varNames.some(v => v.includes('variant') || v.includes('type') || v.includes('kind'))) {
    return { potentialTokenType: 'variant', confidence: 'high' };
  }

  // Check for size patterns
  if (varNames.some(v => v.includes('size') || v.includes('sz'))) {
    return { potentialTokenType: 'size', confidence: 'high' };
  }

  // Check for color patterns
  if (varNames.some(v => v.includes('color') || v.includes('theme') || v.includes('palette'))) {
    return { potentialTokenType: 'color', confidence: 'high' };
  }

  // Check for state patterns
  if (varNames.some(v => v.includes('state') || v.includes('active') || v.includes('disabled'))) {
    return { potentialTokenType: 'state', confidence: 'high' };
  }

  // Check common prefixes that suggest variants
  const staticLower = match.staticParts.map(s => s.toLowerCase()).join('');
  if (staticLower.includes('btn') || staticLower.includes('button')) {
    return { potentialTokenType: 'variant', confidence: 'medium' };
  }
  if (staticLower.includes('text') || staticLower.includes('bg')) {
    return { potentialTokenType: 'color', confidence: 'medium' };
  }

  return { potentialTokenType: 'unknown', confidence: 'low' };
}

// ============================================================================
// CVA (class-variance-authority) Pattern Extraction
// ============================================================================

/**
 * Represents a parsed CVA (class-variance-authority) pattern
 */
export interface CvaPattern {
  /** Variable name assigned to the cva result (e.g., "buttonVariants") */
  name: string;
  /** Base classes applied to all variants */
  baseClasses: string[];
  /** Variant definitions with their option names */
  variants?: Record<string, string[]>;
  /** Default variant selections */
  defaultVariants?: Record<string, string>;
  /** All semantic design tokens found in the CVA definition */
  semanticTokens: string[];
  /** Line number where pattern was found */
  line: number;
}

/**
 * Extract CVA patterns from TypeScript/JSX content
 * Handles patterns like:
 *   const buttonVariants = cva("base-classes", { variants: {...} })
 */
export function extractCvaPatterns(content: string): CvaPattern[] {
  const patterns: CvaPattern[] = [];

  // Match: const/let/var <name> = cva(...)
  const cvaRegex = /(?:const|let|var)\s+(\w+)\s*=\s*cva\s*\(/g;
  let match;

  while ((match = cvaRegex.exec(content)) !== null) {
    const name = match[1]!;
    const startIndex = match.index + match[0].length - 1; // Position at opening paren

    // Extract the full cva() call content with balanced parentheses
    const cvaContent = extractBalancedParensContent(content, startIndex);
    if (!cvaContent) continue;

    // Calculate line number
    const beforeMatch = content.slice(0, match.index);
    const lineNum = beforeMatch.split('\n').length;

    // Parse the CVA content
    const parsed = parseCvaContent(cvaContent);

    patterns.push({
      name,
      baseClasses: parsed.baseClasses,
      variants: parsed.variants,
      defaultVariants: parsed.defaultVariants,
      semanticTokens: parsed.semanticTokens,
      line: lineNum,
    });
  }

  return patterns;
}

/**
 * Extract content within balanced parentheses starting at given position
 */
function extractBalancedParensContent(content: string, startIdx: number): string | null {
  if (content[startIdx] !== '(') return null;

  let depth = 0;
  let i = startIdx;

  while (i < content.length) {
    const char = content[i];

    // Handle string literals
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i++;
      while (i < content.length) {
        if (content[i] === '\\') {
          i += 2;
          continue;
        }
        if (content[i] === quote) break;
        // Handle template literal expressions
        if (quote === '`' && content[i] === '$' && content[i + 1] === '{') {
          let templateDepth = 1;
          i += 2;
          while (i < content.length && templateDepth > 0) {
            if (content[i] === '{') templateDepth++;
            else if (content[i] === '}') templateDepth--;
            i++;
          }
          continue;
        }
        i++;
      }
      i++;
      continue;
    }

    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (depth === 0) {
      return content.slice(startIdx + 1, i);
    }
    i++;
  }

  return null;
}

/**
 * Parse the content of a cva() call
 */
function parseCvaContent(content: string): {
  baseClasses: string[];
  variants?: Record<string, string[]>;
  defaultVariants?: Record<string, string>;
  semanticTokens: string[];
} {
  const allClasses: string[] = [];
  const semanticTokens = new Set<string>();

  // Extract base classes (first string argument)
  const baseMatch = content.match(/^\s*["'`]([^"'`]*)["'`]/);
  const baseClasses = baseMatch ? baseMatch[1]!.split(/\s+/).filter(Boolean) : [];
  allClasses.push(...baseClasses);

  // Extract variant definitions
  const variants: Record<string, string[]> = {};
  const defaultVariants: Record<string, string> = {};

  // Find the variants object in the content
  const variantsStartIdx = content.indexOf('variants');
  if (variantsStartIdx !== -1) {
    // Find the opening brace after 'variants:'
    let braceIdx = content.indexOf('{', variantsStartIdx + 8);
    if (braceIdx !== -1) {
      // Extract balanced braces content for the variants object
      const variantsContent = extractBalancedBracesContentForVariants(content, braceIdx);

      if (variantsContent) {
        // Parse each variant category (e.g., variant: {...}, size: {...})
        parseVariantCategories(variantsContent, variants, allClasses);
      }
    }
  }

  // Extract defaultVariants
  const defaultsMatch = content.match(/defaultVariants\s*:\s*\{([^}]*)\}/);
  if (defaultsMatch) {
    const defaultsContent = defaultsMatch[1]!;
    const defaultRegex = /(\w+)\s*:\s*["'](\w+)["']/g;
    let defaultMatch;

    while ((defaultMatch = defaultRegex.exec(defaultsContent)) !== null) {
      defaultVariants[defaultMatch[1]!] = defaultMatch[2]!;
    }
  }

  // Extract semantic tokens from all classes
  for (const cls of allClasses) {
    const tokens = extractSemanticTokens(cls);
    tokens.forEach(t => semanticTokens.add(t));
  }

  return {
    baseClasses,
    variants: Object.keys(variants).length > 0 ? variants : undefined,
    defaultVariants: Object.keys(defaultVariants).length > 0 ? defaultVariants : undefined,
    semanticTokens: Array.from(semanticTokens),
  };
}

/**
 * Extract balanced braces content, handling nested braces
 */
function extractBalancedBracesContentForVariants(content: string, startIdx: number): string | null {
  if (content[startIdx] !== '{') return null;

  let depth = 0;
  let i = startIdx;

  while (i < content.length) {
    const char = content[i];

    // Handle string literals
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i++;
      while (i < content.length && content[i] !== quote) {
        if (content[i] === '\\') {
          i += 2;
          continue;
        }
        i++;
      }
      i++;
      continue;
    }

    if (char === '{') depth++;
    else if (char === '}') depth--;

    if (depth === 0) {
      return content.slice(startIdx + 1, i);
    }
    i++;
  }

  return null;
}

/**
 * Parse variant categories from variants object content
 */
function parseVariantCategories(
  content: string,
  variants: Record<string, string[]>,
  allClasses: string[]
): void {
  // Find each category: name: { ... }
  let i = 0;
  while (i < content.length) {
    // Skip whitespace and commas
    while (i < content.length && /[\s,]/.test(content[i]!)) i++;

    // Try to match category name
    const nameMatch = content.slice(i).match(/^(\w+)\s*:/);
    if (!nameMatch) break;

    const categoryName = nameMatch[1]!;
    i += nameMatch[0].length;

    // Skip whitespace
    while (i < content.length && /\s/.test(content[i]!)) i++;

    // Find opening brace
    if (content[i] !== '{') {
      // Not an object, skip
      i++;
      continue;
    }

    // Extract category content
    const categoryContent = extractBalancedBracesContentForVariants(content, i);
    if (!categoryContent) break;

    // Parse options within this category
    const optionNames: string[] = [];
    parseVariantOptions(categoryContent, optionNames, allClasses);

    if (optionNames.length > 0) {
      variants[categoryName] = optionNames;
    }

    // Move past the closing brace
    i += categoryContent.length + 2;
  }
}

/**
 * Parse variant options from category content
 */
function parseVariantOptions(
  content: string,
  optionNames: string[],
  allClasses: string[]
): void {
  // Match patterns like: optionName: "classes" or "option-name": "classes"
  const optionRegex = /["']?(\w+(?:-\w+)*)["']?\s*:\s*(?:\n\s*)?["'`]([^"'`]*)["'`]/g;
  let match;

  while ((match = optionRegex.exec(content)) !== null) {
    const optionName = match[1]!;
    const classes = match[2]!;

    if (!optionNames.includes(optionName)) {
      optionNames.push(optionName);
    }
    allClasses.push(...classes.split(/\s+/).filter(Boolean));
  }
}

// ============================================================================
// Semantic Tailwind Token Extraction
// ============================================================================

/**
 * Known semantic token names in Tailwind/shadcn design systems
 * These are custom colors that reference CSS variables, not color scales
 */
const SEMANTIC_TOKEN_NAMES = new Set([
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
]);

/**
 * Extract semantic design tokens from a Tailwind class string
 * Recognizes patterns like bg-primary, text-muted-foreground, border-input, etc.
 */
export function extractSemanticTokens(classString: string): string[] {
  const tokens = new Set<string>();

  // Split by whitespace to get individual classes
  const classes = classString.split(/\s+/).filter(Boolean);

  for (const cls of classes) {
    // Remove variants like hover:, focus:, dark:, etc.
    const baseClass = cls.replace(/^(?:[\w-]+:)+/, '');

    // Extract token from color utilities: bg-{token}, text-{token}, border-{token}, etc.
    const colorUtilityMatch = baseClass.match(
      /^(?:bg|text|border|ring|outline|shadow|accent|fill|stroke|caret|decoration|divide|placeholder)-(.+?)(?:\/[\d.]+)?$/
    );

    if (colorUtilityMatch) {
      const potentialToken = colorUtilityMatch[1]!;

      // Check if this is a known semantic token or follows semantic naming
      if (isSemanticToken(potentialToken)) {
        tokens.add(potentialToken);
      }
    }

    // Handle focus-visible:ring-{token}
    const focusRingMatch = baseClass.match(/^ring-(.+?)(?:\/[\d.]+)?$/);
    if (focusRingMatch && isSemanticToken(focusRingMatch[1]!)) {
      tokens.add(focusRingMatch[1]!);
    }
  }

  return Array.from(tokens);
}

/**
 * Check if a token name is a semantic design token
 */
function isSemanticToken(name: string): boolean {
  // Direct match
  if (SEMANTIC_TOKEN_NAMES.has(name)) {
    return true;
  }

  // Check for -foreground suffix pattern
  if (name.endsWith('-foreground')) {
    const base = name.replace(/-foreground$/, '');
    if (SEMANTIC_TOKEN_NAMES.has(base) || SEMANTIC_TOKEN_NAMES.has(name)) {
      return true;
    }
  }

  // Reject color scales like gray-300, blue-500, etc.
  if (/^(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+$/.test(name)) {
    return false;
  }

  // Reject pure color names
  if (/^(?:white|black|transparent|current|inherit)$/.test(name)) {
    return false;
  }

  // Accept custom tokens that look semantic (simple names without numbers)
  if (/^[a-z]+(?:-[a-z]+)*$/.test(name) && !name.match(/\d/)) {
    // If it ends with foreground or is a known UI element name, it's likely semantic
    if (name.endsWith('-foreground') || ['background', 'foreground', 'border', 'ring', 'input'].includes(name)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Static Class String Extraction
// ============================================================================

/**
 * Represents extracted static class strings from utility function calls
 */
export interface StaticClassStrings {
  /** The utility function used (cn, clsx, classNames, etc.) */
  utility: string;
  /** All static class names extracted */
  classes: string[];
  /** Semantic tokens found in the classes */
  semanticTokens: string[];
  /** Line number where pattern was found */
  line: number;
}

/**
 * Extract static class strings from className utility function calls
 * Handles: cn("static-classes"), classNames("...", variable), clsx("...", ...)
 */
export function extractStaticClassStrings(content: string): StaticClassStrings[] {
  const results: StaticClassStrings[] = [];
  const utilities = ['cn', 'clsx', 'classnames', 'classNames', 'cx', 'twMerge'];

  for (const utility of utilities) {
    // Find className={utility(...)} patterns
    const classNameRegex = new RegExp(`className\\s*=\\s*\\{\\s*${utility}\\s*\\(`, 'g');
    let match;

    while ((match = classNameRegex.exec(content)) !== null) {
      const startIndex = match.index + match[0].length - 1; // Position at opening paren

      // Extract balanced parentheses content
      const parenContent = extractBalancedParensContent(content, startIndex);
      if (!parenContent) continue;

      // Calculate line number
      const beforeMatch = content.slice(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      // Extract all string literals from the content
      const allClasses: string[] = [];
      const stringRegex = /["'`]([^"'`]+)["'`]/g;
      let stringMatch;

      while ((stringMatch = stringRegex.exec(parenContent)) !== null) {
        const classes = stringMatch[1]!.split(/\s+/).filter(Boolean);
        allClasses.push(...classes);
      }

      if (allClasses.length > 0) {
        // Extract semantic tokens
        const semanticTokens = new Set<string>();
        for (const cls of allClasses) {
          const tokens = extractSemanticTokens(cls);
          tokens.forEach(t => semanticTokens.add(t));
        }

        results.push({
          utility,
          classes: allClasses,
          semanticTokens: Array.from(semanticTokens),
          line: lineNum,
        });
      }
    }
  }

  return results;
}
