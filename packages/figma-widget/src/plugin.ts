/**
 * Buoy Figma Plugin
 *
 * Scans Figma files to extract design tokens and components,
 * helping designers understand their design system health.
 */

// ============================================================================
// Types
// ============================================================================

interface ColorToken {
  name: string;
  value: string; // hex
  opacity: number;
  source: 'style' | 'usage';
  usageCount?: number;
}

interface TypographyToken {
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: string;
  letterSpacing: string;
}

interface SpacingValue {
  value: number;
  usageCount: number;
}

interface ComponentInfo {
  id: string;
  name: string;
  description: string;
  instanceCount: number;
  variantCount: number;
}

interface AnalysisResult {
  colors: {
    defined: ColorToken[];
    used: ColorToken[];
    duplicates: Array<{ colors: ColorToken[]; suggestion: string }>;
  };
  typography: {
    defined: TypographyToken[];
    orphaned: number; // text nodes without style
  };
  spacing: {
    values: SpacingValue[];
    hasScale: boolean;
  };
  components: {
    defined: ComponentInfo[];
    orphaned: number; // component instances with no main component
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

// ============================================================================
// Constants
// ============================================================================

const API_BASE = 'https://api.buoy.design';

// Store last analysis for API calls
let lastAnalysis: AnalysisResult | null = null;

// ============================================================================
// API Functions
// ============================================================================

interface DesignIntentPayload {
  source: 'figma';
  tokens: Array<{
    name: string;
    category: 'color' | 'typography' | 'spacing' | 'other';
    value: string;
    source?: string;
  }>;
  components: Array<{
    name: string;
    description?: string;
    figmaNodeId: string;
  }>;
  trackingCategories: {
    colors: boolean;
    typography: boolean;
    spacing: boolean;
    components: boolean;
  };
}

async function saveDesignIntent(analysis: AnalysisResult): Promise<{ success: boolean; error?: string }> {
  const payload: DesignIntentPayload = {
    source: 'figma',
    tokens: [
      // Colors
      ...analysis.colors.defined.map((c) => ({
        name: c.name,
        category: 'color' as const,
        value: c.value,
        source: 'figma-style',
      })),
      // Typography
      ...analysis.typography.defined.map((t) => ({
        name: t.name,
        category: 'typography' as const,
        value: `${t.fontFamily} ${t.fontWeight} ${t.fontSize}px`,
        source: 'figma-style',
      })),
      // Spacing (top 8 values)
      ...analysis.spacing.values.slice(0, 8).map((s, i) => ({
        name: `spacing-${i + 1}`,
        category: 'spacing' as const,
        value: `${s.value}px`,
        source: 'figma-usage',
      })),
    ],
    components: analysis.components.defined.map((c) => ({
      name: c.name,
      description: c.description || undefined,
      figmaNodeId: c.id,
    })),
    trackingCategories: {
      colors: true,
      typography: true,
      spacing: analysis.spacing.hasScale,
      components: true,
    },
  };

  try {
    const response = await fetch(`${API_BASE}/design-intent`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `API error: ${response.status}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

async function generateInvite(): Promise<{ success: boolean; inviteUrl?: string; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/developer-invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message: 'Please connect our repository to Buoy.' }),
    });

    if (!response.ok) {
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json() as { inviteUrl: string };
    return { success: true, inviteUrl: data.inviteUrl };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function colorDistance(hex1: string, hex2: string): number {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// ============================================================================
// Analysis Functions
// ============================================================================

async function analyzeColors(): Promise<AnalysisResult['colors']> {
  const defined: ColorToken[] = [];
  const usedColors = new Map<string, ColorToken>();

  // Get all paint styles (defined colors)
  const paintStyles = figma.getLocalPaintStyles();
  for (const style of paintStyles) {
    const paint = style.paints[0];
    if (paint && paint.type === 'SOLID') {
      defined.push({
        name: style.name,
        value: rgbToHex(paint.color.r, paint.color.g, paint.color.b),
        opacity: paint.opacity ?? 1,
        source: 'style',
      });
    }
  }

  // Scan document for used colors
  const nodes = figma.currentPage.findAll((node) => {
    return 'fills' in node || 'strokes' in node;
  });

  for (const node of nodes) {
    if ('fills' in node && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID' && fill.visible !== false) {
          const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
          const existing = usedColors.get(hex);
          if (existing) {
            existing.usageCount = (existing.usageCount || 0) + 1;
          } else {
            usedColors.set(hex, {
              name: '',
              value: hex,
              opacity: fill.opacity ?? 1,
              source: 'usage',
              usageCount: 1,
            });
          }
        }
      }
    }
  }

  const used = Array.from(usedColors.values()).sort(
    (a, b) => (b.usageCount || 0) - (a.usageCount || 0)
  );

  // Find duplicates (colors within distance of 10)
  const duplicates: Array<{ colors: ColorToken[]; suggestion: string }> = [];
  const processed = new Set<string>();

  for (const color1 of defined) {
    if (processed.has(color1.value)) continue;

    const similar = defined.filter(
      (c) => c.value !== color1.value && colorDistance(color1.value, c.value) < 15
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

  return { defined, used, duplicates };
}

async function analyzeTypography(): Promise<AnalysisResult['typography']> {
  const defined: TypographyToken[] = [];
  let orphaned = 0;

  // Get all text styles
  const textStyles = figma.getLocalTextStyles();
  for (const style of textStyles) {
    defined.push({
      name: style.name,
      fontFamily: style.fontName.family,
      fontSize: style.fontSize,
      fontWeight: getFontWeight(style.fontName.style),
      lineHeight:
        style.lineHeight.unit === 'AUTO'
          ? 'auto'
          : style.lineHeight.unit === 'PERCENT'
            ? `${style.lineHeight.value}%`
            : `${style.lineHeight.value}px`,
      letterSpacing:
        style.letterSpacing.unit === 'PERCENT'
          ? `${style.letterSpacing.value}%`
          : `${style.letterSpacing.value}px`,
    });
  }

  // Count text nodes without styles
  const textNodes = figma.currentPage.findAll((node) => node.type === 'TEXT') as TextNode[];
  for (const node of textNodes) {
    if (!node.textStyleId || node.textStyleId === '') {
      orphaned++;
    }
  }

  return { defined, orphaned };
}

function getFontWeight(style: string): number {
  const weights: Record<string, number> = {
    Thin: 100,
    ExtraLight: 200,
    Light: 300,
    Regular: 400,
    Medium: 500,
    SemiBold: 600,
    Bold: 700,
    ExtraBold: 800,
    Black: 900,
  };
  for (const [name, weight] of Object.entries(weights)) {
    if (style.includes(name)) return weight;
  }
  return 400;
}

async function analyzeSpacing(): Promise<AnalysisResult['spacing']> {
  const spacingCounts = new Map<number, number>();

  // Scan auto-layout frames for spacing
  const frames = figma.currentPage.findAll(
    (node) => node.type === 'FRAME' && 'layoutMode' in node && node.layoutMode !== 'NONE'
  ) as FrameNode[];

  for (const frame of frames) {
    if (frame.itemSpacing > 0) {
      spacingCounts.set(frame.itemSpacing, (spacingCounts.get(frame.itemSpacing) || 0) + 1);
    }
    if (frame.paddingTop > 0) {
      spacingCounts.set(frame.paddingTop, (spacingCounts.get(frame.paddingTop) || 0) + 1);
    }
    if (frame.paddingBottom > 0) {
      spacingCounts.set(frame.paddingBottom, (spacingCounts.get(frame.paddingBottom) || 0) + 1);
    }
    if (frame.paddingLeft > 0) {
      spacingCounts.set(frame.paddingLeft, (spacingCounts.get(frame.paddingLeft) || 0) + 1);
    }
    if (frame.paddingRight > 0) {
      spacingCounts.set(frame.paddingRight, (spacingCounts.get(frame.paddingRight) || 0) + 1);
    }
  }

  const values = Array.from(spacingCounts.entries())
    .map(([value, usageCount]) => ({ value, usageCount }))
    .sort((a, b) => b.usageCount - a.usageCount);

  // Check if values follow a scale (multiples of 4 or 8)
  const hasScale =
    values.length > 0 &&
    values.slice(0, 5).every((v) => v.value % 4 === 0 || v.value % 8 === 0);

  return { values, hasScale };
}

async function analyzeComponents(): Promise<AnalysisResult['components']> {
  const defined: ComponentInfo[] = [];
  let orphaned = 0;

  // Get all local components
  const components = figma.currentPage.findAll(
    (node) => node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
  ) as (ComponentNode | ComponentSetNode)[];

  for (const component of components) {
    const instances = figma.currentPage.findAll(
      (node) =>
        node.type === 'INSTANCE' &&
        (node.mainComponent?.id === component.id ||
          (component.type === 'COMPONENT_SET' &&
            component.children.some((c) => c.id === node.mainComponent?.id)))
    ) as InstanceNode[];

    defined.push({
      id: component.id,
      name: component.name,
      description: component.description || '',
      instanceCount: instances.length,
      variantCount: component.type === 'COMPONENT_SET' ? component.children.length : 0,
    });
  }

  // Count instances without main component (orphaned)
  const allInstances = figma.currentPage.findAll(
    (node) => node.type === 'INSTANCE'
  ) as InstanceNode[];
  for (const instance of allInstances) {
    if (!instance.mainComponent) {
      orphaned++;
    }
  }

  return { defined, orphaned };
}

function calculateHealth(analysis: Omit<AnalysisResult, 'health'>): AnalysisResult['health'] {
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
// Main Plugin Logic
// ============================================================================

async function runAnalysis(): Promise<AnalysisResult> {
  const colors = await analyzeColors();
  const typography = await analyzeTypography();
  const spacing = await analyzeSpacing();
  const components = await analyzeComponents();
  const health = calculateHealth({ colors, typography, spacing, components });

  return { colors, typography, spacing, components, health };
}

// Show UI
figma.showUI(__html__, { width: 360, height: 560 });

// Handle messages from UI
figma.ui.onmessage = async (msg: { type: string; payload?: unknown }) => {
  switch (msg.type) {
    case 'analyze':
      try {
        figma.ui.postMessage({ type: 'analyzing' });
        const result = await runAnalysis();
        lastAnalysis = result;
        figma.ui.postMessage({ type: 'analysis-complete', payload: result });
      } catch (error) {
        figma.ui.postMessage({
          type: 'error',
          payload: error instanceof Error ? error.message : 'Analysis failed',
        });
      }
      break;

    case 'save-design-intent':
      if (!lastAnalysis) {
        figma.notify('Please run analysis first');
        break;
      }
      try {
        figma.ui.postMessage({ type: 'saving' });
        const saveResult = await saveDesignIntent(lastAnalysis);
        if (saveResult.success) {
          figma.notify('Design intent saved to Buoy!');
          figma.ui.postMessage({ type: 'save-complete' });
        } else {
          figma.notify(`Failed to save: ${saveResult.error}`);
          figma.ui.postMessage({ type: 'save-error', payload: saveResult.error });
        }
      } catch (error) {
        figma.notify('Failed to save design intent');
        figma.ui.postMessage({ type: 'save-error', payload: 'Unknown error' });
      }
      break;

    case 'generate-invite':
      try {
        figma.ui.postMessage({ type: 'generating-invite' });
        const inviteResult = await generateInvite();
        if (inviteResult.success && inviteResult.inviteUrl) {
          figma.ui.postMessage({ type: 'invite-generated', payload: inviteResult.inviteUrl });
          figma.notify('Invite link generated! Copy it from the plugin.');
        } else {
          figma.notify(`Failed to generate invite: ${inviteResult.error}`);
          figma.ui.postMessage({ type: 'invite-error', payload: inviteResult.error });
        }
      } catch (error) {
        figma.notify('Failed to generate invite');
        figma.ui.postMessage({ type: 'invite-error', payload: 'Unknown error' });
      }
      break;

    case 'close':
      figma.closePlugin();
      break;

    default:
      console.log('Unknown message type:', msg.type);
  }
};

// Run initial analysis
runAnalysis().then((result) => {
  lastAnalysis = result;
  figma.ui.postMessage({ type: 'analysis-complete', payload: result });
});
