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
  extractHOCOptions,
  extractAssignTypeParams,
  extractMultilineGenericParams,
  parseInterfaceDeclaration,
  extractExportedConstants,
  classifyComponentPattern,
  extractRootProviderWrappedComponent,
  isGeneratedFile,
  extractDesignSystemInfo,
  extractRecipeDefinition,
  extractAnatomyParts,
  extractChakraFactoryComponent,
  extractInferRecipeProps,
  extractTypeUtility,
  extractNamespaceExport,
  extractConditionalTypeInfer,
  extractTemplateLiteralType,
  extractMappedTypeKeys,
  extractRecursiveTypePattern,
  extractCallableInterfaceSignature,
  extractTypeAssertion,
  extractContextReExport,
  extractExtendWithParts,
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

  describe("extractHOCOptions", () => {
    it("should extract options from withContext with 3 arguments", () => {
      const code = 'withContext<HTMLButtonElement, DialogTriggerProps>(ArkDialog.Trigger, "trigger", { forwardAsChild: true })';
      const result = extractHOCOptions(code);
      expect(result).not.toBeNull();
      expect(result?.forwardAsChild).toBe(true);
    });

    it("should extract options from withRootProvider with defaultProps", () => {
      const code = `withRootProvider<DialogRootProps>(ArkDialog.Root, {
        defaultProps: { unmountOnExit: true, lazyMount: true },
      })`;
      const result = extractHOCOptions(code);
      expect(result).not.toBeNull();
      expect(result?.defaultProps).toBeDefined();
      expect(result?.defaultProps?.unmountOnExit).toBe(true);
      expect(result?.defaultProps?.lazyMount).toBe(true);
    });

    it("should return null when no options", () => {
      const code = 'withContext<HTMLInputElement, InputProps>(ArkField.Input)';
      const result = extractHOCOptions(code);
      expect(result).toBeNull();
    });

    it("should handle withContext with element and slot only", () => {
      const code = 'withContext<HTMLDivElement, CardBodyProps>("div", "body")';
      const result = extractHOCOptions(code);
      expect(result).toBeNull();
    });
  });

  describe("extractAssignTypeParams", () => {
    it("should extract types from Assign<A, B>", () => {
      const code = 'Assign<ArkDialog.RootProps, SlotRecipeProps<"dialog">>';
      const result = extractAssignTypeParams(code);
      expect(result).toEqual(["ArkDialog.RootProps", 'SlotRecipeProps<"dialog">']);
    });

    it("should handle nested generics in Assign", () => {
      const code = 'Assign<ArkDialog.RootProviderProps, SlotRecipeProps<"dialog">>';
      const result = extractAssignTypeParams(code);
      expect(result).toEqual(["ArkDialog.RootProviderProps", 'SlotRecipeProps<"dialog">']);
    });

    it("should return empty array when no Assign", () => {
      const code = 'interface ButtonProps extends RecipeProps<"button">';
      const result = extractAssignTypeParams(code);
      expect(result).toEqual([]);
    });
  });

  describe("extractMultilineGenericParams", () => {
    it("should extract generic params split across lines", () => {
      const code = `withContext<
  HTMLDivElement,
  DialogContentProps
>(ArkDialog.Content, "content")`;
      const result = extractMultilineGenericParams(code, "withContext");
      expect(result).toEqual(["HTMLDivElement", "DialogContentProps"]);
    });

    it("should handle single line generics", () => {
      const code = "withContext<HTMLDivElement, CardBodyProps>(";
      const result = extractMultilineGenericParams(code, "withContext");
      expect(result).toEqual(["HTMLDivElement", "CardBodyProps"]);
    });

    it("should handle complex nested types across lines", () => {
      const code = `forwardRef<
  HTMLButtonElement,
  { children: React.ReactNode; onClick?: () => void }
>(function Button(props, ref) {`;
      const result = extractMultilineGenericParams(code, "forwardRef");
      expect(result).toEqual(["HTMLButtonElement", "{ children: React.ReactNode; onClick?: () => void }"]);
    });
  });

  describe("parseInterfaceDeclaration", () => {
    it("should parse interface with extends", () => {
      const code = 'export interface ButtonProps extends HTMLChakraProps<"button", ButtonBaseProps> {}';
      const result = parseInterfaceDeclaration(code);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("ButtonProps");
      expect(result?.extends).toContain('HTMLChakraProps<"button", ButtonBaseProps>');
    });

    it("should parse interface extending multiple types", () => {
      const code = `export interface CardRootBaseProps
  extends SlotRecipeProps<"card">,
    UnstyledProp {}`;
      const result = parseInterfaceDeclaration(code);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("CardRootBaseProps");
      expect(result?.extends).toContain('SlotRecipeProps<"card">');
      expect(result?.extends).toContain("UnstyledProp");
    });

    it("should parse interface with Assign type", () => {
      const code = `export interface DialogRootBaseProps
  extends Assign<ArkDialog.RootProps, SlotRecipeProps<"dialog">>,
    UnstyledProp {}`;
      const result = parseInterfaceDeclaration(code);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("DialogRootBaseProps");
      expect(result?.extends).toContainEqual(expect.stringContaining("Assign"));
    });

    it("should return null for non-interface", () => {
      const code = "const Button = forwardRef()";
      const result = parseInterfaceDeclaration(code);
      expect(result).toBeNull();
    });
  });

  describe("extractExportedConstants", () => {
    it("should extract multiple exported constants", () => {
      const code = `
        export const CardRoot = withProvider<HTMLDivElement, CardRootProps>("div", "root")
        export const CardBody = withContext<HTMLDivElement, CardBodyProps>("div", "body")
        export const CardHeader = withContext<HTMLDivElement, CardHeaderProps>("div", "header")
      `;
      const result = extractExportedConstants(code);
      expect(result).toHaveLength(3);
      expect(result.map(c => c.name)).toEqual(["CardRoot", "CardBody", "CardHeader"]);
    });

    it("should extract component name and initializer pattern", () => {
      const code = 'export const Input = withContext<HTMLInputElement, InputProps>(ArkField.Input)';
      const result = extractExportedConstants(code);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("Input");
      expect(result[0]?.pattern).toContain("withContext");
    });

    it("should handle forwardRef with function", () => {
      const code = `export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(inProps, ref) {
    return <chakra.button ref={ref} {...rest} />
  }
)`;
      const result = extractExportedConstants(code);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("Button");
      expect(result[0]?.pattern).toContain("forwardRef");
    });

    it("should handle chakra styled factory", () => {
      const code = 'export const Center = chakra("div", { baseStyle: {} })';
      const result = extractExportedConstants(code);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("Center");
      expect(result[0]?.pattern).toContain("chakra");
    });
  });

  describe("classifyComponentPattern", () => {
    it("should classify forwardRef pattern", () => {
      const code = `export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(inProps, ref) {
    return <chakra.button ref={ref} {...rest} />
  }
)`;
      const result = classifyComponentPattern(code);
      expect(result.pattern).toBe("forwardRef");
      expect(result.isDesignSystemComponent).toBe(true);
    });

    it("should classify Chakra recipe context pattern", () => {
      const code = `
const { useRecipeResult, PropsProvider } = createRecipeContext({ key: "button" })
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) { })
`;
      const result = classifyComponentPattern(code);
      expect(result.pattern).toBe("chakra-recipe");
      expect(result.isDesignSystemComponent).toBe(true);
      expect(result.recipeKey).toBe("button");
    });

    it("should classify Chakra slot recipe context pattern", () => {
      const code = `
const { withProvider, withContext } = createSlotRecipeContext({ key: "card" })
export const CardRoot = withProvider<HTMLDivElement, CardRootProps>("div", "root")
`;
      const result = classifyComponentPattern(code);
      expect(result.pattern).toBe("chakra-slot-recipe");
      expect(result.isDesignSystemComponent).toBe(true);
      expect(result.recipeKey).toBe("card");
    });

    it("should classify withContext pattern wrapping Ark UI component", () => {
      const code = `export const DialogTrigger = withContext<HTMLButtonElement, DialogTriggerProps>(
  ArkDialog.Trigger,
  "trigger",
  { forwardAsChild: true },
)`;
      const result = classifyComponentPattern(code);
      expect(result.pattern).toBe("chakra-with-context");
      expect(result.isDesignSystemComponent).toBe(true);
      expect(result.wrappedComponent).toBe("ArkDialog.Trigger");
      expect(result.slotName).toBe("trigger");
    });

    it("should classify withRootProvider pattern", () => {
      const code = `export const DialogRoot = withRootProvider<DialogRootProps>(ArkDialog.Root, {
  defaultProps: { unmountOnExit: true, lazyMount: true },
})`;
      const result = classifyComponentPattern(code);
      expect(result.pattern).toBe("chakra-root-provider");
      expect(result.isDesignSystemComponent).toBe(true);
      expect(result.wrappedComponent).toBe("ArkDialog.Root");
    });

    it("should classify chakra styled factory pattern", () => {
      const code = 'export const Center = chakra("div", { baseStyle: {} })';
      const result = classifyComponentPattern(code);
      expect(result.pattern).toBe("chakra-styled");
      expect(result.isDesignSystemComponent).toBe(true);
      expect(result.elementType).toBe("div");
    });

    it("should classify React.memo pattern", () => {
      const code = 'export const MemoizedComponent = memo<Props>(function Component() { })';
      const result = classifyComponentPattern(code);
      expect(result.pattern).toBe("memo");
      expect(result.isDesignSystemComponent).toBe(true);
    });

    it("should classify Mantine factory pattern", () => {
      const code = 'export const Button = factory<ButtonFactory>((_props, ref) => { })';
      const result = classifyComponentPattern(code);
      expect(result.pattern).toBe("mantine-factory");
      expect(result.isDesignSystemComponent).toBe(true);
    });

    it("should classify polymorphicFactory pattern", () => {
      const code = 'export const Box = polymorphicFactory<BoxFactory>((_props, ref) => { })';
      const result = classifyComponentPattern(code);
      expect(result.pattern).toBe("mantine-polymorphic-factory");
      expect(result.isDesignSystemComponent).toBe(true);
    });

    it("should classify cva (class-variance-authority) pattern", () => {
      const code = `const buttonVariants = cva("base-class", {
  variants: { size: { sm: "text-sm", md: "text-md" } },
})`;
      const result = classifyComponentPattern(code);
      expect(result.pattern).toBe("cva");
      expect(result.isDesignSystemComponent).toBe(true);
    });

    it("should classify styled-components pattern", () => {
      const code = 'export const Button = styled.button`color: red;`';
      const result = classifyComponentPattern(code);
      expect(result.pattern).toBe("styled-components");
      expect(result.isDesignSystemComponent).toBe(true);
    });

    it("should classify styled() wrapper pattern", () => {
      const code = 'export const StyledButton = styled(Button)`color: red;`';
      const result = classifyComponentPattern(code);
      expect(result.pattern).toBe("styled-components");
      expect(result.isDesignSystemComponent).toBe(true);
    });

    it("should return unknown for unrecognized patterns", () => {
      const code = 'export const util = () => "helper"';
      const result = classifyComponentPattern(code);
      expect(result.pattern).toBe("unknown");
      expect(result.isDesignSystemComponent).toBe(false);
    });

    it("should detect Ark UI imports in file", () => {
      const code = `
import { Dialog as ArkDialog } from "@ark-ui/react/dialog"
export const DialogTrigger = withContext<HTMLButtonElement, Props>(ArkDialog.Trigger, "trigger")
`;
      const result = classifyComponentPattern(code);
      expect(result.arkUIImports).toContain("Dialog");
    });
  });

  describe("extractRootProviderWrappedComponent", () => {
    it("should extract Ark component from withRootProvider", () => {
      const code = `export const DialogRoot = withRootProvider<DialogRootProps>(ArkDialog.Root, {
  defaultProps: { unmountOnExit: true, lazyMount: true },
})`;
      const result = extractRootProviderWrappedComponent(code);
      expect(result).toBe("ArkDialog.Root");
    });

    it("should extract Ark component from simple withRootProvider", () => {
      const code = 'export const TooltipRoot = withRootProvider<TooltipRootProps>(ArkTooltip.Root)';
      const result = extractRootProviderWrappedComponent(code);
      expect(result).toBe("ArkTooltip.Root");
    });

    it("should return null when no withRootProvider pattern", () => {
      const code = 'export const Button = forwardRef<HTMLButtonElement, ButtonProps>(() => {})';
      const result = extractRootProviderWrappedComponent(code);
      expect(result).toBeNull();
    });
  });

  describe("isGeneratedFile", () => {
    it("should detect auto-generated file markers", () => {
      expect(isGeneratedFile("// This file is auto-generated")).toBe(true);
      expect(isGeneratedFile("/* AUTO GENERATED FILE */")).toBe(true);
      expect(isGeneratedFile("// @generated")).toBe(true);
      expect(isGeneratedFile("/* eslint-disable */ // generated file")).toBe(true);
    });

    it("should not flag normal files", () => {
      expect(isGeneratedFile('import { Button } from "./button"')).toBe(false);
      expect(isGeneratedFile("export const Component = () => {}")).toBe(false);
    });

    it("should detect common generated file patterns", () => {
      expect(isGeneratedFile("// DO NOT EDIT. This file is generated")).toBe(true);
      expect(isGeneratedFile("/* Generated by script */")).toBe(true);
    });
  });

  describe("extractDesignSystemInfo", () => {
    it("should extract Chakra UI info from code", () => {
      const code = `
import { chakra, forwardRef } from "@chakra-ui/react"
const { useRecipeResult } = createRecipeContext({ key: "button" })
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button() {})
`;
      const result = extractDesignSystemInfo(code);
      expect(result.designSystem).toBe("chakra-ui");
      expect(result.patterns).toContain("createRecipeContext");
      expect(result.recipeKeys).toContain("button");
    });

    it("should extract Mantine info from code", () => {
      const code = `
import { factory } from "@mantine/core"
export const Button = factory<ButtonFactory>((_props, ref) => {})
`;
      const result = extractDesignSystemInfo(code);
      expect(result.designSystem).toBe("mantine");
      expect(result.patterns).toContain("factory");
    });

    it("should extract Ark UI info from code", () => {
      const code = `
import { Dialog as ArkDialog } from "@ark-ui/react/dialog"
export const DialogTrigger = withContext(ArkDialog.Trigger, "trigger")
`;
      const result = extractDesignSystemInfo(code);
      expect(result.designSystem).toBe("ark-ui");
      expect(result.arkComponents).toContain("Dialog");
    });

    it("should return unknown for non-design-system code", () => {
      const code = `
export function helper() { return "util" }
`;
      const result = extractDesignSystemInfo(code);
      expect(result.designSystem).toBeNull();
      expect(result.patterns).toHaveLength(0);
    });
  });

  describe("extractRecipeDefinition", () => {
    it("should extract recipe key from defineRecipe", () => {
      const code = `export const buttonRecipe = defineRecipe({
  className: "chakra-button",
  base: { display: "inline-flex" },
})`;
      const result = extractRecipeDefinition(code);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("buttonRecipe");
      expect(result?.className).toBe("chakra-button");
      expect(result?.type).toBe("recipe");
    });

    it("should extract slot recipe from defineSlotRecipe", () => {
      const code = `export const alertSlotRecipe = defineSlotRecipe({
  className: "chakra-alert",
  slots: ["root", "title", "description", "indicator"],
})`;
      const result = extractRecipeDefinition(code);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("alertSlotRecipe");
      expect(result?.className).toBe("chakra-alert");
      expect(result?.type).toBe("slotRecipe");
      expect(result?.slots).toEqual(["root", "title", "description", "indicator"]);
    });

    it("should return null for non-recipe code", () => {
      const code = `export const Button = forwardRef(() => {})`;
      const result = extractRecipeDefinition(code);
      expect(result).toBeNull();
    });
  });

  describe("extractAnatomyParts", () => {
    it("should extract parts from createAnatomy().parts()", () => {
      const code = `export const alertAnatomy = createAnatomy("alert").parts(
  "title",
  "description",
  "root",
  "indicator",
)`;
      const result = extractAnatomyParts(code);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("alertAnatomy");
      expect(result?.key).toBe("alert");
      expect(result?.parts).toEqual(["title", "description", "root", "indicator"]);
    });

    it("should extract extended parts from extendWith()", () => {
      const code = `export const dialogAnatomy = arkDialogAnatomy.extendWith(
  "header",
  "body",
  "footer",
  "backdrop",
)`;
      const result = extractAnatomyParts(code);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("dialogAnatomy");
      expect(result?.extendedParts).toEqual(["header", "body", "footer", "backdrop"]);
    });

    it("should handle createAnatomy with array syntax", () => {
      const code = `export const checkboxCardAnatomy = createAnatomy("checkbox-card", [
  "root",
  "control",
  "label",
])`;
      const result = extractAnatomyParts(code);
      expect(result).not.toBeNull();
      expect(result?.key).toBe("checkbox-card");
      expect(result?.parts).toEqual(["root", "control", "label"]);
    });

    it("should return null for non-anatomy code", () => {
      const code = `export const Button = forwardRef(() => {})`;
      const result = extractAnatomyParts(code);
      expect(result).toBeNull();
    });
  });

  describe("extractChakraFactoryComponent", () => {
    it("should extract element from chakra(element)", () => {
      const code = `export const Box = chakra("div")`;
      const result = extractChakraFactoryComponent(code);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("Box");
      expect(result?.element).toBe("div");
      expect(result?.wrapsComponent).toBe(false);
    });

    it("should extract element with options from chakra(element, options)", () => {
      const code = `export const Center = chakra("div", {
  base: { display: "flex", alignItems: "center" }
})`;
      const result = extractChakraFactoryComponent(code);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("Center");
      expect(result?.element).toBe("div");
      expect(result?.hasBaseStyle).toBe(true);
    });

    it("should extract wrapped component from chakra(Component)", () => {
      const code = `export const Presence = chakra(ArkPresence)`;
      const result = extractChakraFactoryComponent(code);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("Presence");
      expect(result?.wrappedComponent).toBe("ArkPresence");
      expect(result?.wrapsComponent).toBe(true);
    });

    it("should extract wrapped component with options from chakra(Component, {}, options)", () => {
      const code = `const StyledSelect = chakra(ArkField.Select, {}, { forwardAsChild: true })`;
      const result = extractChakraFactoryComponent(code);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("StyledSelect");
      expect(result?.wrappedComponent).toBe("ArkField.Select");
      expect(result?.forwardAsChild).toBe(true);
    });

    it("should return null for non-chakra code", () => {
      const code = `export const Button = forwardRef(() => {})`;
      const result = extractChakraFactoryComponent(code);
      expect(result).toBeNull();
    });
  });

  describe("extractInferRecipeProps", () => {
    it("should extract type from InferRecipeProps<typeof X>", () => {
      const code = `type VariantProps = InferRecipeProps<typeof StyledGroup>`;
      const result = extractInferRecipeProps(code);
      expect(result).not.toBeNull();
      expect(result?.typeName).toBe("VariantProps");
      expect(result?.sourceComponent).toBe("StyledGroup");
    });

    it("should handle InferSlotRecipeProps", () => {
      const code = `type CardVariants = InferSlotRecipeProps<typeof cardRecipe>`;
      const result = extractInferRecipeProps(code);
      expect(result).not.toBeNull();
      expect(result?.typeName).toBe("CardVariants");
      expect(result?.sourceComponent).toBe("cardRecipe");
      expect(result?.isSlotRecipe).toBe(true);
    });

    it("should return null for non-infer code", () => {
      const code = `type ButtonProps = { onClick: () => void }`;
      const result = extractInferRecipeProps(code);
      expect(result).toBeNull();
    });
  });

  describe("extractTypeUtility", () => {
    it("should extract Omit type parameters", () => {
      const code = `interface GridItemProps extends Omit<HTMLChakraProps<"div">, "columns"> {}`;
      const result = extractTypeUtility(code, "Omit");
      expect(result).not.toBeNull();
      expect(result?.utilityType).toBe("Omit");
      expect(result?.baseType).toBe('HTMLChakraProps<"div">');
      expect(result?.params).toContain('"columns"');
    });

    it("should extract Pick type parameters", () => {
      const code = `type PartialProps = Pick<ButtonProps, "variant" | "size">`;
      const result = extractTypeUtility(code, "Pick");
      expect(result).not.toBeNull();
      expect(result?.utilityType).toBe("Pick");
      expect(result?.baseType).toBe("ButtonProps");
      expect(result?.params).toContain('"variant" | "size"');
    });

    it("should extract Parameters type", () => {
      const code = `type HighlighterOptions = Parameters<typeof createHighlighter>[0]`;
      const result = extractTypeUtility(code, "Parameters");
      expect(result).not.toBeNull();
      expect(result?.utilityType).toBe("Parameters");
      expect(result?.baseType).toBe("typeof createHighlighter");
    });

    it("should return null when utility type not found", () => {
      const code = `interface ButtonProps extends BaseProps {}`;
      const result = extractTypeUtility(code, "Omit");
      expect(result).toBeNull();
    });
  });

  describe("extractNamespaceExport", () => {
    it("should extract namespace export pattern", () => {
      const code = `export * as Dialog from "./namespace"`;
      const result = extractNamespaceExport(code);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("Dialog");
      expect(result?.source).toBe("./namespace");
    });

    it("should extract multiple namespace exports", () => {
      const code = `
export * as Dialog from "./namespace"
export * as Tabs from "./namespace"
export * as Card from "./namespace"
`;
      const results = extractNamespaceExport(code, { all: true });
      expect(results).toHaveLength(3);
      expect(results?.map((r: { name: string }) => r.name)).toEqual(["Dialog", "Tabs", "Card"]);
    });

    it("should handle re-exports with different paths", () => {
      const code = `export * as Button from "./button/namespace"`;
      const result = extractNamespaceExport(code);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("Button");
      expect(result?.source).toBe("./button/namespace");
    });

    it("should return null for non-namespace exports", () => {
      const code = `export { Button } from "./button"`;
      const result = extractNamespaceExport(code);
      expect(result).toBeNull();
    });
  });

  describe("extractConditionalTypeInfer", () => {
    it("should extract inferred type from simple conditional", () => {
      const code = `type RecipeVariantProps<T extends RecipeDefinition> = T extends RecipeDefinition<infer U> ? RecipeSelection<U> : never`;
      const result = extractConditionalTypeInfer(code);
      expect(result).not.toBeNull();
      expect(result?.typeName).toBe("RecipeVariantProps");
      expect(result?.inferredVars).toContain("U");
      expect(result?.condition).toContain("RecipeDefinition<infer U>");
    });

    it("should extract multiple inferred types", () => {
      const code = `type ChakraComponent<T extends ElementType, P> = T extends ChakraComponent<infer A, infer B> ? ChakraComponent<A, P & B> : T`;
      const result = extractConditionalTypeInfer(code);
      expect(result).not.toBeNull();
      expect(result?.inferredVars).toEqual(["A", "B"]);
    });

    it("should handle nested conditional types", () => {
      const code = `type SlotRecipeResult<T> = T extends SlotRecipeDefinition<string, infer U> ? SystemSlotRecipeFn<RecipeVariantProps<infer V>> : never`;
      const result = extractConditionalTypeInfer(code);
      expect(result).not.toBeNull();
      expect(result?.inferredVars).toContain("U");
      expect(result?.inferredVars).toContain("V");
    });

    it("should return null for non-conditional types", () => {
      const code = `type ButtonProps = { onClick: () => void }`;
      const result = extractConditionalTypeInfer(code);
      expect(result).toBeNull();
    });
  });

  describe("extractTemplateLiteralType", () => {
    it("should extract template literal type pattern", () => {
      const code = `type CssVarName = \`--\${string}\``;
      const result = extractTemplateLiteralType(code);
      expect(result).not.toBeNull();
      expect(result?.typeName).toBe("CssVarName");
      expect(result?.template).toBe("`--${string}`");
    });

    it("should extract template literal with multiple placeholders", () => {
      const code = `type ColorWithOpacity = \`\${ColorToken}/\${number}\``;
      const result = extractTemplateLiteralType(code);
      expect(result).not.toBeNull();
      expect(result?.placeholders).toEqual(["ColorToken", "number"]);
    });

    it("should handle template literal with conditional type", () => {
      const code = `type WithImportant<T> = T extends string ? \`\${T}!important\` : T`;
      const result = extractTemplateLiteralType(code);
      expect(result).not.toBeNull();
      expect(result?.template).toBe("`${T}!important`");
      expect(result?.placeholders).toContain("T");
    });

    it("should return null for non-template types", () => {
      const code = `type Simple = string | number`;
      const result = extractTemplateLiteralType(code);
      expect(result).toBeNull();
    });
  });

  describe("extractMappedTypeKeys", () => {
    it("should extract mapped type with keyof", () => {
      const code = `type VariantProps = { [K in keyof BadgeVariant]?: ConditionalValue<BadgeVariant[K]> }`;
      const result = extractMappedTypeKeys(code);
      expect(result).not.toBeNull();
      expect(result?.keyVar).toBe("K");
      expect(result?.keySource).toBe("keyof BadgeVariant");
    });

    it("should extract mapped type with string literal union", () => {
      const code = `type SlotStyles = { [K in "root" | "label" | "control"]: SystemStyleObject }`;
      const result = extractMappedTypeKeys(code);
      expect(result).not.toBeNull();
      expect(result?.keyVar).toBe("K");
      expect(result?.keySource).toBe('"root" | "label" | "control"');
    });

    it("should extract mapped type with conditional value", () => {
      const code = `type FilteredProps = { [K in keyof T]: K extends U ? T[K] : never }`;
      const result = extractMappedTypeKeys(code);
      expect(result).not.toBeNull();
      expect(result?.keyVar).toBe("K");
      expect(result?.hasConditionalValue).toBe(true);
    });

    it("should return null for non-mapped types", () => {
      const code = `type Simple = { name: string }`;
      const result = extractMappedTypeKeys(code);
      expect(result).toBeNull();
    });
  });

  describe("extractRecursiveTypePattern", () => {
    it("should detect recursive type definition", () => {
      const code = `type Nested<P> = P & { [K in Selectors]?: Nested<P> }`;
      const result = extractRecursiveTypePattern(code);
      expect(result).not.toBeNull();
      expect(result?.typeName).toBe("Nested");
      expect(result?.isRecursive).toBe(true);
      expect(result?.recursionPoints).toContain("Nested<P>");
    });

    it("should detect ConditionalValue recursive pattern", () => {
      const code = `type ConditionalValue<V> = V | Array<V | null> | { [K in keyof Conditions]?: ConditionalValue<V> }`;
      const result = extractRecursiveTypePattern(code);
      expect(result).not.toBeNull();
      expect(result?.typeName).toBe("ConditionalValue");
      expect(result?.isRecursive).toBe(true);
    });

    it("should return null for non-recursive types", () => {
      const code = `type Simple<T> = T | null`;
      const result = extractRecursiveTypePattern(code);
      expect(result).toBeNull();
    });
  });

  describe("extractCallableInterfaceSignature", () => {
    it("should extract generic callable signature from interface", () => {
      const code = `interface ComboboxRootComponent {
  <T extends CollectionItem>(
    props: ComboboxRootProps<T> & React.RefAttributes<HTMLDivElement>,
  ): JSX.Element
}`;
      const result = extractCallableInterfaceSignature(code);
      expect(result).not.toBeNull();
      expect(result?.interfaceName).toBe("ComboboxRootComponent");
      expect(result?.genericParams).toContain("T extends CollectionItem");
      expect(result?.returnType).toBe("JSX.Element");
    });

    it("should handle simple callable signature without generics", () => {
      const code = `interface ButtonComponent {
  (props: ButtonProps): JSX.Element
}`;
      const result = extractCallableInterfaceSignature(code);
      expect(result).not.toBeNull();
      expect(result?.interfaceName).toBe("ButtonComponent");
      expect(result?.genericParams).toEqual([]);
      expect(result?.returnType).toBe("JSX.Element");
    });

    it("should return null for non-callable interface", () => {
      const code = `interface ButtonProps {
  onClick: () => void
}`;
      const result = extractCallableInterfaceSignature(code);
      expect(result).toBeNull();
    });
  });

  describe("extractTypeAssertion", () => {
    it("should extract type from 'as' assertion", () => {
      const code = `export const ComboboxRoot = withProvider<HTMLDivElement, ComboboxRootProps>(
  ArkCombobox.Root,
  "root",
  { forwardAsChild: true },
) as ComboboxRootComponent`;
      const result = extractTypeAssertion(code);
      expect(result).not.toBeNull();
      expect(result?.assertedType).toBe("ComboboxRootComponent");
    });

    it("should extract React.FC type assertion", () => {
      const code = `export const CheckboxGroup = chakra(
  ArkCheckbox.Group,
  { base: { display: "flex" } },
  { forwardAsChild: true },
) as React.FC<CheckboxGroupProps>`;
      const result = extractTypeAssertion(code);
      expect(result).not.toBeNull();
      expect(result?.assertedType).toBe("React.FC<CheckboxGroupProps>");
    });

    it("should return null for code without type assertion", () => {
      const code = `export const Button = forwardRef<HTMLButtonElement, ButtonProps>(() => {})`;
      const result = extractTypeAssertion(code);
      expect(result).toBeNull();
    });
  });

  describe("extractContextReExport", () => {
    it("should extract context re-export pattern", () => {
      const code = `export const DialogContext = ArkDialog.Context`;
      const result = extractContextReExport(code);
      expect(result).not.toBeNull();
      expect(result?.exportName).toBe("DialogContext");
      expect(result?.sourcePath).toBe("ArkDialog.Context");
    });

    it("should extract HiddenInput re-export", () => {
      const code = `export const CheckboxHiddenInput = ArkCheckbox.HiddenInput`;
      const result = extractContextReExport(code);
      expect(result).not.toBeNull();
      expect(result?.exportName).toBe("CheckboxHiddenInput");
      expect(result?.sourcePath).toBe("ArkCheckbox.HiddenInput");
    });

    it("should return null for regular exports", () => {
      const code = `export const Button = forwardRef(() => {})`;
      const result = extractContextReExport(code);
      expect(result).toBeNull();
    });
  });

  describe("extractExtendWithParts", () => {
    it("should extract parts from extendWith call on variable", () => {
      const code = `export const dialogAnatomy = arkDialogAnatomy.extendWith(
  "header",
  "body",
  "footer",
  "backdrop",
)`;
      const result = extractExtendWithParts(code);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("dialogAnatomy");
      expect(result?.sourceVariable).toBe("arkDialogAnatomy");
      expect(result?.parts).toEqual(["header", "body", "footer", "backdrop"]);
    });

    it("should handle single part extension", () => {
      const code = `export const accordionAnatomy = arkAccordionAnatomy.extendWith("itemBody")`;
      const result = extractExtendWithParts(code);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("accordionAnatomy");
      expect(result?.sourceVariable).toBe("arkAccordionAnatomy");
      expect(result?.parts).toEqual(["itemBody"]);
    });

    it("should handle chained extendWith on another extendWith result", () => {
      const code = `export const radioCardAnatomy = radioGroupAnatomy.extendWith(
  "itemContent",
  "itemDescription",
)`;
      const result = extractExtendWithParts(code);
      expect(result).not.toBeNull();
      expect(result?.sourceVariable).toBe("radioGroupAnatomy");
      expect(result?.parts).toEqual(["itemContent", "itemDescription"]);
    });

    it("should return null for createAnatomy (use extractAnatomyParts instead)", () => {
      const code = `export const alertAnatomy = createAnatomy("alert").parts("root", "title")`;
      const result = extractExtendWithParts(code);
      expect(result).toBeNull();
    });
  });
});
