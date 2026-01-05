import { describe, it, expect } from 'vitest';
import {
  rgbToHex,
  colorDistance,
  findDuplicateColors,
  getFontWeight,
  hasConsistentSpacingScale,
  calculateHealth,
  getScoreColor,
  getScoreColorRGB,
  getScoreMessage,
  generateInsights,
  generateIssueMessages,
  type AnalysisResult,
  type ColorToken,
  type SpacingValue,
} from './logic';

// ============================================================================
// Test Fixtures
// ============================================================================

function createEmptyAnalysis(): Omit<AnalysisResult, 'health'> {
  return {
    colors: { defined: [], used: [], duplicates: [] },
    typography: { defined: [], orphaned: 0 },
    spacing: { values: [], hasScale: false },
    components: { defined: [], orphaned: 0 },
  };
}

function createHealthyAnalysis(): AnalysisResult {
  return {
    colors: {
      defined: [
        { name: 'Primary', value: '#0EA5E9', opacity: 1, source: 'style' },
        { name: 'Secondary', value: '#64748B', opacity: 1, source: 'style' },
      ],
      used: [
        { name: '', value: '#0EA5E9', opacity: 1, source: 'usage', usageCount: 50 },
      ],
      duplicates: [],
    },
    typography: {
      defined: [
        { name: 'Heading', fontFamily: 'Inter', fontSize: 24, fontWeight: 700, lineHeight: 'auto', letterSpacing: '0px' },
        { name: 'Body', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: '1.5', letterSpacing: '0px' },
      ],
      orphaned: 0,
    },
    spacing: {
      values: [
        { value: 8, usageCount: 100 },
        { value: 16, usageCount: 80 },
        { value: 24, usageCount: 60 },
        { value: 32, usageCount: 40 },
      ],
      hasScale: true,
    },
    components: {
      defined: [
        { id: '1', name: 'Button', description: 'Primary button', instanceCount: 20, variantCount: 3 },
      ],
      orphaned: 0,
    },
    health: { score: 100, breakdown: { colorScore: 100, typographyScore: 100, spacingScore: 100, componentScore: 100 } },
  };
}

function createUnhealthyAnalysis(): AnalysisResult {
  return {
    colors: {
      defined: [
        { name: 'Blue 1', value: '#0EA5E9', opacity: 1, source: 'style' },
        { name: 'Blue 2', value: '#0EA4E8', opacity: 1, source: 'style' }, // Near duplicate
      ],
      used: [
        { name: '', value: '#FF0000', opacity: 1, source: 'usage', usageCount: 10 }, // Not defined
      ],
      duplicates: [
        { colors: [
          { name: 'Blue 1', value: '#0EA5E9', opacity: 1, source: 'style' },
          { name: 'Blue 2', value: '#0EA4E8', opacity: 1, source: 'style' },
        ], suggestion: 'Consider merging to Blue 1' }
      ],
    },
    typography: {
      defined: [
        { name: 'Heading', fontFamily: 'Inter', fontSize: 24, fontWeight: 700, lineHeight: 'auto', letterSpacing: '0px' },
      ],
      orphaned: 15,
    },
    spacing: {
      values: [
        { value: 7, usageCount: 50 }, // Not on scale
        { value: 13, usageCount: 40 },
        { value: 22, usageCount: 30 },
      ],
      hasScale: false,
    },
    components: {
      defined: [
        { id: '1', name: 'Button', description: '', instanceCount: 10, variantCount: 0 },
      ],
      orphaned: 5,
    },
    health: { score: 50, breakdown: { colorScore: 85, typographyScore: 6, spacingScore: 60, componentScore: 67 } },
  };
}

// ============================================================================
// Color Utility Tests
// ============================================================================

