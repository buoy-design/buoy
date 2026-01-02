import { describe, it, expect } from 'vitest';
import {
  extractClassPatterns,
  analyzePatternForTokens,
  ClassPatternMatch,
  extractCvaPatterns,
  extractSemanticTokens,
  extractStaticClassStrings,
  extractBemSemanticClasses,
  extractCustomPrefixClasses,
  extractDataAttributePatterns,
  extractHeadlessUIVariants,
  extractGroupPeerVariants,
  extractDataSlotAttributes,
  extractShortFormDataPatterns,
  extractDynamicDataAttributes,
  extractRenderPropClassNames,
} from './class-pattern.js';

describe('extractClassPatterns', () => {
  describe('direct template literals', () => {
    it('extracts simple template literal with variable', () => {
      const content = `<div className={\`btn-\${size}\`}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.pattern).toBe('btn-${size}');
      expect(matches[0]!.variables).toContain('size');
      expect(matches[0]!.staticParts).toContain('btn-');
      expect(matches[0]!.context).toBe('template-literal');
    });

    it('extracts template literal with multiple variables', () => {
      const content = `<div className={\`\${prefix}-\${variant}\`}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.pattern).toBe('${prefix}-${variant}');
      expect(matches[0]!.variables).toHaveLength(2);
      expect(matches[0]!.variables).toContain('prefix');
      expect(matches[0]!.variables).toContain('variant');
      expect(matches[0]!.structure).toBe('{prefix}-{variant}');
    });

    it('extracts pattern with prefix variable and static suffix', () => {
      const content = `<button className={\`\${bsPrefix}-button\`}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.staticParts).toContain('-button');
    });

    it('handles multiple patterns on different lines', () => {
      const content = `
        <div className={\`container-\${size}\`}>
          <button className={\`btn-\${variant}\`}>
      `;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(2);
      expect(matches[0]!.variables).toContain('size');
      expect(matches[1]!.variables).toContain('variant');
    });
  });

  describe('clsx and classnames utilities', () => {
    it('extracts patterns from clsx()', () => {
      const content = `<div className={clsx(bsPrefix, variant && \`\${bsPrefix}-\${variant}\`)}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.context).toBe('clsx');
      expect(matches[0]!.variables).toContain('bsPrefix');
      expect(matches[0]!.variables).toContain('variant');
    });

    it('extracts patterns from classnames()', () => {
      const content = `<div className={classnames(base, \`\${prefix}-active\`)}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.context).toBe('classnames');
    });

    it('extracts patterns from cx()', () => {
      const content = `<div className={cx(\`theme-\${color}\`)}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.context).toBe('cx');
    });

    it('extracts patterns from cn() (common shorthand)', () => {
      const content = `<div className={cn(\`size-\${size}\`)}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
    });
  });

  describe('conditional expressions', () => {
    it('extracts patterns from ternary expressions', () => {
      const content = `<div className={isActive ? \`\${prefix}-active\` : \`\${prefix}-inactive\`}>`;
      const matches = extractClassPatterns(content);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.context === 'conditional')).toBe(true);
    });
  });

  describe('multi-line patterns', () => {
    it('extracts patterns spanning multiple lines', () => {
      const content = `
        <div className={
          clsx(
            baseClass,
            variant && \`\${prefix}-\${variant}\`
          )
        }>
      `;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.variables).toContain('prefix');
      expect(matches[0]!.variables).toContain('variant');
    });
  });

  describe('react-bootstrap patterns', () => {
    it('handles typical react-bootstrap variant pattern', () => {
      const content = `
        const Button = ({ variant, size, bsPrefix = 'btn' }) => (
          <button className={clsx(bsPrefix, variant && \`\${bsPrefix}-\${variant}\`, size && \`\${bsPrefix}-\${size}\`)}>
        );
      `;
      const matches = extractClassPatterns(content);

      expect(matches.length).toBeGreaterThanOrEqual(2);
      const variantMatch = matches.find(m => m.variables.includes('variant'));
      const sizeMatch = matches.find(m => m.variables.includes('size'));

      expect(variantMatch).toBeDefined();
      expect(sizeMatch).toBeDefined();
    });

    it('handles bsPrefix prefix pattern', () => {
      const content = `<Alert className={\`\${bsPrefix} \${bsPrefix}-\${variant}\`}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.variables).toContain('bsPrefix');
      expect(matches[0]!.variables).toContain('variant');
    });
  });

  describe('edge cases', () => {
    it('ignores non-template className strings', () => {
      const content = `<div className="static-class">`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(0);
    });

    it('ignores template literals without expressions', () => {
      const content = `<div className={\`static-class\`}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(0);
    });

    it('handles complex variable expressions', () => {
      const content = `<div className={\`btn-\${props.size || 'md'}\`}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.variables).toContain("props.size || 'md'");
    });

    it('handles nested template literals', () => {
      const content = `<div className={clsx(\`outer-\${type}\`, inner && \`inner-\${inner}\`)}>`;
      const matches = extractClassPatterns(content);

      // Should find both patterns
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('CVA (class-variance-authority) patterns', () => {
  it('extracts base classes from cva() call', () => {
    const content = `
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
      },
    },
  }
)`;
    const result = extractCvaPatterns(content);

    expect(result).toHaveLength(1);
    expect(result[0]!.baseClasses).toContain('inline-flex');
    expect(result[0]!.baseClasses).toContain('rounded-md');
  });

  it('extracts variant definitions from cva()', () => {
    const content = `
const buttonVariants = cva("base-class", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground",
      destructive: "bg-destructive text-destructive-foreground",
      outline: "border border-input bg-background",
    },
    size: {
      default: "h-10 px-4 py-2",
      sm: "h-9 rounded-md px-3",
      lg: "h-11 rounded-md px-8",
    },
  },
})`;
    const result = extractCvaPatterns(content);

    expect(result).toHaveLength(1);
    expect(result[0]!.variants).toBeDefined();
    expect(result[0]!.variants!.variant).toContain('default');
    expect(result[0]!.variants!.variant).toContain('destructive');
    expect(result[0]!.variants!.size).toContain('sm');
  });

  it('extracts all semantic tokens from variant classes', () => {
    const content = `
const buttonVariants = cva("rounded-md", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground hover:bg-primary/90",
    },
  },
})`;
    const result = extractCvaPatterns(content);

    expect(result[0]!.semanticTokens).toContain('primary');
    expect(result[0]!.semanticTokens).toContain('primary-foreground');
  });

  it('handles multi-line cva with complex variants', () => {
    const content = `
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)`;
    const result = extractCvaPatterns(content);

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('buttonVariants');
    expect(result[0]!.variants!.variant).toHaveLength(6);
    expect(result[0]!.variants!.size).toHaveLength(4);
  });
});

describe('semantic Tailwind token extraction', () => {
  it('extracts semantic color tokens from class strings', () => {
    const classes = 'bg-primary text-primary-foreground hover:bg-primary/90';
    const tokens = extractSemanticTokens(classes);

    expect(tokens).toContain('primary');
    expect(tokens).toContain('primary-foreground');
  });

  it('extracts foreground tokens', () => {
    const classes = 'text-muted-foreground text-destructive-foreground';
    const tokens = extractSemanticTokens(classes);

    expect(tokens).toContain('muted-foreground');
    expect(tokens).toContain('destructive-foreground');
  });

  it('extracts background tokens', () => {
    const classes = 'bg-background bg-accent bg-muted bg-card';
    const tokens = extractSemanticTokens(classes);

    expect(tokens).toContain('background');
    expect(tokens).toContain('accent');
    expect(tokens).toContain('muted');
    expect(tokens).toContain('card');
  });

  it('extracts border tokens', () => {
    const classes = 'border-input border-ring border-destructive';
    const tokens = extractSemanticTokens(classes);

    expect(tokens).toContain('input');
    expect(tokens).toContain('ring');
    expect(tokens).toContain('destructive');
  });

  it('handles opacity modifiers', () => {
    const classes = 'bg-primary/90 text-muted-foreground/50 ring-destructive/20';
    const tokens = extractSemanticTokens(classes);

    expect(tokens).toContain('primary');
    expect(tokens).toContain('muted-foreground');
    expect(tokens).toContain('destructive');
  });

  it('handles dark mode variants', () => {
    const classes = 'dark:bg-input/30 dark:hover:bg-accent/50';
    const tokens = extractSemanticTokens(classes);

    expect(tokens).toContain('input');
    expect(tokens).toContain('accent');
  });

  it('ignores non-semantic tokens like gray-300', () => {
    const classes = 'bg-gray-300 text-slate-500 border-zinc-200';
    const tokens = extractSemanticTokens(classes);

    // Gray-scale colors are not semantic tokens
    expect(tokens).not.toContain('gray-300');
    expect(tokens).not.toContain('slate-500');
  });

  it('extracts ring tokens', () => {
    const classes = 'ring-ring focus-visible:ring-ring/50';
    const tokens = extractSemanticTokens(classes);

    expect(tokens).toContain('ring');
  });
});

describe('static className string extraction', () => {
  it('extracts static strings from cn() calls', () => {
    const content = `
      className={cn(
        "inline-flex items-center justify-center",
        "bg-primary text-primary-foreground"
      )}
    `;
    const result = extractStaticClassStrings(content);

    expect(result).toHaveLength(1);
    expect(result[0]!.classes).toContain('inline-flex');
    expect(result[0]!.classes).toContain('bg-primary');
  });

  it('extracts static strings from classNames() calls', () => {
    const content = `
      className={classNames(
        "focus:outline-hidden ui-focus-visible:ring-2",
        className
      )}
    `;
    const result = extractStaticClassStrings(content);

    expect(result).toHaveLength(1);
    expect(result[0]!.classes).toContain('focus:outline-hidden');
  });

  it('handles multi-line utility calls with mixed content', () => {
    const content = `
      <button
        className={cn(
          buttonVariants({ variant, size }),
          "custom-class",
          className
        )}
      >
    `;
    const result = extractStaticClassStrings(content);

    expect(result.some(r => r.classes.includes('custom-class'))).toBe(true);
  });
});

describe('analyzePatternForTokens', () => {
  it('identifies variant patterns with high confidence', () => {
    const match: ClassPatternMatch = {
      pattern: '${bsPrefix}-${variant}',
      structure: '{bsPrefix}-{variant}',
      variables: ['bsPrefix', 'variant'],
      staticParts: ['-'],
      line: 1,
      column: 1,
      context: 'template-literal',
    };

    const analysis = analyzePatternForTokens(match);

    expect(analysis.potentialTokenType).toBe('variant');
    expect(analysis.confidence).toBe('high');
  });

  it('identifies size patterns with high confidence', () => {
    const match: ClassPatternMatch = {
      pattern: 'btn-${size}',
      structure: 'btn-{size}',
      variables: ['size'],
      staticParts: ['btn-'],
      line: 1,
      column: 1,
      context: 'template-literal',
    };

    const analysis = analyzePatternForTokens(match);

    expect(analysis.potentialTokenType).toBe('size');
    expect(analysis.confidence).toBe('high');
  });

  it('identifies color patterns with high confidence', () => {
    const match: ClassPatternMatch = {
      pattern: 'text-${color}',
      structure: 'text-{color}',
      variables: ['color'],
      staticParts: ['text-'],
      line: 1,
      column: 1,
      context: 'template-literal',
    };

    const analysis = analyzePatternForTokens(match);

    expect(analysis.potentialTokenType).toBe('color');
    expect(analysis.confidence).toBe('high');
  });

  it('identifies type variables as variant with high confidence', () => {
    // 'type' is a common pattern for variants, similar to 'variant'
    const match: ClassPatternMatch = {
      pattern: 'btn-${type}',
      structure: 'btn-{type}',
      variables: ['type'],
      staticParts: ['btn-'],
      line: 1,
      column: 1,
      context: 'template-literal',
    };

    const analysis = analyzePatternForTokens(match);

    expect(analysis.potentialTokenType).toBe('variant');
    expect(analysis.confidence).toBe('high');
  });

  it('identifies button patterns with medium confidence from static parts', () => {
    // When variable name is generic (like 'foo'), we fall back to static parts
    const match: ClassPatternMatch = {
      pattern: 'btn-${foo}',
      structure: 'btn-{foo}',
      variables: ['foo'],
      staticParts: ['btn-'],
      line: 1,
      column: 1,
      context: 'template-literal',
    };

    const analysis = analyzePatternForTokens(match);

    expect(analysis.potentialTokenType).toBe('variant');
    expect(analysis.confidence).toBe('medium');
  });

  it('returns unknown for unrecognized patterns', () => {
    const match: ClassPatternMatch = {
      pattern: 'custom-${foo}',
      structure: 'custom-{foo}',
      variables: ['foo'],
      staticParts: ['custom-'],
      line: 1,
      column: 1,
      context: 'template-literal',
    };

    const analysis = analyzePatternForTokens(match);

    expect(analysis.potentialTokenType).toBe('unknown');
    expect(analysis.confidence).toBe('low');
  });
});

describe('BEM-like semantic class extraction', () => {
  describe('extractBemSemanticClasses', () => {
    it('extracts cn- prefixed component classes from cn() calls', () => {
      const content = `
        className={cn("cn-card group/card flex flex-col", className)}
      `;
      const result = extractBemSemanticClasses(content);

      expect(result.some(r => r.componentName === 'card')).toBe(true);
      expect(result.some(r => r.fullClass === 'cn-card')).toBe(true);
    });

    it('extracts nested BEM element classes', () => {
      const content = `
        className={cn("cn-card-header grid auto-rows-min", className)}
        className={cn("cn-card-title", className)}
        className={cn("cn-card-content", className)}
      `;
      const result = extractBemSemanticClasses(content);

      expect(result.some(r => r.fullClass === 'cn-card-header')).toBe(true);
      expect(result.some(r => r.fullClass === 'cn-card-title')).toBe(true);
      expect(result.some(r => r.fullClass === 'cn-card-content')).toBe(true);
    });

    it('extracts variant modifier classes', () => {
      const content = `
        const tabsListVariants = cva(
          "cn-tabs-list group/tabs-list text-muted-foreground",
          {
            variants: {
              variant: {
                default: "cn-tabs-list-variant-default bg-muted",
                line: "cn-tabs-list-variant-line gap-1 bg-transparent",
              },
            },
          }
        )
      `;
      const result = extractBemSemanticClasses(content);

      expect(result.some(r => r.fullClass === 'cn-tabs-list')).toBe(true);
      expect(result.some(r => r.fullClass === 'cn-tabs-list-variant-default')).toBe(true);
      expect(result.some(r => r.fullClass === 'cn-tabs-list-variant-line')).toBe(true);
    });

    it('extracts orientation variant classes', () => {
      const content = `
        const buttonGroupVariants = cva(
          "cn-button-group flex w-fit items-stretch",
          {
            variants: {
              orientation: {
                horizontal: "cn-button-group-orientation-horizontal [&>*:not(:first-child)]:rounded-l-none",
                vertical: "cn-button-group-orientation-vertical flex-col",
              },
            },
          }
        )
      `;
      const result = extractBemSemanticClasses(content);

      expect(result.some(r => r.fullClass === 'cn-button-group')).toBe(true);
      expect(result.some(r => r.fullClass === 'cn-button-group-orientation-horizontal')).toBe(true);
      expect(result.some(r => r.fullClass === 'cn-button-group-orientation-vertical')).toBe(true);
    });

    it('handles complex multi-component files', () => {
      const content = `
        function AlertDialogOverlay({ className, ...props }) {
          return (
            <AlertDialogPrimitive.Overlay
              className={cn("cn-alert-dialog-overlay fixed inset-0 z-50", className)}
            />
          )
        }

        function AlertDialogContent({ className, ...props }) {
          return (
            <AlertDialogPrimitive.Content
              className={cn("cn-alert-dialog-content group/alert-dialog-content fixed", className)}
            />
          )
        }

        function AlertDialogHeader({ className, ...props }) {
          return (
            <div className={cn("cn-alert-dialog-header", className)} />
          )
        }
      `;
      const result = extractBemSemanticClasses(content);

      expect(result.some(r => r.fullClass === 'cn-alert-dialog-overlay')).toBe(true);
      expect(result.some(r => r.fullClass === 'cn-alert-dialog-content')).toBe(true);
      expect(result.some(r => r.fullClass === 'cn-alert-dialog-header')).toBe(true);
      expect(result.some(r => r.componentName === 'alert-dialog')).toBe(true);
    });

    it('parses BEM structure correctly', () => {
      const content = `className={cn("cn-tabs-list-variant-default bg-muted", className)}`;
      const result = extractBemSemanticClasses(content);

      const match = result.find(r => r.fullClass === 'cn-tabs-list-variant-default');
      expect(match).toBeDefined();
      expect(match!.block).toBe('tabs');
      expect(match!.element).toBe('list');
      expect(match!.modifier).toBe('variant-default');
    });

    it('ignores non-prefixed utility classes', () => {
      const content = `className={cn("flex items-center justify-center bg-primary", className)}`;
      const result = extractBemSemanticClasses(content);

      // Should not include utility classes - result should be empty or all start with cn-
      expect(result.length === 0 || result.every(r => r.fullClass.startsWith('cn-'))).toBe(true);
    });

    it('extracts classes from string literals in CVA base', () => {
      const content = `
        const buttonVariants = cva(
          "cn-button inline-flex items-center justify-center",
          { variants: {} }
        )
      `;
      const result = extractBemSemanticClasses(content);

      expect(result.some(r => r.fullClass === 'cn-button')).toBe(true);
    });
  });

  describe('extractCustomPrefixClasses', () => {
    it('extracts classes with custom prefix', () => {
      const content = `
        className={cn("ui-button flex items-center", className)}
        className={cn("ui-button-group flex", className)}
      `;
      const result = extractCustomPrefixClasses(content, 'ui');

      expect(result.some(r => r.fullClass === 'ui-button')).toBe(true);
      expect(result.some(r => r.fullClass === 'ui-button-group')).toBe(true);
    });

    it('handles prefixes with data-state patterns from headlessui', () => {
      const content = `
        className="ui-active:bg-blue-500 ui-not-active:bg-gray-100"
      `;
      const result = extractCustomPrefixClasses(content, 'ui');

      // Note: this tests the variant prefix pattern used by headlessui
      expect(result.some(r => r.fullClass === 'ui-active' || r.fullClass === 'ui-not-active')).toBe(true);
    });
  });
});

// ============================================================================
// Data-Slot Attribute Extraction Tests (shadcn-ui v4)
// ============================================================================

describe('data-slot attribute extraction', () => {
  describe('extractDataSlotAttributes', () => {
    it('extracts data-slot attribute values from JSX', () => {
      const content = `
        <div data-slot="card" className={cn("cn-card", className)} />
        <div data-slot="card-header" className={cn("cn-card-header", className)} />
      `;
      const result = extractDataSlotAttributes(content);

      expect(result.some((r: { slotName: string }) => r.slotName === 'card')).toBe(true);
      expect(result.some((r: { slotName: string }) => r.slotName === 'card-header')).toBe(true);
    });

    it('extracts data-slot from template string JSX attributes', () => {
      const content = `
        return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
      `;
      const result = extractDataSlotAttributes(content);

      expect(result.some((r: { slotName: string }) => r.slotName === 'alert-dialog')).toBe(true);
    });

    it('extracts compound component slot names', () => {
      const content = `
        <TabsPrimitive.Root data-slot="tabs" />
        <TabsPrimitive.List data-slot="tabs-list" />
        <TabsPrimitive.Trigger data-slot="tabs-trigger" />
        <TabsPrimitive.Content data-slot="tabs-content" />
      `;
      const result = extractDataSlotAttributes(content);

      expect(result).toHaveLength(4);
      expect(result.map((r: { slotName: string }) => r.slotName).sort()).toEqual([
        'tabs', 'tabs-content', 'tabs-list', 'tabs-trigger'
      ].sort());
    });

    it('infers component type from slot name', () => {
      const content = `
        <div data-slot="button" />
        <div data-slot="card-header" />
        <div data-slot="dropdown-menu-item" />
      `;
      const result = extractDataSlotAttributes(content);

      const buttonSlot = result.find((r: { slotName: string }) => r.slotName === 'button');
      expect(buttonSlot?.componentType).toBe('button');

      const cardHeaderSlot = result.find((r: { slotName: string }) => r.slotName === 'card-header');
      expect(cardHeaderSlot?.parentComponent).toBe('card');
      expect(cardHeaderSlot?.elementName).toBe('header');

      const menuItemSlot = result.find((r: { slotName: string }) => r.slotName === 'dropdown-menu-item');
      expect(menuItemSlot?.parentComponent).toBe('dropdown-menu');
      expect(menuItemSlot?.elementName).toBe('item');
    });

    it('handles data-slot with additional data attributes', () => {
      const content = `
        <div
          data-slot="avatar"
          data-size={size}
          className={cn("cn-avatar", className)}
        />
      `;
      const result = extractDataSlotAttributes(content);

      expect(result.some((r: { slotName: string }) => r.slotName === 'avatar')).toBe(true);
    });

    it('returns empty array for content without data-slot', () => {
      const content = `
        <div className="flex items-center" />
      `;
      const result = extractDataSlotAttributes(content);

      expect(result).toHaveLength(0);
    });
  });
});

// ============================================================================
// Short-form Data Attribute Pattern Tests (HeadlessUI/Radix)
// ============================================================================

describe('short-form data attribute patterns', () => {
  describe('extractShortFormDataPatterns', () => {
    it('extracts data-closed: patterns', () => {
      const content = `
        className="data-closed:opacity-0 data-closed:scale-95"
      `;
      const result = extractShortFormDataPatterns(content);

      expect(result.some((r: { state: string }) => r.state === 'closed')).toBe(true);
    });

    it('extracts data-open: patterns', () => {
      const content = `
        className="data-open:rotate-180 data-open:opacity-100"
      `;
      const result = extractShortFormDataPatterns(content);

      expect(result.some((r: { state: string }) => r.state === 'open')).toBe(true);
    });

    it('extracts data-active: patterns', () => {
      const content = `
        className="data-active:bg-indigo-600 data-active:text-white"
      `;
      const result = extractShortFormDataPatterns(content);

      expect(result.some((r: { state: string }) => r.state === 'active')).toBe(true);
    });

    it('extracts data-selected: patterns', () => {
      const content = `
        className="data-selected:font-semibold data-selected:bg-accent"
      `;
      const result = extractShortFormDataPatterns(content);

      expect(result.some((r: { state: string }) => r.state === 'selected')).toBe(true);
    });

    it('extracts data-disabled: patterns', () => {
      const content = `
        className="data-disabled:opacity-50 data-disabled:cursor-not-allowed"
      `;
      const result = extractShortFormDataPatterns(content);

      expect(result.some((r: { state: string }) => r.state === 'disabled')).toBe(true);
    });

    it('extracts group-data-* patterns', () => {
      const content = `
        className="group-data-selected:font-semibold group-data-active:text-white"
      `;
      const result = extractShortFormDataPatterns(content);

      expect(result.some((r: { state: string; groupVariant: boolean }) => r.state === 'selected' && r.groupVariant)).toBe(true);
      expect(result.some((r: { state: string; groupVariant: boolean }) => r.state === 'active' && r.groupVariant)).toBe(true);
    });

    it('extracts data-enter/data-leave transition patterns', () => {
      const content = `
        className="data-enter:duration-300 data-leave:duration-300 data-enter:data-closed:-translate-x-full"
      `;
      const result = extractShortFormDataPatterns(content);

      expect(result.some((r: { state: string }) => r.state === 'enter')).toBe(true);
      expect(result.some((r: { state: string }) => r.state === 'leave')).toBe(true);
    });

    it('extracts data-highlighted: patterns', () => {
      const content = `
        className="data-highlighted:bg-accent data-highlighted:text-accent-foreground"
      `;
      const result = extractShortFormDataPatterns(content);

      expect(result.some((r: { state: string }) => r.state === 'highlighted')).toBe(true);
    });

    it('extracts data-checked: patterns', () => {
      const content = `
        className="data-checked:bg-primary data-checked:text-primary-foreground"
      `;
      const result = extractShortFormDataPatterns(content);

      expect(result.some((r: { state: string }) => r.state === 'checked')).toBe(true);
    });

    it('tracks the utility class applied with each state pattern', () => {
      const content = `
        className="data-active:bg-blue-500 data-active:text-white"
      `;
      const result = extractShortFormDataPatterns(content);

      const activePatterns = result.filter((r: { state: string }) => r.state === 'active');
      expect(activePatterns.length).toBeGreaterThan(0);
      expect(activePatterns.some((r: { utility: string }) => r.utility === 'bg-blue-500')).toBe(true);
    });
  });
});

// ============================================================================
// Data Attribute Selector Pattern Tests
// ============================================================================

describe('data attribute selector extraction', () => {
  describe('extractDataAttributePatterns', () => {
    it('extracts simple data-[attr] patterns', () => {
      const content = `
        <div className="data-[disabled]:opacity-50 data-[state=closed]:hidden">
      `;
      const result = extractDataAttributePatterns(content);

      expect(result).toHaveLength(2);
      expect(result.some(r => r.attribute === 'disabled' && r.value === undefined)).toBe(true);
      expect(result.some(r => r.attribute === 'state' && r.value === 'closed')).toBe(true);
    });

    it('extracts data-[attr=value] patterns with various values', () => {
      const content = `
        className="data-[state=open]:visible data-[highlighted=true]:bg-primary data-[side=bottom]:translate-y-1"
      `;
      const result = extractDataAttributePatterns(content);

      expect(result.some(r => r.attribute === 'state' && r.value === 'open')).toBe(true);
      expect(result.some(r => r.attribute === 'highlighted' && r.value === 'true')).toBe(true);
      expect(result.some(r => r.attribute === 'side' && r.value === 'bottom')).toBe(true);
    });

    it('extracts data-[slot=*] patterns from shadcn-ui', () => {
      const content = `
        className="*:data-[slot=select-value]:line-clamp-1 has-data-[slot=card-action]:grid-cols-[1fr_auto]"
      `;
      const result = extractDataAttributePatterns(content);

      expect(result.some(r => r.attribute === 'slot' && r.value === 'select-value')).toBe(true);
      expect(result.some(r => r.attribute === 'slot' && r.value === 'card-action')).toBe(true);
    });

    it('extracts group-data-[*] patterns', () => {
      const content = `
        className="group-data-[active=true]/dropdown-menu-item:opacity-100 group-data-[collapsible=icon]:hidden"
      `;
      const result = extractDataAttributePatterns(content);

      expect(result.some(r => r.attribute === 'active' && r.value === 'true' && r.groupName === 'dropdown-menu-item')).toBe(true);
      expect(result.some(r => r.attribute === 'collapsible' && r.value === 'icon')).toBe(true);
    });

    it('extracts group-has-data-[*] patterns', () => {
      const content = `
        className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
      `;
      const result = extractDataAttributePatterns(content);

      expect(result.some(r => r.attribute === 'collapsible' && r.value === 'icon' && r.groupName === 'sidebar-wrapper')).toBe(true);
    });

    it('extracts Radix data-position patterns', () => {
      const content = `
        className="data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1"
      `;
      const result = extractDataAttributePatterns(content);

      expect(result.filter(r => r.attribute === 'side')).toHaveLength(4);
    });

    it('extracts semantic categories from data patterns', () => {
      const content = `
        className="data-[variant=default]:bg-primary data-[size=sm]:h-8 data-[orientation=horizontal]:flex-row"
      `;
      const result = extractDataAttributePatterns(content);

      expect(result.some(r => r.attribute === 'variant' && r.semanticCategory === 'variant')).toBe(true);
      expect(result.some(r => r.attribute === 'size' && r.semanticCategory === 'size')).toBe(true);
      expect(result.some(r => r.attribute === 'orientation' && r.semanticCategory === 'layout')).toBe(true);
    });
  });
});

// ============================================================================
// HeadlessUI Variant Prefix Tests
// ============================================================================

describe('HeadlessUI variant prefix extraction', () => {
  describe('extractHeadlessUIVariants', () => {
    it('extracts ui-* state variants', () => {
      const content = `
        className="ui-active:bg-blue-500 ui-open:visible ui-checked:ring-2"
      `;
      const result = extractHeadlessUIVariants(content);

      expect(result.some(r => r.state === 'active' && r.negated === false)).toBe(true);
      expect(result.some(r => r.state === 'open' && r.negated === false)).toBe(true);
      expect(result.some(r => r.state === 'checked' && r.negated === false)).toBe(true);
    });

    it('extracts ui-not-* negated variants', () => {
      const content = `
        className="ui-not-active:bg-gray-100 ui-not-open:hidden ui-not-disabled:cursor-pointer"
      `;
      const result = extractHeadlessUIVariants(content);

      expect(result.some(r => r.state === 'active' && r.negated === true)).toBe(true);
      expect(result.some(r => r.state === 'open' && r.negated === true)).toBe(true);
      expect(result.some(r => r.state === 'disabled' && r.negated === true)).toBe(true);
    });

    it('extracts ui-focus-visible variant', () => {
      const content = `
        className="ui-focus-visible:ring-2 ui-focus-visible:ring-offset-2"
      `;
      const result = extractHeadlessUIVariants(content);

      expect(result.some(r => r.state === 'focus-visible' && r.negated === false)).toBe(true);
    });

    it('extracts ui-not-focus-visible variant', () => {
      const content = `
        className="ui-not-focus-visible:ring-0"
      `;
      const result = extractHeadlessUIVariants(content);

      expect(result.some(r => r.state === 'focus-visible' && r.negated === true)).toBe(true);
    });

    it('extracts mixed ui-* and regular classes', () => {
      const content = `
        className="focus:outline-hidden ui-focus-visible:ring-2 flex items-center border"
      `;
      const result = extractHeadlessUIVariants(content);

      expect(result).toHaveLength(1);
      expect(result[0]!.state).toBe('focus-visible');
    });

    it('extracts all HeadlessUI state variants', () => {
      const content = `
        className="ui-selected:font-bold ui-disabled:opacity-50"
      `;
      const result = extractHeadlessUIVariants(content);

      expect(result.some(r => r.state === 'selected')).toBe(true);
      expect(result.some(r => r.state === 'disabled')).toBe(true);
    });

    it('handles custom prefix (hui-)', () => {
      const content = `
        className="hui-active:bg-blue-500 hui-not-open:hidden"
      `;
      const result = extractHeadlessUIVariants(content, 'hui');

      expect(result.some(r => r.state === 'active' && r.negated === false)).toBe(true);
      expect(result.some(r => r.state === 'open' && r.negated === true)).toBe(true);
    });
  });
});

// ============================================================================
// Group/Peer Variant Name Tests
// ============================================================================

describe('group/peer variant name extraction', () => {
  describe('extractGroupPeerVariants', () => {
    it('extracts group/name patterns', () => {
      const content = `
        className="cn-card group/card flex flex-col"
        className="group-hover/card:opacity-100"
      `;
      const result = extractGroupPeerVariants(content);

      expect(result.some(r => r.type === 'group' && r.name === 'card')).toBe(true);
    });

    it('extracts peer/name patterns', () => {
      const content = `
        className="peer/input"
        className="peer-focus/input:ring-2"
      `;
      const result = extractGroupPeerVariants(content);

      expect(result.some(r => r.type === 'peer' && r.name === 'input')).toBe(true);
    });

    it('extracts group patterns with various variant prefixes', () => {
      const content = `
        className="group-hover/button:scale-105 group-focus/button:ring-2 group-active/button:bg-primary"
      `;
      const result = extractGroupPeerVariants(content);

      expect(result.filter(r => r.type === 'group' && r.name === 'button')).toHaveLength(3);
    });

    it('extracts @container patterns', () => {
      const content = `
        className="@container/card-header"
        className="@sm/card-header:grid-cols-2"
      `;
      const result = extractGroupPeerVariants(content);

      expect(result.some(r => r.type === 'container' && r.name === 'card-header')).toBe(true);
    });

    it('extracts named patterns from shadcn components', () => {
      const content = `
        <div className={cn("cn-card-header group/card-header @container/card-header", className)} />
        <div className={cn("cn-dropdown-menu-item group/dropdown-menu-item", className)} />
      `;
      const result = extractGroupPeerVariants(content);

      expect(result.some(r => r.name === 'card-header')).toBe(true);
      expect(result.some(r => r.name === 'dropdown-menu-item')).toBe(true);
    });
  });
});

// ============================================================================
// Dynamic Data Attribute Extraction Tests (shadcn-ui v4)
// ============================================================================

describe('dynamic data attribute extraction', () => {
  describe('extractDynamicDataAttributes', () => {
    it('extracts data-variant={variant} patterns', () => {
      const content = `
        <Comp
          data-slot="button"
          data-variant={variant}
          data-size={size}
          className={cn(buttonVariants({ variant, size, className }))}
          {...props}
        />
      `;
      const result = extractDynamicDataAttributes(content);

      expect(result.some(r => r.name === 'variant' && r.valueExpression === 'variant')).toBe(true);
      expect(result.some(r => r.name === 'size' && r.valueExpression === 'size')).toBe(true);
    });

    it('extracts data-inset={inset} patterns', () => {
      const content = `
        <DropdownMenuPrimitive.Label
          data-slot="dropdown-menu-label"
          data-inset={inset}
          className={cn("px-2 py-1.5", className)}
        />
      `;
      const result = extractDynamicDataAttributes(content);

      expect(result.some(r => r.name === 'inset' && r.valueExpression === 'inset')).toBe(true);
    });

    it('extracts data-orientation={orientation} patterns', () => {
      const content = `
        <div
          data-slot="button-group"
          data-orientation={orientation}
          className={cn(buttonGroupVariants({ orientation }), className)}
        />
      `;
      const result = extractDynamicDataAttributes(content);

      expect(result.some(r => r.name === 'orientation')).toBe(true);
    });

    it('extracts multiple data attributes from same element', () => {
      const content = `
        <DropdownMenuPrimitive.Item
          data-slot="dropdown-menu-item"
          data-inset={inset}
          data-variant={variant}
          className={cn("...", className)}
        />
      `;
      const result = extractDynamicDataAttributes(content);

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.some(r => r.name === 'inset')).toBe(true);
      expect(result.some(r => r.name === 'variant')).toBe(true);
    });

    it('extracts data attributes with complex expressions', () => {
      const content = `
        <div data-state={open ? "open" : "closed"} />
        <div data-active={isActive || false} />
      `;
      const result = extractDynamicDataAttributes(content);

      expect(result.some(r => r.name === 'state')).toBe(true);
      expect(result.some(r => r.name === 'active')).toBe(true);
    });

    it('ignores static data attributes', () => {
      const content = `
        <div data-slot="button" data-testid="test" />
      `;
      const result = extractDynamicDataAttributes(content);

      // data-slot with static string should not be in dynamic results
      expect(result.every(r => r.name !== 'slot')).toBe(true);
    });

    it('categorizes data attributes semantically', () => {
      const content = `
        <div
          data-variant={variant}
          data-size={size}
          data-state={state}
          data-orientation={orientation}
        />
      `;
      const result = extractDynamicDataAttributes(content);

      const variantAttr = result.find(r => r.name === 'variant');
      const sizeAttr = result.find(r => r.name === 'size');
      const stateAttr = result.find(r => r.name === 'state');
      const orientationAttr = result.find(r => r.name === 'orientation');

      expect(variantAttr?.category).toBe('variant');
      expect(sizeAttr?.category).toBe('size');
      expect(stateAttr?.category).toBe('state');
      expect(orientationAttr?.category).toBe('layout');
    });
  });
});

// ============================================================================
// Render Prop className Pattern Tests (HeadlessUI)
// ============================================================================

describe('render prop className patterns', () => {
  describe('extractRenderPropClassNames', () => {
    it('extracts className as function with selected state', () => {
      const content = `
        <Tab
          className={({ selected }) =>
            classNames(
              selected ? 'text-gray-900' : 'text-gray-500',
              'px-4 py-4 text-sm font-medium'
            )
          }
        >
      `;
      const result = extractRenderPropClassNames(content);

      expect(result).toHaveLength(1);
      expect(result[0]!.parameters).toContain('selected');
      expect(result[0]!.staticClasses).toContain('px-4');
      expect(result[0]!.conditionalClasses.length).toBeGreaterThan(0);
    });

    it('extracts className with checked state', () => {
      const content = `
        <Switch
          className={({ checked }) =>
            classNames(
              'relative inline-flex h-6 w-11 cursor-pointer rounded-full',
              checked ? 'bg-indigo-600' : 'bg-gray-200'
            )
          }
        />
      `;
      const result = extractRenderPropClassNames(content);

      expect(result).toHaveLength(1);
      expect(result[0]!.parameters).toContain('checked');
    });

    it('extracts className with multiple states', () => {
      const content = `
        <Listbox.Option
          className={({ active, selected }) =>
            classNames(
              active ? 'bg-blue-500 text-white' : 'text-gray-900',
              selected ? 'font-bold' : 'font-normal',
              'relative cursor-pointer py-2 pl-3 pr-9'
            )
          }
        />
      `;
      const result = extractRenderPropClassNames(content);

      expect(result).toHaveLength(1);
      expect(result[0]!.parameters).toContain('active');
      expect(result[0]!.parameters).toContain('selected');
    });

    it('extracts focus state from render prop', () => {
      const content = `
        <Listbox.Button
          className={({ open, focus }) =>
            cn(
              'flex items-center gap-2 rounded-md px-3 py-2',
              open ? 'ring-2 ring-blue-500' : '',
              focus ? 'outline-blue-500' : ''
            )
          }
        />
      `;
      const result = extractRenderPropClassNames(content);

      expect(result).toHaveLength(1);
      expect(result[0]!.parameters).toContain('open');
      expect(result[0]!.parameters).toContain('focus');
    });

    it('extracts disabled state from render prop', () => {
      const content = `
        <Menu.Item
          className={({ active, disabled }) =>
            classNames(
              active && 'bg-gray-100',
              disabled && 'opacity-50 cursor-not-allowed',
              'block px-4 py-2'
            )
          }
        />
      `;
      const result = extractRenderPropClassNames(content);

      expect(result).toHaveLength(1);
      expect(result[0]!.parameters).toContain('disabled');
    });

    it('handles cn utility function', () => {
      const content = `
        <Button
          className={({ pressed }) =>
            cn(
              pressed ? 'scale-95' : 'scale-100',
              'transition-transform'
            )
          }
        />
      `;
      const result = extractRenderPropClassNames(content);

      expect(result).toHaveLength(1);
      expect(result[0]!.utility).toBe('cn');
    });

    it('extracts conditional classes separately', () => {
      const content = `
        <Tab
          className={({ selected }) =>
            classNames(
              selected ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700',
              'px-4 py-2 text-sm font-medium'
            )
          }
        />
      `;
      const result = extractRenderPropClassNames(content);

      expect(result[0]!.conditionalClasses.some(c =>
        c.condition === 'selected' && c.trueClasses?.includes('text-blue-600')
      )).toBe(true);
    });
  });
});
