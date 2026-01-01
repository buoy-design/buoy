import { describe, it, expect } from "vitest";
import {
  extractBalancedBraces,
  extractWithDepthTracking,
  extractGenericTypeParams,
  extractObjectProperty,
  extractTypeFromGeneric,
  extractRecipeKey,
  extractPropsInterfaceName,
  extractHOCWrappedType,
  splitTopLevelArgs,
  COMMON_REACT_PATTERNS,
} from "./parser-utils.js";

describe("parser-utils", () => {
  describe("extractBalancedBraces", () => {
    it("should extract simple object content", () => {
      const content = "{ key: 'button' }";
      expect(extractBalancedBraces(content, 0)).toBe(" key: 'button' ");
    });

    it("should handle nested braces", () => {
      const content = "{ cb: () => { value: string } }";
      expect(extractBalancedBraces(content, 0)).toBe(
        " cb: () => { value: string } "
      );
    });

    it("should return null for unbalanced braces", () => {
      const content = "{ key: 'button'";
      expect(extractBalancedBraces(content, 0)).toBeNull();
    });

    it("should return null when start is not a brace", () => {
      const content = "key: 'button' }";
      expect(extractBalancedBraces(content, 0)).toBeNull();
    });
  });

  describe("extractWithDepthTracking", () => {
    it("should extract until delimiter at depth 0", () => {
      const content = "string, number";
      const result = extractWithDepthTracking(content, 0, [","]);
      expect(result.value).toBe("string");
      expect(result.endIndex).toBe(6);
    });

    it("should skip delimiters inside nested structures", () => {
      const content = "Array<string, number>, boolean";
      const result = extractWithDepthTracking(content, 0, [","]);
      expect(result.value).toBe("Array<string, number>");
      expect(result.endIndex).toBe(21);
    });

    it("should handle complex nested generics", () => {
      const content = "Record<string, { key: value }>, next";
      const result = extractWithDepthTracking(content, 0, [","]);
      expect(result.value).toBe("Record<string, { key: value }>");
    });
  });

  describe("extractGenericTypeParams", () => {
    it("should extract generic parameters from forwardRef", () => {
      const code = "forwardRef<HTMLButtonElement, ButtonProps>";
      const result = extractGenericTypeParams(code, "forwardRef");
      expect(result).toEqual(["HTMLButtonElement", "ButtonProps"]);
    });

    it("should extract single generic parameter", () => {
      const code = "memo<ButtonProps>";
      const result = extractGenericTypeParams(code, "memo");
      expect(result).toEqual(["ButtonProps"]);
    });

    it("should handle nested generics", () => {
      const code = "withContext<HTMLInputElement, InputProps>";
      const result = extractGenericTypeParams(code, "withContext");
      expect(result).toEqual(["HTMLInputElement", "InputProps"]);
    });

    it("should return empty array when no match", () => {
      const code = "const foo = bar";
      const result = extractGenericTypeParams(code, "forwardRef");
      expect(result).toEqual([]);
    });

    it("should handle complex generic with object type", () => {
      const code = "forwardRef<HTMLDivElement, { children: ReactNode }>";
      const result = extractGenericTypeParams(code, "forwardRef");
      expect(result).toEqual(["HTMLDivElement", "{ children: ReactNode }"]);
    });
  });

  describe("extractObjectProperty", () => {
    it("should extract key property from recipe context", () => {
      const code = 'createRecipeContext({ key: "button" })';
      expect(extractObjectProperty(code, "key")).toBe("button");
    });

    it("should extract key with single quotes", () => {
      const code = "createRecipeContext({ key: 'input' })";
      expect(extractObjectProperty(code, "key")).toBe("input");
    });

    it("should extract property with identifier value", () => {
      const code = "{ key: buttonKey }";
      expect(extractObjectProperty(code, "key")).toBe("buttonKey");
    });

    it("should return null when property not found", () => {
      const code = "{ other: 'value' }";
      expect(extractObjectProperty(code, "key")).toBeNull();
    });

    it("should handle multiline objects", () => {
      const code = `{
        key: "card",
        variant: "default"
      }`;
      expect(extractObjectProperty(code, "key")).toBe("card");
    });
  });

  describe("extractRecipeKey", () => {
    it("should extract key from createRecipeContext", () => {
      const code = 'const { withContext } = createRecipeContext({ key: "button" })';
      expect(extractRecipeKey(code)).toBe("button");
    });

    it("should extract key from createSlotRecipeContext", () => {
      const code =
        'const { withProvider } = createSlotRecipeContext({ key: "card" })';
      expect(extractRecipeKey(code)).toBe("card");
    });

    it("should return null when no recipe context", () => {
      const code = "const Button = forwardRef()";
      expect(extractRecipeKey(code)).toBeNull();
    });
  });

  describe("extractTypeFromGeneric", () => {
    it("should extract type from HTMLChakraProps", () => {
      const code = 'extends HTMLChakraProps<"button", ButtonBaseProps>';
      expect(extractTypeFromGeneric(code, "HTMLChakraProps")).toBe("button");
    });

    it("should extract type from RecipeProps", () => {
      const code = 'extends RecipeProps<"input">';
      expect(extractTypeFromGeneric(code, "RecipeProps")).toBe("input");
    });

    it("should handle complex generic", () => {
      const code = 'SlotRecipeProps<"card">, UnstyledProp';
      expect(extractTypeFromGeneric(code, "SlotRecipeProps")).toBe("card");
    });
  });

  describe("extractPropsInterfaceName", () => {
    it("should extract interface name from forwardRef", () => {
      const code = "forwardRef<HTMLButtonElement, ButtonProps>";
      expect(extractPropsInterfaceName(code)).toBe("ButtonProps");
    });

    it("should extract from withContext pattern", () => {
      const code = "withContext<HTMLInputElement, InputProps>";
      expect(extractPropsInterfaceName(code)).toBe("InputProps");
    });

    it("should extract from withProvider pattern", () => {
      const code = "withProvider<HTMLDivElement, CardRootProps>";
      expect(extractPropsInterfaceName(code)).toBe("CardRootProps");
    });

    it("should return null for complex inline types", () => {
      const code = "forwardRef<HTMLDivElement, { children: ReactNode }>";
      expect(extractPropsInterfaceName(code)).toBeNull();
    });
  });

  describe("extractHOCWrappedType", () => {
    it("should extract wrapped component from withContext", () => {
      const code = "withContext<HTMLInputElement, InputProps>(ArkField.Input)";
      expect(extractHOCWrappedType(code)).toBe("ArkField.Input");
    });

    it("should extract element type from withProvider", () => {
      const code = 'withProvider<HTMLDivElement, CardRootProps>("div", "root")';
      expect(extractHOCWrappedType(code)).toBe("div");
    });

    it("should return null for non-HOC patterns", () => {
      const code = "const Button = styled.button``";
      expect(extractHOCWrappedType(code)).toBeNull();
    });
  });

  describe("splitTopLevelArgs", () => {
    it("should split simple arguments", () => {
      const code = "string, number, boolean";
      expect(splitTopLevelArgs(code)).toEqual(["string", "number", "boolean"]);
    });

    it("should preserve nested generics", () => {
      const code = "Array<string, number>, boolean";
      expect(splitTopLevelArgs(code)).toEqual([
        "Array<string, number>",
        "boolean",
      ]);
    });

    it("should handle object types", () => {
      const code = "{ key: string }, AnotherType";
      expect(splitTopLevelArgs(code)).toEqual(["{ key: string }", "AnotherType"]);
    });

    it("should handle function types", () => {
      const code = "(a: string) => void, NextType";
      expect(splitTopLevelArgs(code)).toEqual([
        "(a: string) => void",
        "NextType",
      ]);
    });
  });

  describe("COMMON_REACT_PATTERNS", () => {
    it("should match forwardRef pattern", () => {
      const code = "forwardRef<HTMLButtonElement, ButtonProps>";
      expect(COMMON_REACT_PATTERNS.forwardRef.test(code)).toBe(true);
    });

    it("should match memo pattern", () => {
      const code = "React.memo<Props>(Component)";
      expect(COMMON_REACT_PATTERNS.memo.test(code)).toBe(true);
    });

    it("should match createRecipeContext pattern", () => {
      const code = 'createRecipeContext({ key: "button" })';
      expect(COMMON_REACT_PATTERNS.recipeContext.test(code)).toBe(true);
    });

    it("should match createSlotRecipeContext pattern", () => {
      const code = 'createSlotRecipeContext({ key: "card" })';
      expect(COMMON_REACT_PATTERNS.slotRecipeContext.test(code)).toBe(true);
    });

    it("should match withContext pattern", () => {
      const code = "withContext<HTMLDivElement, Props>";
      expect(COMMON_REACT_PATTERNS.withContext.test(code)).toBe(true);
    });

    it("should match withProvider pattern", () => {
      const code = "withProvider<HTMLDivElement, Props>";
      expect(COMMON_REACT_PATTERNS.withProvider.test(code)).toBe(true);
    });

    it("should match chakra styled factory pattern", () => {
      const code = 'chakra("div", { baseStyle: {} })';
      expect(COMMON_REACT_PATTERNS.chakraStyled.test(code)).toBe(true);
    });

    it("should match interface extends pattern", () => {
      const code = "interface ButtonProps extends RecipeProps<\"button\">";
      expect(COMMON_REACT_PATTERNS.interfaceExtends.test(code)).toBe(true);
    });
  });
});