describe('rgbToHex', () => {
  it('converts black correctly', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
  });

  it('converts white correctly', () => {
    expect(rgbToHex(1, 1, 1)).toBe('#FFFFFF');
  });

  it('converts primary colors correctly', () => {
    expect(rgbToHex(1, 0, 0)).toBe('#FF0000');
    expect(rgbToHex(0, 1, 0)).toBe('#00FF00');
    expect(rgbToHex(0, 0, 1)).toBe('#0000FF');
  });

  it('converts intermediate values correctly', () => {
    expect(rgbToHex(0.5, 0.5, 0.5)).toBe('#808080');
  });

  it('handles Figma-style RGB values', () => {
    // Figma uses 0-1 range
    expect(rgbToHex(0.055, 0.647, 0.914)).toBe('#0EA5E9'); // Sky-500
  });
});

describe('colorDistance', () => {
  it('returns 0 for identical colors', () => {
    expect(colorDistance('#FF0000', '#FF0000')).toBe(0);
  });

  it('returns max distance for black and white', () => {
    const distance = colorDistance('#000000', '#FFFFFF');
    expect(distance).toBeCloseTo(Math.sqrt(255 ** 2 * 3), 1);
  });

  it('detects similar colors (< 15 threshold)', () => {
    // Two very similar blues
    const distance = colorDistance('#0EA5E9', '#0EA4E8');
    expect(distance).toBeLessThan(15);
  });

  it('detects different colors (> 15 threshold)', () => {
    const distance = colorDistance('#FF0000', '#00FF00');
    expect(distance).toBeGreaterThan(15);
  });
});

describe('findDuplicateColors', () => {
  it('returns empty array for no duplicates', () => {
    const colors: ColorToken[] = [
      { name: 'Red', value: '#FF0000', opacity: 1, source: 'style' },
      { name: 'Blue', value: '#0000FF', opacity: 1, source: 'style' },
    ];
    expect(findDuplicateColors(colors)).toEqual([]);
  });

  it('groups similar colors together', () => {
    const colors: ColorToken[] = [
      { name: 'Blue 1', value: '#0EA5E9', opacity: 1, source: 'style' },
      { name: 'Blue 2', value: '#0EA4E8', opacity: 1, source: 'style' },
      { name: 'Red', value: '#FF0000', opacity: 1, source: 'style' },
    ];
    const duplicates = findDuplicateColors(colors);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].colors).toHaveLength(2);
    expect(duplicates[0].suggestion).toContain('Blue 1');
  });

  it('respects custom threshold', () => {
    const colors: ColorToken[] = [
      { name: 'Gray 1', value: '#808080', opacity: 1, source: 'style' },
      { name: 'Gray 2', value: '#888888', opacity: 1, source: 'style' },
    ];
    // With default threshold (15), these should be duplicates
    expect(findDuplicateColors(colors, 15).length).toBe(1);
    // With very low threshold (1), they shouldn't be
    expect(findDuplicateColors(colors, 1).length).toBe(0);
  });
});

// ============================================================================
// Typography Utility Tests
// ============================================================================

describe('getFontWeight', () => {
  it('returns correct weight for standard names', () => {
    expect(getFontWeight('Thin')).toBe(100);
    expect(getFontWeight('Light')).toBe(300);
    expect(getFontWeight('Regular')).toBe(400);
    expect(getFontWeight('Medium')).toBe(500);
    expect(getFontWeight('SemiBold')).toBe(600);
    expect(getFontWeight('Bold')).toBe(700);
    expect(getFontWeight('ExtraBold')).toBe(800);
    expect(getFontWeight('Black')).toBe(900);
  });

  it('handles compound style names', () => {
    expect(getFontWeight('Inter Bold')).toBe(700);
    expect(getFontWeight('SF Pro Medium')).toBe(500);
    expect(getFontWeight('Roboto Light Italic')).toBe(300);
  });

  it('returns 400 for unknown styles', () => {
    expect(getFontWeight('Oblique')).toBe(400);
    expect(getFontWeight('Italic')).toBe(400);
    expect(getFontWeight('')).toBe(400);
  });

  it('handles alternative weight names', () => {
    expect(getFontWeight('Hairline')).toBe(100);
    expect(getFontWeight('UltraLight')).toBe(200);
    expect(getFontWeight('DemiBold')).toBe(600);
    expect(getFontWeight('Heavy')).toBe(900);
  });
});

