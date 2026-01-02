/**
 * Tests for JSX Style Object Extractor
 * Covers style={{ ... }} patterns from React, Solid, Qwik, Preact, Astro
 *
 * Test cases based on real patterns from:
 * - chakra-ui/chakra-ui
 * - mantinedev/mantine
 */

import { describe, it, expect } from 'vitest';
import { extractJsxStyleObjects } from './jsx-style.js';

describe('extractJsxStyleObjects', () => {
  describe('basic inline styles', () => {
    it('extracts simple object with color value', () => {
      const content = `<div style={{ color: 'red' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('color: red');
    });

    it('extracts style with hex color', () => {
      const content = `<div style={{ backgroundColor: '#fff' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('background-color: #fff');
    });

    it('extracts style with numeric padding', () => {
      const content = `<div style={{ padding: 40 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('padding: 40px');
    });

    it('extracts style with multiple properties', () => {
      const content = `<div style={{ maxWidth: 500, margin: 'auto', padding: 40 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('max-width: 500px');
      expect(result[0]!.css).toContain('margin: auto');
      expect(result[0]!.css).toContain('padding: 40px');
    });

    it('extracts flex property', () => {
      const content = `<div style={{ flex: 1 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('flex: 1');
    });

    it('extracts zIndex without units', () => {
      const content = `<div style={{ zIndex: 1000 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('z-index: 1000');
    });

    it('extracts outline style', () => {
      const content = `<div style={{ outline: 0 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('outline: 0');
    });

    it('extracts opacity value', () => {
      const content = `<div style={{ opacity: 0.6 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('opacity: 0.6');
    });

    it('extracts fontWeight', () => {
      const content = `<text style={{ fontSize: 14, fontWeight: 600 }}></text>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('font-size: 14px');
      expect(result[0]!.css).toContain('font-weight: 600');
    });
  });

  describe('CSS custom properties (variables)', () => {
    it('extracts CSS variable with computed property name', () => {
      const content = `<div style={{ ["--bar-percent" as string]: "50%" }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('--bar-percent: 50%');
    });

    it('extracts CSS variable with template literal value', () => {
      const content = '<div style={{ ["--bar-percent" as string]: `${getPercent(item.value)}%` }}></div>';
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('--bar-percent:');
    });

    it('extracts multiple CSS variables', () => {
      const content = `<div style={{
        ["--primary-color" as string]: "#007bff",
        ["--secondary-color" as string]: "#6c757d"
      }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result.length).toBeGreaterThanOrEqual(1);
      const allCss = result.map(r => r.css).join(' ');
      expect(allCss).toContain('--primary-color: #007bff');
      expect(allCss).toContain('--secondary-color: #6c757d');
    });

    it('extracts CSS variable with ch unit', () => {
      const content = '<div style={{ ["--code-block-line-length" as string]: `${String(codeLines).length}ch` }}></div>';
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('--code-block-line-length:');
    });
  });

  describe('multi-line style objects', () => {
    it('extracts multi-line style object', () => {
      const content = `<div
        style={{
          background: "yellow",
          width: "100%",
          maxWidth: "300px"
        }}
      ></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result.length).toBeGreaterThanOrEqual(1);
      const allCss = result.map(r => r.css).join(' ');
      expect(allCss).toContain('background: yellow');
      expect(allCss).toContain('width: 100%');
      expect(allCss).toContain('max-width: 300px');
    });

    it('extracts style with nested braces', () => {
      const content = `<div style={{
        ["--bar-percent" as string]: \`\${getPercent(item.value)}%\`,
      }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('spread operators and rest styles', () => {
    it('extracts static styles mixed with spread', () => {
      const content = `<div style={{
        ...rest.style,
        ["--code-block-line-length" as string]: "10ch",
      }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result.length).toBeGreaterThanOrEqual(1);
      const allCss = result.map(r => r.css).join(' ');
      expect(allCss).toContain('--code-block-line-length: 10ch');
    });

    it('ignores spread operators but extracts other properties', () => {
      const content = `<div style={{ ...baseStyles, padding: 16 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('padding: 16px');
    });
  });

  describe('dynamic values (should be detected but marked)', () => {
    it('handles variable references gracefully', () => {
      const content = `<div style={{ fontSize }}></div>`;
      const result = extractJsxStyleObjects(content);
      // Should still parse without errors, may or may not extract
      expect(Array.isArray(result)).toBe(true);
    });

    it('handles function calls gracefully', () => {
      const content = `<div style={{ fill: chart.color("fg.muted") }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(Array.isArray(result)).toBe(true);
    });

    it('handles complex expressions gracefully', () => {
      const content = `<div style={{ opacity: chart.getSeriesOpacity(seriesName, 0.6) }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('line and column tracking', () => {
    it('reports correct line number for single-line style', () => {
      const content = `line1
line2
<div style={{ padding: 40 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.line).toBe(3);
    });

    it('reports correct context as inline', () => {
      const content = `<div style={{ color: 'red' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.context).toBe('inline');
    });
  });

  describe('edge cases', () => {
    it('handles empty style object', () => {
      const content = `<div style={{}}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(Array.isArray(result)).toBe(true);
    });

    it('handles multiple style objects on same line', () => {
      const content = `<div style={{ color: 'red' }}></div><span style={{ color: 'blue' }}></span>`;
      const result = extractJsxStyleObjects(content);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('handles style with string values containing spaces', () => {
      const content = `<div style={{ border: '2px solid red' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('border: 2px solid red');
    });

    it('handles style with rem unit', () => {
      const content = `<div style={{ padding: '1rem' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('padding: 1rem');
    });

    it('handles style with auto value', () => {
      const content = `<div style={{ marginLeft: 'auto', marginRight: 'auto' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('margin-left: auto');
      expect(result[0]!.css).toContain('margin-right: auto');
    });

    it('handles double-quoted strings', () => {
      const content = `<div style={{ color: "blue" }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('color: blue');
    });

    it('handles single-quoted strings', () => {
      const content = `<div style={{ color: 'blue' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('color: blue');
    });
  });

  describe('real-world patterns from chakra-ui', () => {
    it('extracts Frame style with background color', () => {
      const content = `<Frame style={{ background: "yellow" }}>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('background: yellow');
    });

    it('extracts bar chart style with CSS variable', () => {
      const content = `<Box style={{ ["--bar-percent" as string]: \`\${getPercent(item.value)}%\` }}></Box>`;
      const result = extractJsxStyleObjects(content);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]!.css).toContain('--bar-percent:');
    });

    it('extracts skip-nav style', () => {
      const content = `<div tabIndex={-1} style={{ outline: 0 }} {...rest} />`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('outline: 0');
    });
  });

  describe('real-world patterns from mantine', () => {
    it('extracts form padding style', () => {
      const content = `<form onSubmit={form.onSubmit(() => {})} style={{ padding: 40 }}>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('padding: 40px');
    });

    it('extracts flex style on input', () => {
      const content = `<TextInput placeholder="John Doe" style={{ flex: 1 }} {...form.getInputProps('name')} />`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('flex: 1');
    });

    it('extracts complex container style', () => {
      const content = `<div style={{ maxWidth: 500, margin: 'auto', padding: 40 }}>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('max-width: 500px');
      expect(result[0]!.css).toContain('margin: auto');
      expect(result[0]!.css).toContain('padding: 40px');
    });

    it('extracts rem() function calls as values', () => {
      const content = `<form style={{ padding: rem(40), maxWidth: rem(400) }}>`;
      const result = extractJsxStyleObjects(content);
      // rem() is a function call, should be captured even if not fully parsed
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('CSS color functions with commas', () => {
    it('extracts rgba color correctly', () => {
      const content = `<div style={{ color: "rgba(14, 200, 172, 1)" }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('color: rgba(14, 200, 172, 1)');
    });

    it('extracts rgb color correctly', () => {
      const content = `<div style={{ backgroundColor: "rgb(255, 128, 0)" }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('background-color: rgb(255, 128, 0)');
    });

    it('extracts hsla color correctly', () => {
      const content = `<div style={{ color: "hsla(120, 100%, 50%, 0.5)" }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('color: hsla(120, 100%, 50%, 0.5)');
    });

    it('extracts hsl color correctly', () => {
      const content = `<div style={{ color: "hsl(120, 100%, 50%)" }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('color: hsl(120, 100%, 50%)');
    });
  });

  describe('CSS transform functions', () => {
    it('extracts rotate transform', () => {
      const content = `<div style={{ transform: "rotate(180deg)" }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('transform: rotate(180deg)');
    });

    it('extracts translate transform', () => {
      const content = `<div style={{ transform: "translateX(50px)" }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('transform: translateX(50px)');
    });

    it('extracts combined transforms', () => {
      const content = `<div style={{ transform: "rotate(45deg) scale(1.5)" }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('transform: rotate(45deg) scale(1.5)');
    });

    it('extracts scale transform', () => {
      const content = `<div style={{ transform: "scale(1.2)" }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('transform: scale(1.2)');
    });

    it('extracts translate3d transform', () => {
      const content = `<div style={{ transform: "translate3d(10px, 20px, 30px)" }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('transform: translate3d(10px, 20px, 30px)');
    });
  });

  describe('scale property (unitless)', () => {
    it('does not add px to scale property', () => {
      const content = `<div style={{ scale: "1.2" }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('scale: 1.2');
    });

    it('does not add px to numeric scale', () => {
      const content = `<div style={{ scale: 1.5 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('scale: 1.5');
    });
  });

  describe('background-image with template literals', () => {
    it('extracts backgroundImage with template literal url', () => {
      const content = '<div style={{ backgroundImage: `url(${lightImg.src})` }}></div>';
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('background-image:');
    });

    it('extracts linear-gradient background', () => {
      const content = `<div style={{ background: "linear-gradient(to right, red, blue)" }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('background: linear-gradient(to right, red, blue)');
    });
  });

  describe('animation delay with template literal', () => {
    it('extracts animation delay with template expression', () => {
      const content = '<div style={{ animationDelay: `${index * 30}ms` }}></div>';
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      // Should preserve the template expression or mark as dynamic
      expect(result[0]!.css).toContain('animation-delay:');
    });
  });

  describe('rem() helper function from mantine', () => {
    it('extracts rem() function as value', () => {
      const content = `<div style={{ width: rem(18) }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('width: rem(18)');
    });

    it('extracts multiple rem() values', () => {
      const content = `<div style={{ padding: rem(40), maxWidth: rem(400) }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('padding: rem(40)');
      expect(result[0]!.css).toContain('max-width: rem(400)');
    });
  });

  describe('unitless properties', () => {
    it('does not add px to flex', () => {
      const content = `<div style={{ flex: 1 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result[0]!.css).toBe('flex: 1');
    });

    it('does not add px to zIndex', () => {
      const content = `<div style={{ zIndex: 100 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result[0]!.css).toBe('z-index: 100');
    });

    it('does not add px to opacity', () => {
      const content = `<div style={{ opacity: 0.5 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result[0]!.css).toBe('opacity: 0.5');
    });

    it('does not add px to fontWeight', () => {
      const content = `<div style={{ fontWeight: 600 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result[0]!.css).toBe('font-weight: 600');
    });

    it('does not add px to lineHeight when numeric', () => {
      const content = `<div style={{ lineHeight: 1.5 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result[0]!.css).toBe('line-height: 1.5');
    });

    it('does not add px to order', () => {
      const content = `<div style={{ order: 2 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result[0]!.css).toBe('order: 2');
    });

    it('does not add px to flexGrow', () => {
      const content = `<div style={{ flexGrow: 1 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result[0]!.css).toBe('flex-grow: 1');
    });

    it('does not add px to flexShrink', () => {
      const content = `<div style={{ flexShrink: 0 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result[0]!.css).toBe('flex-shrink: 0');
    });

    it('adds px to padding', () => {
      const content = `<div style={{ padding: 16 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result[0]!.css).toBe('padding: 16px');
    });

    it('adds px to margin', () => {
      const content = `<div style={{ margin: 8 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result[0]!.css).toBe('margin: 8px');
    });
  });

  describe('spread operator handling', () => {
    it('extracts properties when spread is at the start', () => {
      const content = `<div style={{ ...style, colorScheme: 'light' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('color-scheme: light');
    });

    it('extracts properties when spread is at the end', () => {
      const content = `<div style={{ colorScheme: 'light', ...style }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('color-scheme: light');
    });

    it('extracts multiple properties with spread in middle', () => {
      const content = `<div style={{ padding: 16, ...baseStyle, margin: 8 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('padding: 16px');
      expect(result[0]!.css).toContain('margin: 8px');
    });

    it('extracts properties with multiple spreads', () => {
      const content = `<div style={{ ...styleA, padding: 16, ...styleB, margin: 8 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('padding: 16px');
      expect(result[0]!.css).toContain('margin: 8px');
    });

    it('extracts properties with rest spread', () => {
      const content = `<div style={{ ...rest.style, padding: 16 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('padding: 16px');
    });
  });

  describe('pointer-events and other CSS keywords', () => {
    it('extracts pointerEvents with all value', () => {
      const content = `<div style={{ pointerEvents: 'all' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('pointer-events: all');
    });

    it('extracts pointerEvents with none value', () => {
      const content = `<div style={{ pointerEvents: 'none' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('pointer-events: none');
    });

    it('extracts resize property', () => {
      const content = `<div style={{ resize: 'both' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('resize: both');
    });

    it('extracts userSelect property', () => {
      const content = `<div style={{ userSelect: 'none' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('user-select: none');
    });

    it('extracts appearance property', () => {
      const content = `<div style={{ appearance: 'none' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('appearance: none');
    });

    it('extracts touchAction property', () => {
      const content = `<div style={{ touchAction: 'pan-x' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('touch-action: pan-x');
    });

    it('extracts scrollBehavior property', () => {
      const content = `<div style={{ scrollBehavior: 'smooth' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('scroll-behavior: smooth');
    });

    it('extracts objectFit property', () => {
      const content = `<img style={{ objectFit: 'cover' }}></img>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('object-fit: cover');
    });

    it('extracts objectPosition property', () => {
      const content = `<img style={{ objectPosition: 'center' }}></img>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('object-position: center');
    });
  });

  describe('calc expressions with CSS variables', () => {
    it('extracts calc with CSS variable', () => {
      const content = `<div style={{ height: 'calc(100vh - var(--drawer-offset) * 2)' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('height: calc(100vh - var(--drawer-offset) * 2)');
    });

    it('extracts calc with multiple operations', () => {
      const content = `<div style={{ width: 'calc(100% - 20px + 5rem)' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('width: calc(100% - 20px + 5rem)');
    });

    it('extracts nested calc expressions', () => {
      const content = `<div style={{ padding: 'calc(var(--spacing) * 2)' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('padding: calc(var(--spacing) * 2)');
    });
  });

  describe('display property values', () => {
    it('extracts display: contents', () => {
      const content = `<div style={{ display: 'contents' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('display: contents');
    });

    it('extracts display: table', () => {
      const content = `<div style={{ display: 'table' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('display: table');
    });

    it('extracts display: table-cell', () => {
      const content = `<div style={{ display: 'table-cell' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('display: table-cell');
    });

    it('extracts display: flow-root', () => {
      const content = `<div style={{ display: 'flow-root' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('display: flow-root');
    });
  });

  describe('complex real-world patterns from chakra/mantine', () => {
    it('extracts OpenGraph image complex style', () => {
      const content = `<div style={{
        display: "flex",
        width: 1200,
        height: 630,
        padding: "53px 98px",
      }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('display: flex');
      expect(result[0]!.css).toContain('width: 1200px');
      expect(result[0]!.css).toContain('height: 630px');
      expect(result[0]!.css).toContain('padding: 53px 98px');
    });

    it('extracts chakra theme style with spread', () => {
      const content = `<div style={{ ...style, colorScheme: appearance }}></div>`;
      const result = extractJsxStyleObjects(content);
      // Should at least not crash, colorScheme: appearance is dynamic
      expect(Array.isArray(result)).toBe(true);
    });

    it('extracts mantine drawer style with calc and var', () => {
      const content = `<div style={{ height: 'calc(100vh - var(--drawer-offset) * 2)' }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('height: calc(100vh - var(--drawer-offset) * 2)');
    });

    it('extracts fill and fillOpacity for SVG', () => {
      const content = `<div style={{ fill: "teal", fillOpacity: 0.1 }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('fill: teal');
      expect(result[0]!.css).toContain('fill-opacity: 0.1');
    });

    it('extracts animation property', () => {
      const content = `<div style={{ animation: "spin 1s infinite" }}></div>`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('animation: spin 1s infinite');
    });

    it('extracts flexShrink: 0', () => {
      const content = `<LuFolder style={{ flexShrink: 0 }} />`;
      const result = extractJsxStyleObjects(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('flex-shrink: 0');
    });
  });
});
