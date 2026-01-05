/**
 * Pure logic functions for Buoy Figma Plugin
 *
 * These functions are extracted for testability - they have no
 * Figma API dependencies and can be unit tested directly.
 */

// ============================================================================
// Types (shared with plugin.ts)
// ============================================================================

export interface ColorToken {
  name: string;
  value: string; // hex
  opacity: number;
  source: 'style' | 'usage';
  usageCount?: number;
}

export interface TypographyToken {
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: string;
  letterSpacing: string;
}

export interface SpacingValue {
  value: number;
  usageCount: number;
}

export interface ComponentInfo {
  id: string;
  name: string;
  description: string;
  instanceCount: number;
  variantCount: number;
}

export interface AnalysisResult {
  colors: {
    defined: ColorToken[];
    used: ColorToken[];
    duplicates: Array<{ colors: ColorToken[]; suggestion: string }>;
  };
  typography: {
    defined: TypographyToken[];
    orphaned: number;
  };
  spacing: {
    values: SpacingValue[];
    hasScale: boolean;
  };
  components: {
    defined: ComponentInfo[];
    orphaned: number;
  };
  health: {
    score: number;
    breakdown: {
      colorScore: number;
      typographyScore: number;
      spacingScore: number;
      componentScore: number;
    };
  };
}

export interface HealthBreakdown {
  score: number;
  breakdown: {
    colorScore: number;
    typographyScore: number;
    spacingScore: number;
    componentScore: number;
  };
}

// ============================================================================
// Color Utilities
// ============================================================================

/**
 * Convert RGB values (0-1 range) to hex color string
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Calculate Euclidean distance between two hex colors
 * Used to detect similar/duplicate colors
 */