// ============================================================================
// Spacing Utility Tests
// ============================================================================

describe('hasConsistentSpacingScale', () => {
  it('returns false for empty values', () => {
    expect(hasConsistentSpacingScale([])).toBe(false);
  });

  it('returns true for 4px multiples', () => {
    const values: SpacingValue[] = [
      { value: 4, usageCount: 10 },
      { value: 8, usageCount: 20 },
      { value: 12, usageCount: 15 },
      { value: 16, usageCount: 25 },
    ];
    expect(hasConsistentSpacingScale(values)).toBe(true);
  });

  it('returns true for 8px multiples', () => {
    const values: SpacingValue[] = [
      { value: 8, usageCount: 10 },
      { value: 16, usageCount: 20 },
      { value: 24, usageCount: 15 },
      { value: 32, usageCount: 25 },
    ];
    expect(hasConsistentSpacingScale(values)).toBe(true);
  });

  it('returns false for inconsistent values', () => {
    const values: SpacingValue[] = [
      { value: 7, usageCount: 10 },
      { value: 13, usageCount: 20 },
      { value: 22, usageCount: 15 },
    ];
    expect(hasConsistentSpacingScale(values)).toBe(false);
  });

  it('only checks top 5 values', () => {
    const values: SpacingValue[] = [
      { value: 8, usageCount: 100 },
      { value: 16, usageCount: 90 },
      { value: 24, usageCount: 80 },
      { value: 32, usageCount: 70 },
      { value: 40, usageCount: 60 },
      { value: 7, usageCount: 5 }, // Off-scale but low usage
    ];
    expect(hasConsistentSpacingScale(values)).toBe(true);
  });
});

// ============================================================================
// Health Score Tests
// ============================================================================

