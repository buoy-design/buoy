/**
 * Shared parser utilities for framework scanners.
 * Provides AST helpers, regex patterns, and type extraction utilities.
 */

/**
 * Extract matched content with proper brace balancing.
 * Handles nested braces like: { cb: () => { value: string } }
 *
 * @param content The string to search in
 * @param startIndex The index of the opening brace
 * @returns The content between the braces (excluding braces themselves), or null if unbalanced
 */
export function extractBalancedBraces(
  content: string,
  startIndex: number,
): string | null {
  if (content[startIndex] !== "{") return null;

  let depth = 0;
  let i = startIndex;

  while (i < content.length) {
    const char = content[i];
    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        // Return content between braces (excluding the braces themselves)
        return content.substring(startIndex + 1, i);
      }
    }
    i++;
  }

  return null; // Unbalanced braces
}

/**
 * Depth tracking characters for parsing nested structures.
 * Positive values increase depth, negative values decrease.
 */
export const DEPTH_CHARS: Record<string, number> = {
  "{": 1,
  "}": -1,
  "(": 1,
  ")": -1,
  "<": 1,
  ">": -1,
  "[": 1,
  "]": -1,
};

/**
 * Track nesting depth when parsing a string.
 * Stops at a delimiter character when depth is 0.
 *
 * @param content The string to parse
 * @param startIndex Where to start parsing
 * @param delimiters Characters that stop parsing when depth is 0
 * @returns The extracted content and the index where parsing stopped
 */
export function extractWithDepthTracking(
  content: string,
  startIndex: number,
  delimiters: string[],
): { value: string; endIndex: number } {
  let value = "";
  let depth = 0;
  let i = startIndex;

  while (i < content.length) {
    const char = content[i];

    if (char !== undefined && char in DEPTH_CHARS) {
      depth += DEPTH_CHARS[char] ?? 0;
    }

    // Stop at delimiter only when not nested
    if (depth === 0 && char !== undefined && delimiters.includes(char)) {
      break;
    }

    value += char;
    i++;
  }

  return { value: value.trim(), endIndex: i };
}

/**
 * Common regex patterns for React/TypeScript code parsing.
 * Used to identify various component patterns in design system code.
 */
