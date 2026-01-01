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
  extractDisplayName,
  extractSlotName,
  extractChakraSemanticProps,
  extractArkUIWrappedComponent,
  isSemanticTokenValue,
  parseChakraStyleProps,
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

    it("should match withRootProvider pattern", () => {
      const code = "withRootProvider<DialogRootProps>(ArkDialog.Root)";
      expect(COMMON_REACT_PATTERNS.withRootProvider.test(code)).toBe(true);
    });

    it("should match Ark UI import pattern", () => {
      const code = 'import { Dialog as ArkDialog } from "@ark-ui/react/dialog"';
      expect(COMMON_REACT_PATTERNS.arkUIImport.test(code)).toBe(true);
    });

    it("should match displayName assignment pattern", () => {
      const code = 'Button.displayName = "Button"';
      expect(COMMON_REACT_PATTERNS.displayName.test(code)).toBe(true);
    });
  });

  describe("extractDisplayName", () => {
    it("should extract displayName from assignment", () => {
      const code = 'Button.displayName = "Button"';
      expect(extractDisplayName(code)).toBe("Button");
    });

    it("should extract displayName with single quotes", () => {
      const code = "Heading.displayName = 'Heading'";
      expect(extractDisplayName(code)).toBe("Heading");
    });

    it("should return null when no displayName", () => {
      const code = "const Button = forwardRef()";
      expect(extractDisplayName(code)).toBeNull();
    });

    it("should extract displayName from multiline code", () => {
      const code = `
        export const Skeleton = chakra("div", {})
        Skeleton.displayName = "Skeleton"
      `;
      expect(extractDisplayName(code)).toBe("Skeleton");
    });
  });

  describe("extractSlotName", () => {
    it("should extract slot name from withContext call", () => {
      const code = 'withContext<HTMLDivElement, CardBodyProps>("div", "body")';
      expect(extractSlotName(code)).toBe("body");
    });

    it("should extract slot name from withProvider call", () => {
      const code = 'withProvider<HTMLDivElement, CardRootProps>("div", "root")';
      expect(extractSlotName(code)).toBe("root");
    });

    it("should return null when no slot name", () => {
      const code = "withContext<HTMLInputElement, InputProps>(ArkField.Input)";
      expect(extractSlotName(code)).toBeNull();
    });

    it("should handle slot names with single quotes", () => {
      const code = "withContext<HTMLHeadingElement, CardTitleProps>('h3', 'title')";
      expect(extractSlotName(code)).toBe("title");
    });
  });

  describe("extractChakraSemanticProps", () => {
    it("should extract semantic props from JSX-like string", () => {
      const code = '<Box padding="6" bg="bg.muted" borderWidth="1px" rounded="lg" />';
      const props = extractChakraSemanticProps(code);
      expect(props).toContainEqual({ prop: "padding", value: "6", isSemanticToken: true });
      expect(props).toContainEqual({ prop: "bg", value: "bg.muted", isSemanticToken: true });
      expect(props).toContainEqual({ prop: "rounded", value: "lg", isSemanticToken: true });
    });

    it("should identify hardcoded values vs semantic tokens", () => {
      const code = '<Box color="#ff0000" padding="4" margin="1rem" />';
      const props = extractChakraSemanticProps(code);
      expect(props).toContainEqual({ prop: "color", value: "#ff0000", isSemanticToken: false });
      expect(props).toContainEqual({ prop: "padding", value: "4", isSemanticToken: true });
      expect(props).toContainEqual({ prop: "margin", value: "1rem", isSemanticToken: false });
    });

    it("should handle object spread syntax", () => {
      const code = '<chakra.button {...rest} className={cx(result.className)} />';
      const props = extractChakraSemanticProps(code);
      // Should not crash on spread syntax
      expect(Array.isArray(props)).toBe(true);
    });
  });

  describe("isSemanticTokenValue", () => {
    it("should identify numeric scale tokens", () => {
      expect(isSemanticTokenValue("4")).toBe(true);
      expect(isSemanticTokenValue("12")).toBe(true);
      expect(isSemanticTokenValue("0.5")).toBe(true);
    });

    it("should identify semantic path tokens", () => {
      expect(isSemanticTokenValue("bg.muted")).toBe(true);
      expect(isSemanticTokenValue("colors.primary.500")).toBe(true);
      expect(isSemanticTokenValue("spacing.lg")).toBe(true);
    });

    it("should identify size keywords", () => {
      expect(isSemanticTokenValue("sm")).toBe(true);
      expect(isSemanticTokenValue("md")).toBe(true);
      expect(isSemanticTokenValue("lg")).toBe(true);
      expect(isSemanticTokenValue("xl")).toBe(true);
      expect(isSemanticTokenValue("2xl")).toBe(true);
    });

    it("should reject hardcoded values", () => {
      expect(isSemanticTokenValue("#ff0000")).toBe(false);
      expect(isSemanticTokenValue("rgb(255, 0, 0)")).toBe(false);
      expect(isSemanticTokenValue("16px")).toBe(false);
      expect(isSemanticTokenValue("1rem")).toBe(false);
      expect(isSemanticTokenValue("100vh")).toBe(false);
    });

    it("should accept CSS variables as tokens", () => {
      expect(isSemanticTokenValue("var(--chakra-colors-primary)")).toBe(true);
    });
  });

  describe("extractArkUIWrappedComponent", () => {
    it("should extract Ark UI component from import", () => {
      const code = 'import { Dialog as ArkDialog } from "@ark-ui/react/dialog"';
      const result = extractArkUIWrappedComponent(code);
      expect(result).toEqual({ originalName: "Dialog", alias: "ArkDialog", package: "dialog" });
    });

    it("should handle multiple Ark UI imports", () => {
      const code = `
        import { Dialog as ArkDialog, useDialogContext } from "@ark-ui/react/dialog"
        import { Field as ArkField } from "@ark-ui/react/field"
      `;
      const results = extractArkUIWrappedComponent(code);
      expect(results).toContainEqual({ originalName: "Dialog", alias: "ArkDialog", package: "dialog" });
      expect(results).toContainEqual({ originalName: "Field", alias: "ArkField", package: "field" });
    });

    it("should handle imports without alias", () => {
      const code = 'import { Avatar } from "@ark-ui/react/avatar"';
      const result = extractArkUIWrappedComponent(code);
      // Single import returns object directly, not array
      expect(result).toEqual({ originalName: "Avatar", alias: "Avatar", package: "avatar" });
    });
  });

  describe("parseChakraStyleProps", () => {
    it("should parse Chakra style props from object", () => {
      const code = `{
        padding: "6",
        bg: "bg.muted",
        _hover: { bg: "bg.emphasized" },
        borderRadius: "lg"
      }`;
      const result = parseChakraStyleProps(code);
      expect(result.semanticTokens).toContain("padding:6");
      expect(result.semanticTokens).toContain("bg:bg.muted");
      expect(result.semanticTokens).toContain("borderRadius:lg");
      expect(result.pseudoSelectors).toContain("_hover");
    });

    it("should identify responsive array syntax", () => {
      const code = '{ padding: ["4", "6", "8"] }';
      const result = parseChakraStyleProps(code);
      expect(result.responsiveProps).toContain("padding");
    });

    it("should identify responsive object syntax", () => {
      const code = '{ fontSize: { base: "sm", md: "md", lg: "lg" } }';
      const result = parseChakraStyleProps(code);
      expect(result.responsiveProps).toContain("fontSize");
    });

    it("should handle css prop with array", () => {
      const code = '{ css: [result.styles, props.css] }';
      const result = parseChakraStyleProps(code);
      expect(result.hasCssProp).toBe(true);
    });
  });
});