describe('calculateHealth', () => {
  it('returns 100 for perfect design system', () => {
    const analysis = createEmptyAnalysis();
    // Empty system with no issues
    const health = calculateHealth(analysis);
    // No colors = 100, no typography issues = 100, no spacing = 0, no components = 100
    expect(health.breakdown.colorScore).toBe(100);
    expect(health.breakdown.typographyScore).toBe(100);
    expect(health.breakdown.spacingScore).toBe(0); // No spacing values
    expect(health.breakdown.componentScore).toBe(100);
  });

  it('penalizes duplicate colors', () => {
    const analysis = createEmptyAnalysis();
    analysis.colors.defined = [
      { name: 'Blue 1', value: '#0EA5E9', opacity: 1, source: 'style' },
    ];
    analysis.colors.duplicates = [
      { colors: [], suggestion: 'merge' },
      { colors: [], suggestion: 'merge' },
    ];
    const health = calculateHealth(analysis);
    expect(health.breakdown.colorScore).toBe(80); // 100 - 2*10
  });

  it('penalizes undefined colors in use', () => {
    const analysis = createEmptyAnalysis();
    analysis.colors.defined = [
      { name: 'Primary', value: '#0EA5E9', opacity: 1, source: 'style' },
    ];
    analysis.colors.used = [
      { name: '', value: '#FF0000', opacity: 1, source: 'usage', usageCount: 10 },
      { name: '', value: '#00FF00', opacity: 1, source: 'usage', usageCount: 5 },
    ];
    const health = calculateHealth(analysis);
    expect(health.breakdown.colorScore).toBe(90); // 100 - 2*5
  });

  it('calculates typography score based on orphaned ratio', () => {
    const analysis = createEmptyAnalysis();
    analysis.typography.defined = [
      { name: 'Heading', fontFamily: 'Inter', fontSize: 24, fontWeight: 700, lineHeight: 'auto', letterSpacing: '0px' },
    ];
    analysis.typography.orphaned = 3;
    const health = calculateHealth(analysis);
    // 1 defined / (1 + 3 total) = 25%
    expect(health.breakdown.typographyScore).toBe(25);
  });

  it('gives 100 spacing score for consistent scale', () => {
    const analysis = createEmptyAnalysis();
    analysis.spacing.hasScale = true;
    analysis.spacing.values = [{ value: 8, usageCount: 10 }];
    const health = calculateHealth(analysis);
    expect(health.breakdown.spacingScore).toBe(100);
  });

  it('gives 60 spacing score for values without scale', () => {
    const analysis = createEmptyAnalysis();
    analysis.spacing.hasScale = false;
    analysis.spacing.values = [{ value: 7, usageCount: 10 }];
    const health = calculateHealth(analysis);
    expect(health.breakdown.spacingScore).toBe(60);
  });

  it('calculates component score based on orphaned ratio', () => {
    const analysis = createEmptyAnalysis();
    analysis.components.defined = [
      { id: '1', name: 'Button', description: '', instanceCount: 8, variantCount: 0 },
    ];
    analysis.components.orphaned = 2;
    const health = calculateHealth(analysis);
    // 8 good / (8 + 2 total) = 80%
    expect(health.breakdown.componentScore).toBe(80);
  });

  it('calculates weighted overall score', () => {
    const analysis = createEmptyAnalysis();
    // All scores at 100
    analysis.spacing.hasScale = true;
    analysis.spacing.values = [{ value: 8, usageCount: 10 }];
    const health = calculateHealth(analysis);
    // 100*0.3 + 100*0.25 + 100*0.2 + 100*0.25 = 100
    expect(health.score).toBe(100);
  });

  it('never returns negative scores', () => {
    const analysis = createEmptyAnalysis();
    // Many duplicates and undefined colors
    analysis.colors.duplicates = Array(15).fill({ colors: [], suggestion: 'merge' });
    analysis.colors.used = Array(20).fill({ name: '', value: '#123456', opacity: 1, source: 'usage', usageCount: 1 });
    const health = calculateHealth(analysis);
    expect(health.breakdown.colorScore).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// UI Display Logic Tests
// ============================================================================

describe('getScoreColor', () => {
  it('returns green for excellent scores (90+)', () => {
    expect(getScoreColor(90)).toBe('#84CC16');
    expect(getScoreColor(100)).toBe('#84CC16');
  });

  it('returns yellow for good scores (70-89)', () => {
    expect(getScoreColor(70)).toBe('#EAB308');
    expect(getScoreColor(89)).toBe('#EAB308');
  });

  it('returns orange for okay scores (50-69)', () => {
    expect(getScoreColor(50)).toBe('#F97316');
    expect(getScoreColor(69)).toBe('#F97316');
  });

  it('returns red for poor scores (<50)', () => {
    expect(getScoreColor(0)).toBe('#EF4444');
    expect(getScoreColor(49)).toBe('#EF4444');
  });
});

describe('getScoreColorRGB', () => {
  it('returns RGB in 0-1 range for Figma', () => {
    const color = getScoreColorRGB(95);
    expect(color.r).toBeGreaterThanOrEqual(0);
    expect(color.r).toBeLessThanOrEqual(1);
    expect(color.g).toBeGreaterThanOrEqual(0);
    expect(color.g).toBeLessThanOrEqual(1);
    expect(color.b).toBeGreaterThanOrEqual(0);
    expect(color.b).toBeLessThanOrEqual(1);
  });

  it('returns different colors for different score ranges', () => {
    const excellent = getScoreColorRGB(95);
    const good = getScoreColorRGB(75);
    const okay = getScoreColorRGB(55);
    const poor = getScoreColorRGB(25);

    // Green is high for excellent
    expect(excellent.g).toBeGreaterThan(excellent.r);
    // Different colors for each range
    expect(excellent).not.toEqual(good);
    expect(good).not.toEqual(okay);
    expect(okay).not.toEqual(poor);
  });
});

describe('getScoreMessage', () => {
  it('returns encouraging message for excellent scores', () => {
    const msg = getScoreMessage(95);
    expect(msg.title).toBe('Looking great!');
    expect(msg.description).toContain('solid');
  });

  it('returns supportive message for good scores', () => {
    const msg = getScoreMessage(75);
    expect(msg.title).toBe('Nice work!');
    expect(msg.description).toContain('tweaks');
  });

  it('returns motivating message for okay scores', () => {
    const msg = getScoreMessage(55);
    expect(msg.title).toBe('Getting there!');
    expect(msg.description).toContain('styles');
  });

  it('returns getting started message for poor scores', () => {
    const msg = getScoreMessage(25);
    expect(msg.title).toBe("Let's get started!");
    expect(msg.description).toContain('Create');
  });

  it('handles boundary values correctly', () => {
    expect(getScoreMessage(90).title).toBe('Looking great!');
    expect(getScoreMessage(89).title).toBe('Nice work!');
    expect(getScoreMessage(70).title).toBe('Nice work!');
    expect(getScoreMessage(69).title).toBe('Getting there!');
    expect(getScoreMessage(50).title).toBe('Getting there!');
    expect(getScoreMessage(49).title).toBe("Let's get started!");
  });
});

// ============================================================================
// Insight Generation Tests
// ============================================================================

describe('generateInsights', () => {
  it('returns empty array for healthy system', () => {
    const analysis = createHealthyAnalysis();
    const insights = generateInsights(analysis);
    expect(insights).toHaveLength(0);
  });

  it('detects missing color styles', () => {
    const analysis = createHealthyAnalysis();
    analysis.colors.defined = [];
    const insights = generateInsights(analysis);
    expect(insights.some(i => i.category === 'colors' && i.title.includes('No color'))).toBe(true);
  });

  it('detects duplicate colors', () => {
    const analysis = createUnhealthyAnalysis();
    const insights = generateInsights(analysis);
    expect(insights.some(i => i.category === 'colors' && i.title.includes('similar'))).toBe(true);
  });

  it('detects missing text styles', () => {
    const analysis = createHealthyAnalysis();
    analysis.typography.defined = [];
    const insights = generateInsights(analysis);
    expect(insights.some(i => i.category === 'typography' && i.title.includes('No text'))).toBe(true);
  });

  it('detects orphaned text nodes', () => {
    const analysis = createHealthyAnalysis();
    analysis.typography.orphaned = 10;
    const insights = generateInsights(analysis);
    expect(insights.some(i => i.category === 'typography' && i.title.includes('10 text'))).toBe(true);
  });

  it('detects inconsistent spacing', () => {
    const analysis = createHealthyAnalysis();
    analysis.spacing.hasScale = false;
    const insights = generateInsights(analysis);
    expect(insights.some(i => i.category === 'spacing' && i.title.includes('Inconsistent'))).toBe(true);
  });

  it('detects missing components', () => {
    const analysis = createHealthyAnalysis();
    analysis.components.defined = [];
    const insights = generateInsights(analysis);
    expect(insights.some(i => i.category === 'components' && i.title.includes('No components'))).toBe(true);
  });

  it('detects detached instances', () => {
    const analysis = createHealthyAnalysis();
    analysis.components.orphaned = 5;
    const insights = generateInsights(analysis);
    expect(insights.some(i => i.category === 'components' && i.title.includes('5 detached'))).toBe(true);
  });
});

describe('generateIssueMessages', () => {
  it('returns empty array for healthy system', () => {
    const analysis = createHealthyAnalysis();
    const issues = generateIssueMessages(analysis);
    expect(issues).toHaveLength(0);
  });

  it('generates message for duplicate colors', () => {
    const analysis = createUnhealthyAnalysis();
    const issues = generateIssueMessages(analysis);
    expect(issues.some(i => i.includes('similar colors'))).toBe(true);
  });

  it('generates message for orphaned text', () => {
    const analysis = createUnhealthyAnalysis();
    const issues = generateIssueMessages(analysis);
    expect(issues.some(i => i.includes('text nodes without'))).toBe(true);
  });

  it('generates message for detached components', () => {
    const analysis = createUnhealthyAnalysis();
    const issues = generateIssueMessages(analysis);
    expect(issues.some(i => i.includes('detached component'))).toBe(true);
  });

  it('generates message for inconsistent spacing', () => {
    const analysis = createUnhealthyAnalysis();
    const issues = generateIssueMessages(analysis);
    expect(issues.some(i => i.includes('consistent scale'))).toBe(true);
  });
});