export const COMMON_REACT_PATTERNS = {
  /** Matches forwardRef<ElementType, PropsType> */
  forwardRef: /forwardRef\s*<([^>]+)>/,

  /** Matches React.forwardRef or forwardRef */
  forwardRefCall: /(?:React\.)?forwardRef/,

  /** Matches React.memo<PropsType> or memo<PropsType> */
  memo: /(?:React\.)?memo\s*<([^>]+)>/,

  /** Matches createRecipeContext({ key: "..." }) - Chakra UI pattern */
  recipeContext: /createRecipeContext\s*\(\s*\{/,

  /** Matches createSlotRecipeContext({ key: "..." }) - Chakra UI pattern */
  slotRecipeContext: /createSlotRecipeContext\s*\(\s*\{/,

  /** Matches withContext<ElementType, PropsType> - Chakra UI pattern */
  withContext: /withContext\s*<([^>]+)>/,

  /** Matches withProvider<ElementType, PropsType> - Chakra UI pattern */
  withProvider: /withProvider\s*<([^>]+)>/,

  /** Matches withRootProvider<PropsType> - Chakra UI pattern for root providers */
  withRootProvider: /withRootProvider\s*<([^>]+)>/,

  /** Matches chakra("element", { ... }) - Chakra styled factory */
  chakraStyled: /chakra\s*\(\s*["']/,

  /** Matches interface X extends Y pattern */
  interfaceExtends: /interface\s+(\w+)\s+extends\s+/,

  /** Matches type X = Y pattern */
  typeAlias: /type\s+(\w+)\s*=\s*/,

  /** Matches export const X = ... pattern */
  exportConst: /export\s+const\s+(\w+)\s*=/,

  /** Matches export interface X pattern */
  exportInterface: /export\s+interface\s+(\w+)/,

  /** Matches factory<PropsType>() - Mantine pattern */
  factory: /factory\s*<([^>]+)>\s*\(/,

  /** Matches polymorphicFactory<PropsType>() - Mantine pattern */
  polymorphicFactory: /polymorphicFactory\s*<([^>]+)>\s*\(/,

  /** Matches cva() - class-variance-authority pattern */
  cva: /cva\s*\(/,

  /** Matches styled.element`` or styled(Component)`` - styled-components/emotion */
  styled: /styled(?:\.(\w+)|\(([^)]+)\))/,

  /** Matches Ark UI import pattern: import { X as ArkX } from "@ark-ui/react/x" */
  arkUIImport: /import\s+\{[^}]+\}\s+from\s+["']@ark-ui\/react\/\w+["']/,

  /** Matches displayName assignment: Component.displayName = "Name" */
  displayName: /(\w+)\.displayName\s*=\s*["'](\w+)["']/,
};

/**
 * Extract generic type parameters from a pattern like `forwardRef<A, B>`.
 *
 * @param code The code string to search
 * @param functionName The function name to look for (e.g., "forwardRef")
 * @returns Array of type parameter strings, or empty array if not found
 */
export function extractGenericTypeParams(
  code: string,
  functionName: string,
): string[] {
  const pattern = new RegExp(`${functionName}\\s*<([^]*?)>(?:\\s*\\(|$)`);
  const match = code.match(pattern);

  if (!match || !match[1]) {
    return [];
  }

  // Split by comma at top level (respecting nested generics)
  return splitTopLevelArgs(match[1]);
}

/**
 * Split arguments by comma at the top level, respecting nested structures.
 * Handles generics, objects, arrays, and function types.
 *
 * @param args The comma-separated string to split
 * @returns Array of individual arguments
 */
export function splitTopLevelArgs(args: string): string[] {
  const result: string[] = [];
  let current = "";
  let depth = 0;
  let inArrowFunction = false;

  for (let i = 0; i < args.length; i++) {
    const char = args[i];

    // Check for arrow function token "=>"
    if (char === "=" && args[i + 1] === ">") {
      inArrowFunction = true;
      current += "=>";
      i++; // Skip the ">"
      continue;
    }

    // After arrow function, check for the return type (until we hit a comma at depth 0)
    // Arrow function return types end at commas at depth 0
    if (inArrowFunction && char === "," && depth === 0) {
      // Check if what follows looks like it could be continuing the type
      // or if it's a new argument
      const remaining = args.substring(i + 1).trim();
      // If remaining starts with a type-like token, it's a new argument
      if (/^[A-Za-z_$]/.test(remaining) || remaining.startsWith("(") || remaining.startsWith("{")) {
        inArrowFunction = false;
        if (current.trim()) {
          result.push(current.trim());
        }
        current = "";
        continue;
      }
    }

    if (char !== undefined && char in DEPTH_CHARS) {
      depth += DEPTH_CHARS[char] ?? 0;
      current += char;
    } else if (char === "," && depth === 0 && !inArrowFunction) {
      if (current.trim()) {
        result.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

/**
 * Extract a property value from an object literal in code.
 *
 * @param code The code string containing an object literal
 * @param propertyName The property name to extract
 * @returns The property value as string, or null if not found
 */
export function extractObjectProperty(
  code: string,
  propertyName: string,
): string | null {
  // Match property: "value" or property: 'value' or property: identifier
  const patterns = [
    // String value with double quotes
    new RegExp(`${propertyName}\\s*:\\s*"([^"]+)"`),
    // String value with single quotes
    new RegExp(`${propertyName}\\s*:\\s*'([^']+)'`),
    // Identifier value (not a string)
    new RegExp(`${propertyName}\\s*:\\s*([a-zA-Z_$][a-zA-Z0-9_$]*)`),
  ];

  for (const pattern of patterns) {
    const match = code.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract the recipe key from createRecipeContext or createSlotRecipeContext calls.
 * Common pattern in Chakra UI v3+.
 *
 * @param code The code string to search
 * @returns The recipe key, or null if not found
 */
export function extractRecipeKey(code: string): string | null {
  // Match createRecipeContext({ key: "..." }) or createSlotRecipeContext({ key: "..." })
  const recipePattern = /create(?:Slot)?RecipeContext\s*\(\s*\{/;
  const match = code.match(recipePattern);

  if (!match) {
    return null;
  }

  // Find the start of the object
  const startIndex = match.index! + match[0].length - 1;
  const objectContent = extractBalancedBraces(code, startIndex);

  if (!objectContent) {
    return null;
  }

  return extractObjectProperty(objectContent, "key");
}

/**
 * Extract a type from a generic type expression.
 * E.g., from `HTMLChakraProps<"button", X>` extracts "button".
 *
 * @param code The code string to search
 * @param typeName The generic type name to look for
 * @returns The first type parameter value (if a string literal), or null
 */
export function extractTypeFromGeneric(
  code: string,
  typeName: string,
): string | null {
  const pattern = new RegExp(`${typeName}\\s*<\\s*["']([^"']+)["']`);
  const match = code.match(pattern);
  return match?.[1] ?? null;
}

/**
 * Extract the props interface name from common React patterns.
 * Looks for the second generic parameter in forwardRef, withContext, etc.
 *
 * @param code The code string to search
 * @returns The props interface name, or null if not found or is inline type
 */
export function extractPropsInterfaceName(code: string): string | null {
  // Try common patterns in order
  const patterns = [
    /forwardRef\s*<[^,>]+,\s*(\w+Props)\s*>/,
    /withContext\s*<[^,>]+,\s*(\w+Props)\s*>/,
    /withProvider\s*<[^,>]+,\s*(\w+Props)\s*>/,
    /memo\s*<\s*(\w+Props)\s*>/,
    /factory\s*<\s*(\w+Props)\s*>/,
    /polymorphicFactory\s*<\s*(\w+Props)\s*>/,
  ];

  for (const pattern of patterns) {
    const match = code.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract the wrapped component/element type from HOC patterns.
 * E.g., from `withContext<A, B>(ArkField.Input)` extracts "ArkField.Input".
 * E.g., from `withProvider<A, B>("div", "root")` extracts "div".
 *
 * @param code The code string to search
 * @returns The wrapped type/element, or null if not found
 */
export function extractHOCWrappedType(code: string): string | null {
  // withContext/withProvider patterns
  const hocPatterns = [
    // withContext<A, B>(SomeComponent) - component reference
    /with(?:Context|Provider)\s*<[^>]+>\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$.]*)\s*[,)]/,
    // withContext<A, B>("div") - string element
    /with(?:Context|Provider)\s*<[^>]+>\s*\(\s*["']([a-z]+)["']/,
  ];

  for (const pattern of hocPatterns) {
    const match = code.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Parse type parameters from a TypeScript generic expression.
 * Handles complex nested types like `Record<string, { key: value }>`.
 *
 * @param code The code starting with `<` of the generic
 * @returns Array of type parameter strings
 */
export function parseGenericTypeParams(code: string): string[] {
  if (!code.startsWith("<")) return [];

  let depth = 0;
  let current = "";
  const params: string[] = [];
  let inString = false;
  let stringChar = "";

  for (let i = 1; i < code.length; i++) {
    const char = code[i]!;
    const prevChar = code[i - 1];

    // Handle string literals (don't count brackets inside strings)
    if ((char === '"' || char === "'") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    if (inString) {
      current += char;
      continue;
    }

    // Track depth for nested generics/objects
    if (char === "<" || char === "{" || char === "(" || char === "[") {
      depth++;
      current += char;
    } else if (char === ">" || char === "}" || char === ")" || char === "]") {
      if (char === ">" && depth === 0) {
        // End of generic parameters
        if (current.trim()) {
          params.push(current.trim());
        }
        break;
      }
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      if (current.trim()) {
        params.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }

  return params;
}

/**
 * Check if a string represents a valid TypeScript identifier.
 * Used to distinguish type references from inline type definitions.
 *
 * @param str The string to check
 * @returns True if valid identifier, false otherwise
 */
export function isValidIdentifier(str: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str.trim());
}

/**
 * Extract component name from various declaration patterns.
 *
 * @param code The code line to parse
 * @returns The component name, or null if not found
 */
export function extractComponentName(code: string): string | null {
  // export const ComponentName = ...
  const constMatch = code.match(/export\s+const\s+([A-Z][a-zA-Z0-9_]*)\s*=/);
  if (constMatch?.[1]) return constMatch[1];

  // export function ComponentName
  const funcMatch = code.match(/export\s+function\s+([A-Z][a-zA-Z0-9_]*)/);
  if (funcMatch?.[1]) return funcMatch[1];

  // const ComponentName = ...
  const localConstMatch = code.match(/const\s+([A-Z][a-zA-Z0-9_]*)\s*=/);
  if (localConstMatch?.[1]) return localConstMatch[1];

  return null;
}

/**
 * Extract import statements and their sources.
 *
 * @param code The full file content
 * @returns Map of imported names to their source modules
 */
export function extractImports(
  code: string,
): Map<string, { source: string; isDefault: boolean }> {
  const imports = new Map<string, { source: string; isDefault: boolean }>();

  // Match various import patterns
  const importRegex =
    /import\s+(?:(?:(\w+)\s*,\s*)?\{([^}]+)\}|(\w+))\s+from\s+["']([^"']+)["']/g;

  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const [, defaultImport1, namedImports, defaultImport2, source] = match;

    // Default import before destructuring: import Default, { named } from '...'
    if (defaultImport1 && source) {
      imports.set(defaultImport1, { source, isDefault: true });
    }

    // Named imports: { foo, bar as baz }
    if (namedImports && source) {
      const names = namedImports.split(",").map((n) => n.trim());
      for (const name of names) {
        const aliasMatch = name.match(/(\w+)\s+as\s+(\w+)/);
        if (aliasMatch?.[2]) {
          imports.set(aliasMatch[2], { source, isDefault: false });
        } else if (name && isValidIdentifier(name)) {
          imports.set(name, { source, isDefault: false });
        }
      }
    }

    // Solo default import: import Foo from '...'
    if (defaultImport2 && source) {
      imports.set(defaultImport2, { source, isDefault: true });
    }
  }

  return imports;
}

/**
 * Extract the element type from a chakra() call or HTMLChakraProps generic.
 *
 * @param code The code to search
 * @returns The element type (e.g., "button", "div"), or null
 */
export function extractChakraElementType(code: string): string | null {
  // chakra("div", ...) or chakra('div', ...)
  const chakraCallMatch = code.match(/chakra\s*\(\s*["']([a-z]+)["']/);
  if (chakraCallMatch?.[1]) return chakraCallMatch[1];

  // HTMLChakraProps<"button", ...>
  const propsMatch = code.match(/HTMLChakraProps\s*<\s*["']([a-z]+)["']/);
  if (propsMatch?.[1]) return propsMatch[1];

  return null;
}

/**
 * Detect the design system being used based on imports and patterns.
 *
 * @param code The full file content
 * @returns The detected design system name, or null
 */
export function detectDesignSystem(code: string): string | null {
  const imports = extractImports(code);

  for (const [, { source }] of imports) {
    if (source.includes("@chakra-ui")) return "chakra-ui";
    if (source.includes("@mantine")) return "mantine";
    if (source.includes("@radix-ui")) return "radix";
    if (source.includes("@ark-ui")) return "ark-ui";
    if (source.includes("@mui/")) return "mui";
    if (source.includes("antd")) return "antd";
  }

  // Check for styled-components or emotion
  if (code.includes("styled-components")) return "styled-components";
  if (code.includes("@emotion/")) return "emotion";

  // Check for Tailwind patterns
  if (code.includes("class-variance-authority") || code.includes("cva("))
    return "tailwind-cva";

  return null;
}

/**
 * Extract displayName from a component file.
 * Looks for patterns like: Component.displayName = "Name"
 *
 * @param code The code string to search
 * @returns The displayName value, or null if not found
 */
export function extractDisplayName(code: string): string | null {
  const match = code.match(COMMON_REACT_PATTERNS.displayName);
  return match?.[2] ?? null;
}

/**
 * Extract the slot name from withContext or withProvider calls.
 * E.g., from `withContext<A, B>("div", "body")` extracts "body".
 * Also handles: `withContext<A, B>(ArkDialog.Trigger, "trigger")`
 *
 * @param code The code string to search
 * @returns The slot name, or null if not found
 */
export function extractSlotName(code: string): string | null {
  // Match patterns like: withContext<...>("div", "slotName") or withProvider<...>("div", "slotName")
  const stringElementPattern =
    /with(?:Context|Provider)\s*<[^>]+>\s*\(\s*["'][^"']+["']\s*,\s*["']([^"']+)["']/;
  const match1 = code.match(stringElementPattern);
  if (match1?.[1]) return match1[1];

  // Also match: withContext<...>(ComponentName, "slotName") for Ark UI wrappers
  const componentPattern =
    /with(?:Context|Provider)\s*<[^>]+>\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$.]*\s*,\s*["']([^"']+)["']/;
  const match2 = code.match(componentPattern);
  return match2?.[1] ?? null;
}

/**
 * Chakra-style semantic tokens use specific patterns:
 * - Numeric scale values: "4", "6", "12", "0.5"
 * - Semantic path tokens: "bg.muted", "colors.primary.500"
 * - Size keywords: "sm", "md", "lg", "xl", "2xl"
 * - CSS variables: "var(--chakra-...)"
 */
const SEMANTIC_TOKEN_PATTERNS = {
  /** Numeric scale (spacing/sizing scale): 0, 1, 2, ... 96, 0.5, 1.5, etc. */
  numericScale: /^-?\d+(\.\d+)?$/,

  /** Semantic path tokens: bg.muted, colors.primary.500 */
  semanticPath: /^[a-z]+\.[a-z0-9.]+$/i,

  /** Size keywords: xs, sm, md, lg, xl, 2xl, 3xl, etc. */
  sizeKeyword: /^(\d*)?(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|full)$/,

  /** Named tokens (single word, no units): solid, outline, ghost, etc. */
  namedToken: /^[a-z][a-z0-9-]*$/i,

  /** CSS variable reference */
  cssVariable: /^var\(--/,

  /** Hardcoded color values */
  hardcodedColor: /^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/,

  /** Hardcoded unit values */
  hardcodedUnit: /^\d+(\.\d+)?(px|rem|em|vh|vw|%)$/,
};

/**
 * Check if a value represents a semantic design token vs a hardcoded value.
 *
 * @param value The prop value to check
 * @returns True if the value appears to be a semantic token
 */
export function isSemanticTokenValue(value: string): boolean {
  const trimmed = value.trim();

  // CSS variables are always tokens
  if (SEMANTIC_TOKEN_PATTERNS.cssVariable.test(trimmed)) {
    return true;
  }

  // Hardcoded colors are not tokens
  if (SEMANTIC_TOKEN_PATTERNS.hardcodedColor.test(trimmed)) {
    return false;
  }

  // Values with units are hardcoded
  if (SEMANTIC_TOKEN_PATTERNS.hardcodedUnit.test(trimmed)) {
    return false;
  }

  // Numeric scale values (Chakra spacing/sizing)
  if (SEMANTIC_TOKEN_PATTERNS.numericScale.test(trimmed)) {
    return true;
  }

  // Semantic paths like bg.muted, colors.primary.500
  if (SEMANTIC_TOKEN_PATTERNS.semanticPath.test(trimmed)) {
    return true;
  }

  // Size keywords
  if (SEMANTIC_TOKEN_PATTERNS.sizeKeyword.test(trimmed)) {
    return true;
  }

  // Named tokens (single lowercase word, typically variant names)
  if (SEMANTIC_TOKEN_PATTERNS.namedToken.test(trimmed) && !trimmed.includes("-")) {
    return true;
  }

  return false;
}

/**
 * Represents an extracted Chakra-style prop with its semantic token status.
 */
export interface ChakraSemanticProp {
  prop: string;
  value: string;
  isSemanticToken: boolean;
}

/**
 * Extract Chakra-style semantic props from JSX-like content.
 * Identifies which props use semantic tokens vs hardcoded values.
 *
 * @param code The JSX-like code string to parse
 * @returns Array of extracted props with semantic token classification
 */
export function extractChakraSemanticProps(code: string): ChakraSemanticProp[] {
  const props: ChakraSemanticProp[] = [];

  // Match prop="value" or prop='value' patterns (not spread or expressions)
  const propPattern = /(\w+)=["']([^"']+)["']/g;

  let match;
  while ((match = propPattern.exec(code)) !== null) {
    const [, propName, value] = match;
    if (propName && value) {
      props.push({
        prop: propName,
        value,
        isSemanticToken: isSemanticTokenValue(value),
      });
    }
  }

  return props;
}

/**
 * Represents an Ark UI component import.
 */
export interface ArkUIImport {
  originalName: string;
  alias: string;
  package: string;
}

/**
 * Extract Ark UI component imports from code.
 * Handles patterns like: import { Dialog as ArkDialog } from "@ark-ui/react/dialog"
 *
 * @param code The code string to search
 * @returns Array of Ark UI imports, or a single import object for single matches
 */
export function extractArkUIWrappedComponent(
  code: string,
): ArkUIImport[] | ArkUIImport {
  const imports: ArkUIImport[] = [];

  // Match Ark UI import statements
  const importPattern =
    /import\s+\{([^}]+)\}\s+from\s+["']@ark-ui\/react\/(\w+)["']/g;

  let match;
  while ((match = importPattern.exec(code)) !== null) {
    const [, namedImports, packageName] = match;
    if (namedImports && packageName) {
      // Parse individual imports from the destructuring
      const importItems = namedImports.split(",").map((s) => s.trim());

      for (const item of importItems) {
        // Handle "Foo as Bar" or just "Foo"
        const aliasMatch = item.match(/^(\w+)\s+as\s+(\w+)$/);
        if (aliasMatch?.[1] && aliasMatch[2]) {
          imports.push({
            originalName: aliasMatch[1],
            alias: aliasMatch[2],
            package: packageName,
          });
        } else if (isValidIdentifier(item)) {
          // Only include PascalCase component names, not hooks like useDialogContext
          if (/^[A-Z]/.test(item)) {
            imports.push({
              originalName: item,
              alias: item,
              package: packageName,
            });
          }
        }
      }
    }
  }

  // If only one import found and expecting single result, return object
  if (imports.length === 1) {
    return imports[0]!;
  }

  return imports;
}

/**
 * Represents parsed Chakra style props from an object.
 */
export interface ChakraStylePropsResult {
  /** Props using semantic tokens as "prop:value" strings */
  semanticTokens: string[];
  /** Pseudo selector props like _hover, _focus */
  pseudoSelectors: string[];
  /** Props using responsive array or object syntax */
  responsiveProps: string[];
  /** Whether the css prop is present */
  hasCssProp: boolean;
}

/**
 * Parse Chakra-style props from an object literal.
 * Identifies semantic tokens, pseudo selectors, and responsive values.
 *
 * @param code The object literal code string
 * @returns Parsed style props information
 */
export function parseChakraStyleProps(code: string): ChakraStylePropsResult {
  const result: ChakraStylePropsResult = {
    semanticTokens: [],
    pseudoSelectors: [],
    responsiveProps: [],
    hasCssProp: false,
  };

  // Check for css prop
  if (/\bcss\s*:/.test(code)) {
    result.hasCssProp = true;
  }

  // Match pseudo selectors (_hover, _focus, etc.)
  const pseudoPattern = /(_\w+)\s*:/g;
  let pseudoMatch;
  while ((pseudoMatch = pseudoPattern.exec(code)) !== null) {
    if (pseudoMatch[1]) {
      result.pseudoSelectors.push(pseudoMatch[1]);
    }
  }

  // Match responsive array syntax: prop: ["value1", "value2"]
  const responsiveArrayPattern = /(\w+)\s*:\s*\[/g;
  let arrayMatch;
  while ((arrayMatch = responsiveArrayPattern.exec(code)) !== null) {
    if (arrayMatch[1] && !arrayMatch[1].startsWith("_")) {
      result.responsiveProps.push(arrayMatch[1]);
    }
  }

  // Match responsive object syntax: prop: { base: "value", md: "value" }
  const responsiveObjPattern = /(\w+)\s*:\s*\{\s*(?:base|sm|md|lg|xl)\s*:/g;
  let objMatch;
  while ((objMatch = responsiveObjPattern.exec(code)) !== null) {
    if (objMatch[1] && !result.responsiveProps.includes(objMatch[1])) {
      result.responsiveProps.push(objMatch[1]);
    }
  }

  // Match simple semantic token props: prop: "value"
  const simplePropsPattern = /(\w+)\s*:\s*["']([^"']+)["']/g;
  let propMatch;
  while ((propMatch = simplePropsPattern.exec(code)) !== null) {
    const [, propName, value] = propMatch;
    if (
      propName &&
      value &&
      !propName.startsWith("_") &&
      propName !== "css" &&
      isSemanticTokenValue(value)
    ) {
      result.semanticTokens.push(`${propName}:${value}`);
    }
  }

  return result;
}

/**
 * Options that can be passed to HOCs like withContext, withProvider, withRootProvider.
 */
export interface HOCOptions {
  forwardAsChild?: boolean;
  defaultProps?: Record<string, unknown>;
}

/**
 * Extract options object from HOC calls.
 * Handles patterns like:
 * - withContext<A, B>(Component, "slot", { forwardAsChild: true })
 * - withRootProvider<A>(Component, { defaultProps: { ... } })
 *
 * @param code The code string to search
 * @returns The parsed options object, or null if no options found
 */
export function extractHOCOptions(code: string): HOCOptions | null {
  // First, find the HOC pattern
  const hocMatch = code.match(/with(?:Context|Provider|RootProvider)\s*<[^>]+>\s*\(/s);
  if (!hocMatch) {
    return null;
  }

  // Find the opening parenthesis position
  const parenStart = code.indexOf("(", hocMatch.index! + hocMatch[0].length - 1);
  if (parenStart === -1) {
    return null;
  }

  // Find the last { in the call which should be the options object
  // We need to find the last { before the closing )
  const callContent = code.substring(parenStart);

  // Find if there's an options object - look for pattern like ", {" at the end
  const optionsMatch = callContent.match(/,\s*\{/);
  if (!optionsMatch) {
    return null;
  }

  // Get the content starting from the {
  const optionsStart = parenStart + optionsMatch.index! + optionsMatch[0].length - 1;
  const optionsContent = extractBalancedBraces(code, optionsStart);

  if (!optionsContent) {
    return null;
  }

  const options: HOCOptions = {};

  // Parse forwardAsChild: true
  const forwardAsChildMatch = optionsContent.match(/forwardAsChild\s*:\s*(true|false)/);
  if (forwardAsChildMatch?.[1]) {
    options.forwardAsChild = forwardAsChildMatch[1] === "true";
  }

  // Parse defaultProps: { ... } - need to use balanced brace extraction
  const defaultPropsIndex = optionsContent.indexOf("defaultProps");
  if (defaultPropsIndex !== -1) {
    // Find the { after defaultProps:
    const afterDefaultProps = optionsContent.substring(defaultPropsIndex);
    const braceIndex = afterDefaultProps.indexOf("{");
    if (braceIndex !== -1) {
      const propsContent = extractBalancedBraces(
        afterDefaultProps,
        braceIndex,
      );
      if (propsContent) {
        const defaultProps: Record<string, unknown> = {};

        // Parse individual props
        const propPattern = /(\w+)\s*:\s*(true|false|"[^"]+"|'[^']+'|\d+)/g;
        let propMatch;
        while ((propMatch = propPattern.exec(propsContent)) !== null) {
          const [, propName, propValue] = propMatch;
          if (propName && propValue) {
            if (propValue === "true") {
              defaultProps[propName] = true;
            } else if (propValue === "false") {
              defaultProps[propName] = false;
            } else if (/^\d+$/.test(propValue)) {
              defaultProps[propName] = parseInt(propValue, 10);
            } else {
              // String value - remove quotes
              defaultProps[propName] = propValue.slice(1, -1);
            }
          }
        }

        if (Object.keys(defaultProps).length > 0) {
          options.defaultProps = defaultProps;
        }
      }
    }
  }

  // Only return if we found any options
  return Object.keys(options).length > 0 ? options : null;
}

/**
 * Extract type parameters from the Assign<A, B> utility type pattern.
 * Used in Chakra UI v3+ for combining Ark UI types with recipe props.
 *
 * @param code The code string to search
 * @returns Array of the two type parameters, or empty array if not found
 */
export function extractAssignTypeParams(code: string): string[] {
  // Find Assign<
  const assignIndex = code.indexOf("Assign<");
  if (assignIndex === -1) {
    return [];
  }

  // Find the opening < and use parseGenericTypeParams to get balanced content
  const startIndex = assignIndex + "Assign".length;
  const genericContent = code.substring(startIndex);
  return parseGenericTypeParams(genericContent);
}

/**
 * Extract generic type parameters that span multiple lines.
 * Handles patterns like:
 * ```
 * withContext<
 *   HTMLDivElement,
 *   DialogContentProps
 * >(...)
 * ```
 *
 * @param code The code string to search
 * @param functionName The function name to look for
 * @returns Array of type parameter strings
 */
export function extractMultilineGenericParams(
  code: string,
  functionName: string,
): string[] {
  // Match function name followed by < and capture until closing >
  // Use [^] to match any character including newlines
  const pattern = new RegExp(`${functionName}\\s*<([^]*?)>\\s*\\(`);
  const match = code.match(pattern);

  if (!match || !match[1]) {
    return [];
  }

  // Normalize whitespace and split
  const normalized = match[1].replace(/\s+/g, " ").trim();
  return splitTopLevelArgs(normalized);
}

/**
 * Represents a parsed interface declaration.
 */
export interface InterfaceDeclaration {
  name: string;
  extends: string[];
  isExported: boolean;
}

/**
 * Parse an interface declaration to extract name and extended types.
 * Handles multi-line interface declarations with multiple extends.
 *
 * @param code The code string containing an interface declaration
 * @returns Parsed interface info, or null if not an interface
 */
export function parseInterfaceDeclaration(code: string): InterfaceDeclaration | null {
  // Match interface declaration, potentially multi-line
  const interfacePattern =
    /(export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?\s*\{/s;
  const match = code.match(interfacePattern);

  if (!match) {
    return null;
  }

  const [, exportKeyword, name, extendsClause] = match;

  const result: InterfaceDeclaration = {
    name: name || "",
    extends: [],
    isExported: !!exportKeyword,
  };

  if (!name) {
    return null;
  }

  if (extendsClause) {
    // Split extends by comma at top level
    result.extends = splitTopLevelArgs(extendsClause.trim());
  }

  return result;
}

/**
 * Represents an exported constant declaration.
 */
export interface ExportedConstant {
  name: string;
  pattern: string;
  genericParams?: string[];
}

/**
 * Extract all exported constant declarations from code.
 * Useful for batch processing component declarations.
 *
 * @param code The code string to search
 * @returns Array of exported constants with their patterns
 */
export function extractExportedConstants(code: string): ExportedConstant[] {
  const constants: ExportedConstant[] = [];

  // Match export const Name = pattern
  // Use a multiline-aware pattern to capture the initializer
  const exportPattern = /export\s+const\s+([A-Z][a-zA-Z0-9_]*)\s*=\s*/g;

  let match;
  while ((match = exportPattern.exec(code)) !== null) {
    const name = match[1];
    if (!name) continue;

    // Find what follows the = sign
    const startIndex = match.index + match[0].length;
    const remaining = code.substring(startIndex);

    // Find the pattern (function name or first identifier)
    const patternMatch = remaining.match(/^([a-zA-Z_$][a-zA-Z0-9_$.<>]*)/);
    if (patternMatch?.[1]) {
      const pattern = patternMatch[1];

      // Try to extract generic params if present
      let genericParams: string[] | undefined;
      const functionName = pattern.replace(/<.*$/, "");
      if (functionName) {
        const params = extractMultilineGenericParams(remaining, functionName);
        if (params.length > 0) {
          genericParams = params;
        }
      }

      constants.push({
        name,
        pattern,
        genericParams,
      });
    }
  }

  return constants;
}

/**
 * Types of component patterns that can be classified.
 */
export type ComponentPatternType =
  | "forwardRef"
  | "memo"
  | "chakra-recipe"
  | "chakra-slot-recipe"
  | "chakra-with-context"
  | "chakra-root-provider"
  | "chakra-styled"
  | "mantine-factory"
  | "mantine-polymorphic-factory"
  | "cva"
  | "styled-components"
  | "unknown";

/**
 * Result of classifying a component's pattern.
 */
export interface ComponentPatternClassification {
  /** The detected pattern type */
  pattern: ComponentPatternType;
  /** Whether this is a design system component (vs utility/helper) */
  isDesignSystemComponent: boolean;
  /** The recipe key if using Chakra recipe context */
  recipeKey?: string;
  /** The wrapped component name (for HOC patterns) */
  wrappedComponent?: string;
  /** The slot name (for slot-based components) */
  slotName?: string;
  /** The element type (for chakra styled factory) */
  elementType?: string;
  /** Ark UI components imported in this file */
  arkUIImports?: string[];
}

/**
 * Classify the component pattern used in a code snippet.
 * Detects various design system patterns like Chakra recipes, Mantine factories, etc.
 *
 * @param code The code string to analyze
 * @returns Classification result with pattern type and metadata
 */
export function classifyComponentPattern(code: string): ComponentPatternClassification {
  const result: ComponentPatternClassification = {
    pattern: "unknown",
    isDesignSystemComponent: false,
  };

  // Extract Ark UI imports if present
  const arkImports = extractArkUIImportNames(code);
  if (arkImports.length > 0) {
    result.arkUIImports = arkImports;
  }

  // Check for Chakra recipe context patterns (most specific first)
  if (COMMON_REACT_PATTERNS.slotRecipeContext.test(code)) {
    result.pattern = "chakra-slot-recipe";
    result.isDesignSystemComponent = true;
    result.recipeKey = extractRecipeKey(code) ?? undefined;
    return result;
  }

  if (COMMON_REACT_PATTERNS.recipeContext.test(code)) {
    result.pattern = "chakra-recipe";
    result.isDesignSystemComponent = true;
    result.recipeKey = extractRecipeKey(code) ?? undefined;
    return result;
  }

  // Check for withRootProvider pattern
  if (COMMON_REACT_PATTERNS.withRootProvider.test(code)) {
    result.pattern = "chakra-root-provider";
    result.isDesignSystemComponent = true;
    result.wrappedComponent = extractRootProviderWrappedComponent(code) ?? undefined;
    return result;
  }

  // Check for withContext pattern (with slot info)
  if (COMMON_REACT_PATTERNS.withContext.test(code)) {
    result.pattern = "chakra-with-context";
    result.isDesignSystemComponent = true;
    result.wrappedComponent = extractHOCWrappedType(code) ?? undefined;
    result.slotName = extractSlotName(code) ?? undefined;
    return result;
  }

  // Check for withProvider pattern
  if (COMMON_REACT_PATTERNS.withProvider.test(code)) {
    result.pattern = "chakra-with-context"; // Same pattern type as withContext
    result.isDesignSystemComponent = true;
    result.wrappedComponent = extractHOCWrappedType(code) ?? undefined;
    result.slotName = extractSlotName(code) ?? undefined;
    return result;
  }

  // Check for chakra styled factory
  if (COMMON_REACT_PATTERNS.chakraStyled.test(code)) {
    result.pattern = "chakra-styled";
    result.isDesignSystemComponent = true;
    result.elementType = extractChakraElementType(code) ?? undefined;
    return result;
  }

  // Check for Mantine patterns
  if (COMMON_REACT_PATTERNS.polymorphicFactory.test(code)) {
    result.pattern = "mantine-polymorphic-factory";
    result.isDesignSystemComponent = true;
    return result;
  }

  if (COMMON_REACT_PATTERNS.factory.test(code)) {
    result.pattern = "mantine-factory";
    result.isDesignSystemComponent = true;
    return result;
  }

  // Check for cva pattern
  if (COMMON_REACT_PATTERNS.cva.test(code)) {
    result.pattern = "cva";
    result.isDesignSystemComponent = true;
    return result;
  }

  // Check for styled-components pattern
  if (COMMON_REACT_PATTERNS.styled.test(code)) {
    result.pattern = "styled-components";
    result.isDesignSystemComponent = true;
    return result;
  }

  // Check for React patterns (forwardRef and memo)
  if (COMMON_REACT_PATTERNS.forwardRefCall.test(code)) {
    result.pattern = "forwardRef";
    result.isDesignSystemComponent = true;
    return result;
  }

  if (COMMON_REACT_PATTERNS.memo.test(code)) {
    result.pattern = "memo";
    result.isDesignSystemComponent = true;
    return result;
  }

  return result;
}

/**
 * Extract component names from Ark UI import statements.
 *
 * @param code The code string to search
 * @returns Array of component names imported from Ark UI
 */
function extractArkUIImportNames(code: string): string[] {
  const names: string[] = [];
  const importPattern = /import\s+\{([^}]+)\}\s+from\s+["']@ark-ui\/react\/\w+["']/g;

  let match;
  while ((match = importPattern.exec(code)) !== null) {
    const namedImports = match[1];
    if (namedImports) {
      const items = namedImports.split(",").map((s) => s.trim());
      for (const item of items) {
        // Handle "Foo as Bar" or just "Foo"
        const aliasMatch = item.match(/^(\w+)\s+as\s+\w+$/);
        if (aliasMatch?.[1] && /^[A-Z]/.test(aliasMatch[1])) {
          names.push(aliasMatch[1]);
        } else if (isValidIdentifier(item) && /^[A-Z]/.test(item)) {
          names.push(item);
        }
      }
    }
  }

  return names;
}

/**
 * Extract the wrapped component from withRootProvider calls.
 * E.g., from `withRootProvider<Props>(ArkDialog.Root, { ... })` extracts "ArkDialog.Root".
 *
 * @param code The code string to search
 * @returns The wrapped component name, or null if not found
 */
export function extractRootProviderWrappedComponent(code: string): string | null {
  // Match withRootProvider<...>(ComponentName) or withRootProvider<...>(ComponentName, { ... })
  const pattern = /withRootProvider\s*<[^>]+>\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$.]*)\s*[,)]/;
  const match = code.match(pattern);
  return match?.[1] ?? null;
}

/**
 * Patterns that indicate a file is auto-generated.
 */
const GENERATED_FILE_PATTERNS = [
  /auto-generated/i,
  /AUTO GENERATED/i,
  /@generated/,
  /DO NOT EDIT/i,
  /This file is generated/i,
  /Generated by/i,
  /generated file/i,
];

/**
 * Check if a file appears to be auto-generated based on its content.
 *
 * @param content The file content to check
 * @returns True if the file appears to be generated
 */
export function isGeneratedFile(content: string): boolean {
  // Only check the first 500 characters (header comments)
  const header = content.substring(0, 500);
  return GENERATED_FILE_PATTERNS.some((pattern) => pattern.test(header));
}

/**
 * Information about the design system detected in code.
 */
export interface DesignSystemInfo {
  /** The detected design system name, or null if not detected */
  designSystem: string | null;
  /** Patterns found in the code */
  patterns: string[];
  /** Recipe keys found (for Chakra) */
  recipeKeys: string[];
  /** Ark UI components found */
  arkComponents: string[];
}

/**
 * Extract design system information from code.
 * Analyzes imports and patterns to determine which design system is used.
 *
 * @param code The code string to analyze
 * @returns Design system information
 */
export function extractDesignSystemInfo(code: string): DesignSystemInfo {
  const result: DesignSystemInfo = {
    designSystem: null,
    patterns: [],
    recipeKeys: [],
    arkComponents: [],
  };

  // Check imports for design system packages
  const imports = extractImports(code);
  for (const [, { source }] of imports) {
    if (source.includes("@chakra-ui")) {
      result.designSystem = "chakra-ui";
      break;
    }
    if (source.includes("@mantine")) {
      result.designSystem = "mantine";
      break;
    }
    if (source.includes("@ark-ui")) {
      result.designSystem = "ark-ui";
      break;
    }
  }

  // Detect patterns
  if (COMMON_REACT_PATTERNS.recipeContext.test(code)) {
    result.patterns.push("createRecipeContext");
    const key = extractRecipeKey(code);
    if (key) result.recipeKeys.push(key);
  }

  if (COMMON_REACT_PATTERNS.slotRecipeContext.test(code)) {
    result.patterns.push("createSlotRecipeContext");
    const key = extractRecipeKey(code);
    if (key && !result.recipeKeys.includes(key)) {
      result.recipeKeys.push(key);
    }
  }

  if (COMMON_REACT_PATTERNS.factory.test(code)) {
    result.patterns.push("factory");
  }

  if (COMMON_REACT_PATTERNS.polymorphicFactory.test(code)) {
    result.patterns.push("polymorphicFactory");
  }

  // Extract Ark UI components
  const arkImports = extractArkUIImportNames(code);
  result.arkComponents = arkImports;

  // If we found Ark components but no design system yet, it's Ark UI
  if (!result.designSystem && arkImports.length > 0) {
    result.designSystem = "ark-ui";
  }

  return result;
}

/**
 * Result of extracting a recipe definition.
 */
export interface RecipeDefinitionResult {
  /** The variable name (e.g., "buttonRecipe") */
  name: string;
  /** The className from the recipe config */
  className: string | null;
  /** The type of recipe: "recipe" or "slotRecipe" */
  type: "recipe" | "slotRecipe";
  /** The slots array for slot recipes */
  slots?: string[];
}

/**
 * Extract recipe definition from defineRecipe or defineSlotRecipe calls.
 * Used in Chakra UI theme files to define component styling.
 *
 * @param code The code string to search
 * @returns Recipe definition info, or null if not found
 */
export function extractRecipeDefinition(code: string): RecipeDefinitionResult | null {
  // Match: export const buttonRecipe = defineRecipe({ ... }) or defineSlotRecipe({ ... })
  const recipePattern = /(?:export\s+)?const\s+(\w+)\s*=\s*define(Slot)?Recipe\s*\(\s*\{/;
  const match = code.match(recipePattern);

  if (!match) {
    return null;
  }

  const name = match[1]!;
  const isSlotRecipe = !!match[2];

  // Find the opening brace and extract the object content
  const openBraceIndex = code.indexOf("{", match.index! + match[0].length - 1);
  const objectContent = extractBalancedBraces(code, openBraceIndex);

  if (!objectContent) {
    return null;
  }

  // Extract className
  const className = extractObjectProperty(objectContent, "className");

  const result: RecipeDefinitionResult = {
    name,
    className,
    type: isSlotRecipe ? "slotRecipe" : "recipe",
  };

  // Extract slots for slot recipes
  if (isSlotRecipe) {
    const slotsMatch = objectContent.match(/slots\s*:\s*\[([^\]]+)\]/);
    if (slotsMatch?.[1]) {
      const slotsStr = slotsMatch[1];
      const slots = slotsStr
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter((s) => s.length > 0);
      result.slots = slots;
    }
  }

  return result;
}

/**
 * Result of extracting anatomy parts.
 */
export interface AnatomyPartsResult {
  /** The variable name (e.g., "alertAnatomy") */
  name: string;
  /** The anatomy key (e.g., "alert") */
  key: string | null;
  /** The parts defined in .parts() */
  parts?: string[];
  /** The parts added via .extendWith() */
  extendedParts?: string[];
}

/**
 * Extract anatomy parts from createAnatomy().parts() or .extendWith() patterns.
 * Used in Chakra UI and Ark UI to define component slot structure.
 *
 * @param code The code string to search
 * @returns Anatomy parts info, or null if not found
 */
export function extractAnatomyParts(code: string): AnatomyPartsResult | null {
  // Pattern 1: createAnatomy("key").parts(...)
  const createAnatomyPattern = /(?:export\s+)?const\s+(\w+)\s*=\s*createAnatomy\s*\(\s*["']([^"']+)["']/;
  const createMatch = code.match(createAnatomyPattern);

  if (createMatch) {
    const name = createMatch[1]!;
    const key = createMatch[2]!;

    // Check for .parts(...) method call
    const partsPattern = /\.parts\s*\(\s*([^)]+)\)/;
    const partsMatch = code.match(partsPattern);

    // Check for array syntax: createAnatomy("key", [...])
    const arrayPattern = new RegExp(`createAnatomy\\s*\\(\\s*["']${key}["']\\s*,\\s*\\[([^\\]]+)\\]`);
    const arrayMatch = code.match(arrayPattern);

    let parts: string[] | undefined;

    if (partsMatch?.[1]) {
      parts = partsMatch[1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter((s) => s.length > 0 && !s.includes("("));
    } else if (arrayMatch?.[1]) {
      parts = arrayMatch[1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter((s) => s.length > 0);
    }

    return { name, key, parts };
  }

  // Pattern 2: variable.extendWith(...)
  const extendWithPattern = /(?:export\s+)?const\s+(\w+)\s*=\s*\w+\.extendWith\s*\(\s*([^)]+)\)/;
  const extendMatch = code.match(extendWithPattern);

  if (extendMatch) {
    const name = extendMatch[1]!;
    const partsStr = extendMatch[2]!;

    const extendedParts = partsStr
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter((s) => s.length > 0);

    return { name, key: null, extendedParts };
  }

  return null;
}

/**
 * Result of extracting a chakra factory component.
 */
export interface ChakraFactoryComponentResult {
  /** The variable name (e.g., "Box", "StyledSelect") */
  name: string;
  /** The HTML element if wrapping an element (e.g., "div") */
  element?: string;
  /** The wrapped component if wrapping a component (e.g., "ArkPresence") */
  wrappedComponent?: string;
  /** Whether this wraps a component (true) or element (false) */
  wrapsComponent: boolean;
  /** Whether base styles are defined */
  hasBaseStyle?: boolean;
  /** Whether forwardAsChild is set */
  forwardAsChild?: boolean;
}

/**
 * Extract component info from chakra() factory calls.
 * Handles both chakra("element", options) and chakra(Component, styleProps, options).
 *
 * @param code The code string to search
 * @returns Chakra factory component info, or null if not found
 */
export function extractChakraFactoryComponent(code: string): ChakraFactoryComponentResult | null {
  // Pattern: (export)? const Name = chakra(...)
  const factoryPattern = /(?:export\s+)?const\s+(\w+)\s*=\s*chakra\s*\(/;
  const match = code.match(factoryPattern);

  if (!match) {
    return null;
  }

  const name = match[1]!;
  const startIndex = match.index! + match[0].length;

  // Find what's being passed to chakra()
  const remaining = code.substring(startIndex);

  // Check for string element: chakra("div", ...)
  const elementMatch = remaining.match(/^["']([a-z]+)["']/);
  if (elementMatch) {
    const element = elementMatch[1]!;

    // Check if there's a second argument with base styles
    const hasBaseStyle = /,\s*\{[^}]*base\s*:/.test(remaining);

    return {
      name,
      element,
      wrapsComponent: false,
      hasBaseStyle,
    };
  }

  // Check for component: chakra(ComponentName, ...)
  const componentMatch = remaining.match(/^([A-Z][a-zA-Z0-9_.]*)/);
  if (componentMatch) {
    const wrappedComponent = componentMatch[1]!;

    // Check for forwardAsChild in the third argument
    const forwardAsChildMatch = remaining.match(/forwardAsChild\s*:\s*true/);

    return {
      name,
      wrappedComponent,
      wrapsComponent: true,
      forwardAsChild: !!forwardAsChildMatch,
    };
  }

  return null;
}

/**
 * Result of extracting InferRecipeProps usage.
 */
export interface InferRecipePropsResult {
  /** The type alias name (e.g., "VariantProps") */
  typeName: string;
  /** The source component/recipe name (e.g., "StyledGroup") */
  sourceComponent: string;
  /** Whether this is a slot recipe (InferSlotRecipeProps) */
  isSlotRecipe?: boolean;
}

/**
 * Extract InferRecipeProps or InferSlotRecipeProps usage.
 * Used to infer variant props from chakra factory components.
 *
 * @param code The code string to search
 * @returns Infer recipe props info, or null if not found
 */
export function extractInferRecipeProps(code: string): InferRecipePropsResult | null {
  // Match: type VariantProps = Infer(Slot)?RecipeProps<typeof X>
  const inferPattern = /type\s+(\w+)\s*=\s*Infer(Slot)?RecipeProps\s*<\s*typeof\s+(\w+)\s*>/;
  const match = code.match(inferPattern);

  if (!match) {
    return null;
  }

  return {
    typeName: match[1]!,
    sourceComponent: match[3]!,
    isSlotRecipe: !!match[2],
  };
}

/**
 * Result of extracting TypeScript utility type usage.
 */
export interface TypeUtilityResult {
  /** The utility type name (e.g., "Omit", "Pick") */
  utilityType: string;
  /** The base type being modified */
  baseType: string;
  /** Additional type parameters */
  params: string[];
}

/**
 * Extract TypeScript utility type usage (Omit, Pick, Partial, etc.).
 * Useful for understanding prop type modifications.
 *
 * @param code The code string to search
 * @param utilityTypeName The utility type to look for (e.g., "Omit", "Pick")
 * @returns Utility type info, or null if not found
 */
export function extractTypeUtility(
  code: string,
  utilityTypeName: string,
): TypeUtilityResult | null {
  // Build pattern for the specific utility type
  const pattern = new RegExp(`${utilityTypeName}\\s*<`);
  const match = code.match(pattern);

  if (!match) {
    return null;
  }

  // Find the generic params
  const startIndex = match.index! + match[0].length - 1;
  const genericContent = code.substring(startIndex);
  const params = parseGenericTypeParams(genericContent);

  if (params.length < 1) {
    return null;
  }

  return {
    utilityType: utilityTypeName,
    baseType: params[0]!,
    params: params.slice(1),
  };
}

/**
 * Result of extracting namespace export.
 */
export interface NamespaceExportResult {
  /** The namespace name (e.g., "Dialog") */
  name: string;
  /** The source path (e.g., "./namespace") */
  source: string;
}

/**
 * Options for extractNamespaceExport.
 */
export interface ExtractNamespaceExportOptions {
  /** If true, returns all matches as an array */
  all?: boolean;
}

/**
 * Extract namespace export patterns like `export * as Name from "./path"`.
 * Used to identify compound component namespaces.
 *
 * @param code The code string to search
 * @param options Options for extraction
 * @returns Namespace export info, or null/array depending on options
 */
export function extractNamespaceExport(
  code: string,
  options?: ExtractNamespaceExportOptions,
): NamespaceExportResult | NamespaceExportResult[] | null {
  const pattern = /export\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["']/g;

  if (options?.all) {
    const results: NamespaceExportResult[] = [];
    let match;

    while ((match = pattern.exec(code)) !== null) {
      results.push({
        name: match[1]!,
        source: match[2]!,
      });
    }

    return results;
  }

  const match = code.match(pattern);
  if (!match) {
    return null;
  }

  // Re-match to get capture groups
  const singlePattern = /export\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["']/;
  const singleMatch = code.match(singlePattern);

  if (!singleMatch) {
    return null;
  }

  return {
    name: singleMatch[1]!,
    source: singleMatch[2]!,
  };
}
