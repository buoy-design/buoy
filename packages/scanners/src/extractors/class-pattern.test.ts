import { describe, it, expect } from 'vitest';
import {
  extractClassPatterns,
  analyzePatternForTokens,
  ClassPatternMatch,
  extractCvaPatterns,
  extractSemanticTokens,
  extractStaticClassStrings,
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