export function colorDistance(hex1: string, hex2: string): number {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/**
 * Find duplicate/similar colors in a list of color tokens
 * Colors within distance threshold are grouped together
 */
export function findDuplicateColors(
  colors: ColorToken[],
  threshold: number = 15
): Array<{ colors: ColorToken[]; suggestion: string }> {
  const duplicates: Array<{ colors: ColorToken[]; suggestion: string }> = [];
  const processed = new Set<string>();

  for (const color1 of colors) {
    if (processed.has(color1.value)) continue;

    const similar = colors.filter(
      (c) => c.value !== color1.value && colorDistance(color1.value, c.value) < threshold
    );

    if (similar.length > 0) {
      const group = [color1, ...similar];
      group.forEach((c) => processed.add(c.value));
      duplicates.push({
        colors: group,
        suggestion: `Consider merging to ${color1.name}`,
      });
    }
  }

  return duplicates;
}

// ============================================================================
// Typography Utilities
// ============================================================================

/**
 * Convert font style string to numeric weight
 * Order matters - check longer/more specific names first to avoid
 * "ExtraBold" matching "Bold" before "ExtraBold"
 */
export function getFontWeight(style: string): number {
  // Check in order from most specific to least specific
  // Longer patterns must come before shorter ones they contain
  const weightPatterns: Array<[string, number]> = [
    // 900 - Black/Heavy
    ['Black', 900],
    ['Heavy', 900],
    // 800 - ExtraBold/UltraBold (must come before Bold)
    ['ExtraBold', 800],
    ['UltraBold', 800],
    // 600 - SemiBold/DemiBold (must come before Bold)
    ['SemiBold', 600],
    ['DemiBold', 600],
    // 700 - Bold
    ['Bold', 700],
    // 500 - Medium
    ['Medium', 500],
    // 400 - Regular/Normal
    ['Regular', 400],
    ['Normal', 400],
    // 200 - ExtraLight/UltraLight (must come before Light)
    ['ExtraLight', 200],
    ['UltraLight', 200],
    // 300 - Light
    ['Light', 300],
    // 100 - Thin/Hairline
    ['Thin', 100],
    ['Hairline', 100],
  ];

  for (const [name, weight] of weightPatterns) {
    if (style.includes(name)) return weight;
  }
  return 400;
}

// ============================================================================
// Spacing Utilities
// ============================================================================

/**
 * Check if spacing values follow a consistent scale (multiples of 4 or 8)
 */
export function hasConsistentSpacingScale(values: SpacingValue[]): boolean {
  if (values.length === 0) return false;

  // Check top 5 most-used values
  const topValues = values.slice(0, 5);
  return topValues.every((v) => v.value % 4 === 0 || v.value % 8 === 0);
}

// ============================================================================
// Health Score Calculation
// ============================================================================

/**
 * Calculate health scores from analysis data
 */
export function calculateHealth(analysis: Omit<AnalysisResult, 'health'>): HealthBreakdown {
  // Color score: penalize duplicates and undefined colors in use
  const definedColorHexes = new Set(analysis.colors.defined.map((c) => c.value));
  const undefinedUsed = analysis.colors.used.filter((c) => !definedColorHexes.has(c.value));
  const colorScore = Math.max(
    0,
    100 - analysis.colors.duplicates.length * 10 - undefinedUsed.length * 5
  );

  // Typography score: penalize orphaned text
  const totalText = analysis.typography.defined.length + analysis.typography.orphaned;
  const typographyScore =
    totalText > 0
      ? Math.round((analysis.typography.defined.length / Math.max(1, totalText)) * 100)
      : 100;

  // Spacing score: reward having a scale
  const spacingScore = analysis.spacing.hasScale ? 100 : analysis.spacing.values.length > 0 ? 60 : 0;

  // Component score: penalize orphaned instances
  const totalInstances =
    analysis.components.defined.reduce((sum, c) => sum + c.instanceCount, 0) +
    analysis.components.orphaned;
  const componentScore =
    totalInstances > 0
      ? Math.round(
          ((totalInstances - analysis.components.orphaned) / Math.max(1, totalInstances)) * 100
        )
      : 100;

  // Overall score is weighted average
  const score = Math.round(
    colorScore * 0.3 + typographyScore * 0.25 + spacingScore * 0.2 + componentScore * 0.25
  );

  return {
    score,
    breakdown: {
      colorScore,
      typographyScore,
      spacingScore,
      componentScore,
    },
  };
}

// ============================================================================
// UI Display Logic
// ============================================================================

/**
 * Get color for health score display
 */
export function getScoreColor(score: number): string {
  if (score >= 90) return '#84CC16'; // green
  if (score >= 70) return '#EAB308'; // yellow
  if (score >= 50) return '#F97316'; // orange
  return '#EF4444'; // red
}

/**
 * Get RGB color for Figma canvas (0-1 range)
 */
export function getScoreColorRGB(score: number): { r: number; g: number; b: number } {
  if (score >= 90) return { r: 0.52, g: 0.8, b: 0.09 }; // green
  if (score >= 70) return { r: 0.92, g: 0.7, b: 0.03 }; // yellow
  if (score >= 50) return { r: 0.98, g: 0.45, b: 0.09 }; // orange
  return { r: 0.94, g: 0.27, b: 0.27 }; // red
}

/**
 * Get friendly message based on health score
 */
export function getScoreMessage(score: number): { title: string; description: string } {
  if (score >= 90) return {
    title: 'Looking great!',
    description: 'Your design system is solid. I can help keep your code in sync.'
  };
  if (score >= 70) return {
    title: 'Nice work!',
    description: 'A few tweaks and you\'ll be in great shape.'
  };
  if (score >= 50) return {
    title: 'Getting there!',
    description: 'Adding more styles will help me catch more drift.'
  };
  return {
    title: 'Let\'s get started!',
    description: 'Create some color and text styles so I can track them.'
  };
}

// ============================================================================
// Insight Generation
// ============================================================================

export interface Insight {
  title: string;
  description: string;
  action: string;
  category: 'colors' | 'typography' | 'spacing' | 'components';
}

/**
 * Generate actionable insights from analysis
 */
export function generateInsights(analysis: AnalysisResult): Insight[] {
  const insights: Insight[] = [];

  // Color insights
  if (analysis.colors.defined.length === 0) {
    insights.push({
      title: 'No color styles defined',
      description: 'Create color styles in Figma to establish your palette',
      action: 'Learn more →',
      category: 'colors',
    });
  } else if (analysis.colors.duplicates.length > 0) {
    insights.push({
      title: `${analysis.colors.duplicates.length} similar colors found`,
      description: 'Consolidating these would simplify your palette',
      action: 'Review colors →',
      category: 'colors',
    });
  }

  // Typography insights
  if (analysis.typography.defined.length === 0) {
    insights.push({
      title: 'No text styles defined',
      description: 'Create text styles for headings, body, and UI text',
      action: 'Learn more →',
      category: 'typography',
    });
  } else if (analysis.typography.orphaned > 0) {
    insights.push({
      title: `${analysis.typography.orphaned} text nodes without styles`,
      description: 'Applying text styles ensures consistency when coded',
      action: 'See details →',
      category: 'typography',
    });
  }

  // Spacing insights
  if (!analysis.spacing.hasScale && analysis.spacing.values.length > 0) {
    insights.push({
      title: 'Inconsistent spacing values',
      description: 'Using a 4px or 8px scale makes spacing predictable',
      action: 'Review spacing →',
      category: 'spacing',
    });
  }

  // Component insights
  if (analysis.components.defined.length === 0) {
    insights.push({
      title: 'No components defined',
      description: 'Turn repeated UI elements into reusable components',
      action: 'Learn more →',
      category: 'components',
    });
  } else if (analysis.components.orphaned > 0) {
    insights.push({
      title: `${analysis.components.orphaned} detached instances`,
      description: 'These won\'t update when you change the main component',
      action: 'See details →',
      category: 'components',
    });
  }

  return insights;
}

// ============================================================================
// Issue Detection (for dashboard page)
// ============================================================================

/**
 * Generate issue messages for the dashboard page
 */
export function generateIssueMessages(analysis: AnalysisResult): string[] {
  const issues: string[] = [];

  if (analysis.colors.duplicates.length > 0) {
    issues.push(`${analysis.colors.duplicates.length} similar colors could be consolidated`);
  }
  if (analysis.typography.orphaned > 0) {
    issues.push(`${analysis.typography.orphaned} text nodes without text styles`);
  }
  if (analysis.components.orphaned > 0) {
    issues.push(`${analysis.components.orphaned} detached component instances`);
  }
  if (!analysis.spacing.hasScale && analysis.spacing.values.length > 0) {
    issues.push('Spacing values don\'t follow a consistent scale (4px/8px)');
  }

  return issues;
}
