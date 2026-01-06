import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Component, DesignToken, DriftSignal } from '@buoy-design/core';
import {
  SkillExportService,
  type SkillExportOptions,
  type ScanData,
} from '../skill-export.js';

// Helper to create mock tokens
function createMockToken(
  name: string,
  category: 'color' | 'spacing' | 'typography',
  value: string | number
): DesignToken {
  const baseToken = {
    id: `test:${category}:${name}`,
    name,
    category,
    aliases: [],
    usedBy: [],
    metadata: {},
    scannedAt: new Date(),
    source: { type: 'css' as const, path: 'tokens.css' },
  };

  if (category === 'color') {
    return {
      ...baseToken,
      value: { type: 'color' as const, hex: value as string },
    };
  } else if (category === 'spacing') {
    return {
      ...baseToken,
      value: { type: 'spacing' as const, value: value as number, unit: 'px' as const },
    };
  } else {
    return {
      ...baseToken,
      value: {
        type: 'typography' as const,
        fontFamily: value as string,
        fontSize: 16,
        fontWeight: 400,
      },
    };
  }
}

// Helper to create mock components
function createMockComponent(name: string, props: string[] = []): Component {
  return {
    id: `react:src/${name}.tsx:${name}`,
    name,
    source: {
      type: 'react',
      path: `src/${name}.tsx`,
      exportName: name,
      line: 1,
    },
    props: props.map((p) => ({ name: p, type: 'unknown', required: false })),
    variants: [],
    tokens: [],
    dependencies: [],
    metadata: { tags: [] },
    scannedAt: new Date(),
  };
}

// Helper to create mock drift signals
function createMockDrift(
  type: string,
  severity: 'critical' | 'warning' | 'info',
  entityName: string
): DriftSignal {
  return {
    id: `drift-${Math.random().toString(36).slice(2)}`,
    type: type as DriftSignal['type'],
    severity,
    source: {
      entityType: 'component',
      entityId: `comp-${entityName}`,
      entityName,
      location: `src/${entityName}.tsx:10`,
    },
    message: `Test drift: ${type}`,
    details: {},
    detectedAt: new Date(),
  };
}

