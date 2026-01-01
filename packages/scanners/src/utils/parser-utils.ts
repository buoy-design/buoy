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
 *
 * @param code The code string to search
 * @returns The slot name, or null if not found
 */
export function extractSlotName(code: string): string | null {
  // Match patterns like: withContext<...>("div", "slotName") or withProvider<...>("div", "slotName")
  const pattern =
    /with(?:Context|Provider)\s*<[^>]+>\s*\(\s*["'][^"']+["']\s*,\s*["']([^"']+)["']/;
  const match = code.match(pattern);
  return match?.[1] ?? null;
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
