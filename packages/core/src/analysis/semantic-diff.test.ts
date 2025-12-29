// packages/core/src/analysis/semantic-diff.test.ts
import { describe, it, expect } from 'vitest';
import { SemanticDiffEngine } from './semantic-diff.js';
import type { Component, ComponentMetadata, DesignToken } from '../models/index.js';

describe('SemanticDiffEngine', () => {
  const engine = new SemanticDiffEngine();

  describe('checkFrameworkSprawl', () => {
    it('returns null for single framework', () => {
      const result = engine.checkFrameworkSprawl([
        { name: 'react', version: '18.2.0' },
      ]);
      expect(result).toBeNull();
    });

    it('returns null for empty frameworks', () => {
      const result = engine.checkFrameworkSprawl([]);
      expect(result).toBeNull();
    });

    it('detects sprawl with two UI frameworks', () => {
      const result = engine.checkFrameworkSprawl([
        { name: 'react', version: '18.2.0' },
        { name: 'vue', version: '3.0.0' },
      ]);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('framework-sprawl');
      expect(result?.severity).toBe('warning');
      expect(result?.message).toContain('2 UI frameworks');
    });

    it('ignores non-UI frameworks', () => {
      const result = engine.checkFrameworkSprawl([
        { name: 'react', version: '18.2.0' },
        { name: 'express', version: '4.0.0' },
      ]);
      expect(result).toBeNull();
    });

    it('detects sprawl with meta-frameworks', () => {
      const result = engine.checkFrameworkSprawl([
        { name: 'nextjs', version: '14.0.0' },
        { name: 'nuxt', version: '3.0.0' },
      ]);
      expect(result).not.toBeNull();
      expect(result?.message).toContain('nextjs');
      expect(result?.message).toContain('nuxt');
    });
  });

  describe('compareComponents', () => {
    it('matches components with exact names', () => {
      const source = [createMockComponent('Button', 'react')];
      const target = [createMockComponent('Button', 'figma')];

      const result = engine.compareComponents(source, target);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.matchType).toBe('exact');
      expect(result.matches[0]!.confidence).toBe(1);
      expect(result.orphanedSource).toHaveLength(0);
      expect(result.orphanedTarget).toHaveLength(0);
    });

    it('identifies orphaned source components', () => {
      const source = [
        createMockComponent('Button', 'react'),
        createMockComponent('Card', 'react'),
      ];
      const target = [createMockComponent('Button', 'figma')];

      const result = engine.compareComponents(source, target);

      expect(result.orphanedSource).toHaveLength(1);
      expect(result.orphanedSource[0]!.name).toBe('Card');
    });

    it('identifies orphaned target components', () => {
      const source = [createMockComponent('Button', 'react')];
      const target = [
        createMockComponent('Button', 'figma'),
        createMockComponent('Modal', 'figma'),
      ];

      const result = engine.compareComponents(source, target);

      expect(result.orphanedTarget).toHaveLength(1);
      expect(result.orphanedTarget[0]!.name).toBe('Modal');
    });

    it('generates drift signals for orphaned components', () => {
      const source = [createMockComponent('UniqueComponent', 'react')];
      const target: Component[] = [];

      const result = engine.compareComponents(source, target);

      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0]!.type).toBe('orphaned-component');
    });
  });

  describe('analyzeComponents', () => {
    describe('deprecated patterns', () => {
      it('detects deprecated components', () => {
        const components = [
          createMockComponentWithMetadata('OldButton', { deprecated: true }),
        ];

        const result = engine.analyzeComponents(components, { checkDeprecated: true });

        expect(result.drifts).toHaveLength(1);
        expect(result.drifts[0]!.type).toBe('deprecated-pattern');
        expect(result.drifts[0]!.severity).toBe('warning');
      });

      it('includes deprecation reason in suggestions', () => {
        const components = [
          createMockComponentWithMetadata('OldButton', {
            deprecated: true,
            deprecationReason: 'Use NewButton instead',
          }),
        ];

        const result = engine.analyzeComponents(components, { checkDeprecated: true });

        expect(result.drifts[0]!.details.suggestions).toContain('Use NewButton instead');
      });
    });

    describe('hardcoded values', () => {
      it('detects hardcoded colors', () => {
        const components = [
          createMockComponentWithMetadata('Button', {
            hardcodedValues: [
              { type: 'color', value: '#ff0000', property: 'backgroundColor', location: 'line 10' },
            ],
          }),
        ];

        const result = engine.analyzeComponents(components, {});

        const colorDrift = result.drifts.find(d =>
          d.type === 'hardcoded-value' && d.message.includes('color')
        );
        expect(colorDrift).toBeDefined();
        expect(colorDrift?.severity).toBe('warning');
      });
    });
  });

  describe('compareTokens', () => {
    it('matches tokens with same names', () => {
      const source = [createMockToken('--primary-color', '#0066cc', 'css')];
      const target = [createMockToken('--primary-color', '#0066cc', 'figma')];

      const result = engine.compareTokens(source, target);

      expect(result.matches).toHaveLength(1);
      expect(result.drifts).toHaveLength(0);
    });

    it('detects value divergence', () => {
      const source = [createMockToken('--primary-color', '#0066cc', 'css')];
      const target = [createMockToken('--primary-color', '#ff0000', 'figma')];

      const result = engine.compareTokens(source, target);

      expect(result.matches).toHaveLength(1);
      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0]!.type).toBe('value-divergence');
    });

    it('identifies orphaned tokens', () => {
      const source = [
        createMockToken('--primary-color', '#0066cc', 'css'),
        createMockToken('--secondary-color', '#666666', 'css'),
      ];
      const target = [createMockToken('--primary-color', '#0066cc', 'figma')];

      const result = engine.compareTokens(source, target);

      expect(result.orphanedSource).toHaveLength(1);
      expect(result.orphanedSource[0]!.name).toBe('--secondary-color');
    });
  });
});

// Helper functions

function createMockComponent(name: string, type: 'react' | 'figma'): Component {
  const source = type === 'react'
    ? { type: 'react' as const, path: `src/${name}.tsx`, exportName: name }
    : { type: 'figma' as const, fileKey: 'abc', nodeId: '1:1' };

  return {
    id: `${type}:${name}`,
    name,
    source,
    props: [],
    variants: [],
    tokens: [],
    dependencies: [],
    metadata: {},
    scannedAt: new Date(),
  };
}

function createMockComponentWithMetadata(name: string, metadata: Partial<ComponentMetadata>): Component {
  return {
    ...createMockComponent(name, 'react'),
    metadata,
  };
}

function createMockToken(name: string, hexValue: string, type: 'css' | 'figma'): DesignToken {
  const source = type === 'css'
    ? { type: 'css' as const, path: 'tokens.css' }
    : { type: 'figma' as const, fileKey: 'abc' };

  return {
    id: `${type}:${name}`,
    name,
    value: { type: 'color' as const, hex: hexValue },
    category: 'color',
    source,
    aliases: [],
    usedBy: [],
    metadata: {},
    scannedAt: new Date(),
  };
}