describe('SkillExportService', () => {
  let service: SkillExportService;

  beforeEach(() => {
    service = new SkillExportService('test-project');
  });

  describe('generateSkillMd', () => {
    it('includes frontmatter with name and description', () => {
      const data: ScanData = {
        tokens: [],
        components: [],
        drifts: [],
        projectName: 'test-project',
      };

      const result = service.generateSkillMd(data);

      expect(result).toContain('---');
      expect(result).toContain('name: design-system');
      expect(result).toContain('description:');
    });

    it('includes triggers for UI-related work', () => {
      const data: ScanData = {
        tokens: [],
        components: [],
        drifts: [],
        projectName: 'test-project',
      };

      const result = service.generateSkillMd(data);

      expect(result).toContain('triggers:');
      expect(result).toMatch(/building UI|styling|layout/i);
    });

    it('includes project name in title', () => {
      const data: ScanData = {
        tokens: [],
        components: [],
        drifts: [],
        projectName: 'my-awesome-project',
      };

      const result = service.generateSkillMd(data);

      expect(result).toContain('my-awesome-project');
    });

    it('lists rules for token usage', () => {
      const data: ScanData = {
        tokens: [createMockToken('primary', 'color', '#2563EB')],
        components: [],
        drifts: [],
        projectName: 'test-project',
      };

      const result = service.generateSkillMd(data);

      expect(result).toMatch(/NEVER.*hardcode.*color/i);
    });

    it('includes validation command', () => {
      const data: ScanData = {
        tokens: [],
        components: [],
        drifts: [],
        projectName: 'test-project',
      };

      const result = service.generateSkillMd(data);

      expect(result).toContain('buoy check');
    });

    it('references token and component files', () => {
      const data: ScanData = {
        tokens: [createMockToken('primary', 'color', '#2563EB')],
        components: [createMockComponent('Button')],
        drifts: [],
        projectName: 'test-project',
      };

      const result = service.generateSkillMd(data);

      expect(result).toContain('tokens/');
      expect(result).toContain('components/');
    });
  });

  describe('generateTokensIndex', () => {
    it('returns empty message for no tokens', () => {
      const result = service.generateTokensIndex([]);

      expect(result).toContain('No tokens');
    });

    it('lists token categories with counts', () => {
      const tokens = [
        createMockToken('primary', 'color', '#2563EB'),
        createMockToken('secondary', 'color', '#64748B'),
        createMockToken('space-4', 'spacing', 16),
      ];

      const result = service.generateTokensIndex(tokens);

      expect(result).toContain('Color');
      expect(result).toContain('2');
      expect(result).toContain('Spacing');
      expect(result).toContain('1');
    });

    it('provides links to detailed files', () => {
      const tokens = [createMockToken('primary', 'color', '#2563EB')];

      const result = service.generateTokensIndex(tokens);

      expect(result).toContain('colors.md');
    });
  });

  describe('generateColorTokens', () => {
    it('formats tokens as markdown table', () => {
      const tokens = [
        createMockToken('primary', 'color', '#2563EB'),
        createMockToken('secondary', 'color', '#64748B'),
      ];

      const result = service.generateColorTokens(tokens);

      expect(result).toContain('| Token |');
      expect(result).toContain('primary');
      expect(result).toContain('#2563EB');
    });

    it('includes value column', () => {
      const tokens = [createMockToken('error', 'color', '#DC2626')];

      const result = service.generateColorTokens(tokens);

      expect(result).toContain('#DC2626');
    });

    it('filters out non-color tokens', () => {
      const tokens = [
        createMockToken('primary', 'color', '#2563EB'),
        createMockToken('space-4', 'spacing', 16),
      ];

      const result = service.generateColorTokens(tokens);

      expect(result).toContain('#2563EB');
      expect(result).not.toContain('16px');
    });

    it('handles empty token list', () => {
      const result = service.generateColorTokens([]);

      expect(result).toContain('No color tokens');
    });
  });

  describe('generateSpacingTokens', () => {
    it('formats spacing tokens with values', () => {
      const tokens = [
        createMockToken('space-2', 'spacing', 8),
        createMockToken('space-4', 'spacing', 16),
      ];

      const result = service.generateSpacingTokens(tokens);

      expect(result).toContain('space-2');
      expect(result).toContain('8px');
      expect(result).toContain('space-4');
      expect(result).toContain('16px');
    });

    it('filters out non-spacing tokens', () => {
      const tokens = [
        createMockToken('space-4', 'spacing', 16),
        createMockToken('primary', 'color', '#2563EB'),
      ];

      const result = service.generateSpacingTokens(tokens);

      expect(result).toContain('16px');
      expect(result).not.toContain('#2563EB');
    });

    it('handles empty token list', () => {
      const result = service.generateSpacingTokens([]);

      expect(result).toContain('No spacing tokens');
    });
  });

  describe('generateTypographyTokens', () => {
    it('formats typography tokens', () => {
      const tokens = [createMockToken('font-sans', 'typography', 'Inter')];

      const result = service.generateTypographyTokens(tokens);

      expect(result).toContain('font-sans');
      expect(result).toContain('Inter');
    });

    it('handles empty token list', () => {
      const result = service.generateTypographyTokens([]);

      expect(result).toContain('No typography tokens');
    });
  });

  describe('generateComponentInventory', () => {
    it('lists all components', () => {
      const components = [
        createMockComponent('Button', ['onClick', 'variant']),
        createMockComponent('Card', ['title']),
      ];

      const result = service.generateComponentInventory(components);

      expect(result).toContain('Button');
      expect(result).toContain('Card');
    });

    it('includes component count', () => {
      const components = [
        createMockComponent('Button'),
        createMockComponent('Card'),
        createMockComponent('Modal'),
      ];

      const result = service.generateComponentInventory(components);

      expect(result).toContain('3');
    });

    it('shows file paths', () => {
      const components = [createMockComponent('Button')];

      const result = service.generateComponentInventory(components);

      expect(result).toContain('src/Button.tsx');
    });

    it('handles empty component list', () => {
      const result = service.generateComponentInventory([]);

      expect(result).toContain('No components');
    });
  });

  describe('generateAntiPatterns', () => {
    it('generates anti-patterns from drift signals', () => {
      const drifts = [
        createMockDrift('hardcoded-value', 'warning', 'Button'),
        createMockDrift('naming-inconsistency', 'info', 'Card'),
      ];

      const result = service.generateAntiPatterns(drifts);

      expect(result).toContain('hardcoded');
      expect(result).toContain('naming');
    });

    it('groups by drift type', () => {
      const drifts = [
        createMockDrift('hardcoded-value', 'warning', 'Button'),
        createMockDrift('hardcoded-value', 'warning', 'Card'),
      ];

      const result = service.generateAntiPatterns(drifts);

      // Should group, not list twice
      expect(result).toContain('hardcoded');
    });

    it('includes severity indicators', () => {
      const drifts = [createMockDrift('hardcoded-value', 'critical', 'Button')];

      const result = service.generateAntiPatterns(drifts);

      expect(result.toLowerCase()).toContain('critical');
    });

    it('handles empty drift list', () => {
      const result = service.generateAntiPatterns([]);

      expect(result).toMatch(/no known anti-patterns|clean/i);
    });
  });

  describe('generatePatternsIndex', () => {
    it('detects form patterns from component names', () => {
      const components = [
        createMockComponent('FormInput'),
        createMockComponent('FormSelect'),
        createMockComponent('FormSubmit'),
      ];

      const result = service.generatePatternsIndex(components);

      expect(result.toLowerCase()).toContain('form');
    });

    it('detects navigation patterns', () => {
      const components = [
        createMockComponent('Navbar'),
        createMockComponent('NavLink'),
        createMockComponent('Sidebar'),
      ];

      const result = service.generatePatternsIndex(components);

      expect(result.toLowerCase()).toContain('navigation');
    });

    it('handles no detected patterns', () => {
      const components = [createMockComponent('RandomComponent')];

      const result = service.generatePatternsIndex(components);

      expect(result).toBeDefined();
    });
  });

  describe('export', () => {
    it('returns files array with correct structure', async () => {
      const options: SkillExportOptions = {
        sections: ['tokens', 'components'],
        outputPath: '.claude/skills/design-system',
      };

      const data: ScanData = {
        tokens: [createMockToken('primary', 'color', '#2563EB')],
        components: [createMockComponent('Button')],
        drifts: [],
        projectName: 'test-project',
      };

      const result = await service.export(data, options);

      expect(result.files).toBeInstanceOf(Array);
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.files[0]).toHaveProperty('path');
      expect(result.files[0]).toHaveProperty('content');
    });

    it('includes SKILL.md in output', async () => {
      const options: SkillExportOptions = {
        sections: ['tokens'],
        outputPath: '.claude/skills/design-system',
      };

      const data: ScanData = {
        tokens: [],
        components: [],
        drifts: [],
        projectName: 'test-project',
      };

      const result = await service.export(data, options);

      const skillFile = result.files.find((f) => f.path.endsWith('SKILL.md'));
      expect(skillFile).toBeDefined();
    });

    it('includes token files when tokens section requested', async () => {
      const options: SkillExportOptions = {
        sections: ['tokens'],
        outputPath: '.claude/skills/design-system',
      };

      const data: ScanData = {
        tokens: [createMockToken('primary', 'color', '#2563EB')],
        components: [],
        drifts: [],
        projectName: 'test-project',
      };

      const result = await service.export(data, options);

      const tokenFiles = result.files.filter((f) => f.path.includes('tokens/'));
      expect(tokenFiles.length).toBeGreaterThan(0);
    });

    it('includes component files when components section requested', async () => {
      const options: SkillExportOptions = {
        sections: ['components'],
        outputPath: '.claude/skills/design-system',
      };

      const data: ScanData = {
        tokens: [],
        components: [createMockComponent('Button')],
        drifts: [],
        projectName: 'test-project',
      };

      const result = await service.export(data, options);

      const componentFiles = result.files.filter((f) =>
        f.path.includes('components/')
      );
      expect(componentFiles.length).toBeGreaterThan(0);
    });

    it('includes anti-patterns when section requested', async () => {
      const options: SkillExportOptions = {
        sections: ['anti-patterns'],
        outputPath: '.claude/skills/design-system',
      };

      const data: ScanData = {
        tokens: [],
        components: [],
        drifts: [createMockDrift('hardcoded-value', 'warning', 'Button')],
        projectName: 'test-project',
      };

      const result = await service.export(data, options);

      const antiPatternFiles = result.files.filter((f) =>
        f.path.includes('anti-patterns/')
      );
      expect(antiPatternFiles.length).toBeGreaterThan(0);
    });

    it('returns stats with token counts', async () => {
      const options: SkillExportOptions = {
        sections: ['tokens'],
        outputPath: '.claude/skills/design-system',
      };

      const data: ScanData = {
        tokens: [
          createMockToken('primary', 'color', '#2563EB'),
          createMockToken('secondary', 'color', '#64748B'),
          createMockToken('space-4', 'spacing', 16),
        ],
        components: [],
        drifts: [],
        projectName: 'test-project',
      };

      const result = await service.export(data, options);

      expect(result.stats.tokens.colors).toBe(2);
      expect(result.stats.tokens.spacing).toBe(1);
      expect(result.stats.tokens.total).toBe(3);
    });

    it('returns stats with component count', async () => {
      const options: SkillExportOptions = {
        sections: ['components'],
        outputPath: '.claude/skills/design-system',
      };

      const data: ScanData = {
        tokens: [],
        components: [
          createMockComponent('Button'),
          createMockComponent('Card'),
        ],
        drifts: [],
        projectName: 'test-project',
      };

      const result = await service.export(data, options);

      expect(result.stats.components).toBe(2);
    });

    it('filters sections based on options', async () => {
      const options: SkillExportOptions = {
        sections: ['tokens'], // Only tokens, no components
        outputPath: '.claude/skills/design-system',
      };

      const data: ScanData = {
        tokens: [createMockToken('primary', 'color', '#2563EB')],
        components: [createMockComponent('Button')],
        drifts: [],
        projectName: 'test-project',
      };

      const result = await service.export(data, options);

      const componentFiles = result.files.filter((f) =>
        f.path.includes('components/')
      );
      expect(componentFiles.length).toBe(0);
    });
  });
});
