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
