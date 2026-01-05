/**
 * Buoy Figma Plugin
 *
 * Scans Figma files to extract design tokens and components,
 * helping designers understand their design system health.
 */

import {
  rgbToHex,
  colorDistance,
  findDuplicateColors,
  getFontWeight,
  hasConsistentSpacingScale,
  calculateHealth,
  getScoreColorRGB,
  generateIssueMessages,
  type ColorToken,
  type TypographyToken,
  type SpacingValue,
  type ComponentInfo,
  type AnalysisResult,
} from './logic';

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
// Analysis Functions
// ============================================================================

async function analyzeColors(): Promise<AnalysisResult['colors']> {
  const defined: ColorToken[] = [];
  const usedColors = new Map<string, ColorToken>();

  // Get all paint styles (defined colors)
  const paintStyles = await figma.getLocalPaintStylesAsync();
  for (const style of paintStyles) {
    const paint = style.paints[0];
    if (paint && paint.type === 'SOLID') {
      defined.push({
        name: style.name,
        value: rgbToHex(paint.color.r, paint.color.g, paint.color.b),
        opacity: paint.opacity !== undefined ? paint.opacity : 1,
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
              opacity: fill.opacity !== undefined ? fill.opacity : 1,
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
  const textStyles = await figma.getLocalTextStylesAsync();
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

  // Get all instances
  const allInstances = figma.currentPage.findAll(
    (node) => node.type === 'INSTANCE'
  ) as InstanceNode[];

  // Build a map of instance -> mainComponent using async API
  const instanceMainComponents = new Map<string, ComponentNode | null>();
  for (const instance of allInstances) {
    const mainComp = await instance.getMainComponentAsync();
    instanceMainComponents.set(instance.id, mainComp);
    if (!mainComp) {
      orphaned++;
    }
  }

  // Count instances for each component
  for (const component of components) {
    let instanceCount = 0;

    for (const instance of allInstances) {
      const mainComp = instanceMainComponents.get(instance.id);
      if (!mainComp) continue;

      if (mainComp.id === component.id) {
        instanceCount++;
      } else if (component.type === 'COMPONENT_SET') {
        const isVariant = component.children.some((c) => c.id === mainComp.id);
        if (isVariant) instanceCount++;
      }
    }

    defined.push({
      id: component.id,
      name: component.name,
      description: component.description || '',
      instanceCount,
      variantCount: component.type === 'COMPONENT_SET' ? component.children.length : 0,
    });
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
// Create Implementation Page
// ============================================================================

function getScoreColor(score: number): RGB {
  if (score >= 90) return { r: 0.52, g: 0.8, b: 0.09 }; // green
  if (score >= 70) return { r: 0.92, g: 0.7, b: 0.03 }; // yellow
  if (score >= 50) return { r: 0.98, g: 0.45, b: 0.09 }; // orange
  return { r: 0.94, g: 0.27, b: 0.27 }; // red
}

async function createImplementationPage(analysis: AnalysisResult): Promise<void> {
  // Check if page already exists
  let page = figma.root.children.find(p => p.name === '🛟 Design System Health') as PageNode | undefined;

  if (!page) {
    page = figma.createPage();
    page.name = '🛟 Design System Health';
  } else {
    // Clear existing content
    for (const child of page.children) {
      child.remove();
    }
  }

  // Switch to the page
  await figma.setCurrentPageAsync(page);

  // Load fonts
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  // Create main frame
  const mainFrame = figma.createFrame();
  mainFrame.name = 'Design System Health Report';
  mainFrame.resize(800, 600);
  mainFrame.x = 100;
  mainFrame.y = 100;
  mainFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  mainFrame.cornerRadius = 16;
  mainFrame.layoutMode = 'VERTICAL';
  mainFrame.primaryAxisSizingMode = 'AUTO';
  mainFrame.counterAxisSizingMode = 'FIXED';
  mainFrame.paddingTop = 32;
  mainFrame.paddingBottom = 32;
  mainFrame.paddingLeft = 32;
  mainFrame.paddingRight = 32;
  mainFrame.itemSpacing = 24;
  mainFrame.effects = [{
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.1 },
    offset: { x: 0, y: 4 },
    radius: 16,
    visible: true,
    blendMode: 'NORMAL',
  }];

  // Header
  const header = figma.createFrame();
  header.name = 'Header';
  header.layoutMode = 'HORIZONTAL';
  header.primaryAxisSizingMode = 'AUTO';
  header.counterAxisSizingMode = 'AUTO';
  header.itemSpacing = 12;
  header.fills = [];

  const title = figma.createText();
  title.characters = '🛟 Buoy - Design System Health';
  title.fontSize = 24;
  title.fontName = { family: 'Inter', style: 'Bold' };
  title.fills = [{ type: 'SOLID', color: { r: 0.11, g: 0.1, b: 0.09 } }];
  header.appendChild(title);
  mainFrame.appendChild(header);

  // Score section
  const scoreSection = figma.createFrame();
  scoreSection.name = 'Score Section';
  scoreSection.layoutMode = 'HORIZONTAL';
  scoreSection.primaryAxisSizingMode = 'FIXED';
  scoreSection.layoutAlign = 'STRETCH';
  scoreSection.counterAxisSizingMode = 'AUTO';
  scoreSection.itemSpacing = 24;
  scoreSection.fills = [];

  // Main score card
  const scoreCard = figma.createFrame();
  scoreCard.name = 'Health Score';
  scoreCard.layoutMode = 'VERTICAL';
  scoreCard.primaryAxisSizingMode = 'AUTO';
  scoreCard.counterAxisSizingMode = 'AUTO';
  scoreCard.horizontalPadding = 32;
  scoreCard.verticalPadding = 24;
  scoreCard.itemSpacing = 8;
  scoreCard.cornerRadius = 12;
  scoreCard.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98 } }];

  const scoreValue = figma.createText();
  scoreValue.characters = `${analysis.health.score}%`;
  scoreValue.fontSize = 48;
  scoreValue.fontName = { family: 'Inter', style: 'Bold' };
  scoreValue.fills = [{ type: 'SOLID', color: getScoreColor(analysis.health.score) }];
  scoreCard.appendChild(scoreValue);

  const scoreLabel = figma.createText();
  scoreLabel.characters = 'Overall Health';
  scoreLabel.fontSize = 14;
  scoreLabel.fontName = { family: 'Inter', style: 'Medium' };
  scoreLabel.fills = [{ type: 'SOLID', color: { r: 0.34, g: 0.33, b: 0.3 } }];
  scoreCard.appendChild(scoreLabel);
  scoreSection.appendChild(scoreCard);

  // Stats grid
  const statsGrid = figma.createFrame();
  statsGrid.name = 'Stats';
  statsGrid.layoutMode = 'HORIZONTAL';
  statsGrid.primaryAxisSizingMode = 'AUTO';
  statsGrid.counterAxisSizingMode = 'AUTO';
  statsGrid.itemSpacing = 16;
  statsGrid.fills = [];
  statsGrid.layoutGrow = 1;

  const createStatCard = (label: string, value: number, score: number) => {
    const card = figma.createFrame();
    card.name = label;
    card.layoutMode = 'VERTICAL';
    card.primaryAxisSizingMode = 'AUTO';
    card.counterAxisSizingMode = 'AUTO';
    card.horizontalPadding = 20;
    card.verticalPadding = 16;
    card.itemSpacing = 4;
    card.cornerRadius = 8;
    card.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.96 } }];
    card.layoutGrow = 1;

    const valueText = figma.createText();
    valueText.characters = String(value);
    valueText.fontSize = 28;
    valueText.fontName = { family: 'Inter', style: 'Semi Bold' };
    valueText.fills = [{ type: 'SOLID', color: getScoreColor(score) }];
    card.appendChild(valueText);

    const labelText = figma.createText();
    labelText.characters = label;
    labelText.fontSize = 12;
    labelText.fontName = { family: 'Inter', style: 'Medium' };
    labelText.fills = [{ type: 'SOLID', color: { r: 0.66, g: 0.64, b: 0.62 } }];
    card.appendChild(labelText);

    return card;
  };

  statsGrid.appendChild(createStatCard('Colors', analysis.colors.defined.length, analysis.health.breakdown.colorScore));
  statsGrid.appendChild(createStatCard('Typography', analysis.typography.defined.length, analysis.health.breakdown.typographyScore));
  statsGrid.appendChild(createStatCard('Spacing', analysis.spacing.values.length, analysis.health.breakdown.spacingScore));
  statsGrid.appendChild(createStatCard('Components', analysis.components.defined.length, analysis.health.breakdown.componentScore));
  scoreSection.appendChild(statsGrid);
  mainFrame.appendChild(scoreSection);

  // Issues section
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

  if (issues.length > 0) {
    const issuesSection = figma.createFrame();
    issuesSection.name = 'Recommendations';
    issuesSection.layoutMode = 'VERTICAL';
    issuesSection.primaryAxisSizingMode = 'AUTO';
    issuesSection.layoutAlign = 'STRETCH';
    issuesSection.counterAxisSizingMode = 'AUTO';
    issuesSection.itemSpacing = 12;
    issuesSection.paddingTop = 16;
    issuesSection.paddingBottom = 16;
    issuesSection.paddingLeft = 16;
    issuesSection.paddingRight = 16;
    issuesSection.cornerRadius = 8;
    issuesSection.fills = [{ type: 'SOLID', color: { r: 1, g: 0.98, b: 0.92 } }];

    const issuesTitle = figma.createText();
    issuesTitle.characters = 'Recommendations';
    issuesTitle.fontSize = 14;
    issuesTitle.fontName = { family: 'Inter', style: 'Semi Bold' };
    issuesTitle.fills = [{ type: 'SOLID', color: { r: 0.71, g: 0.33, b: 0.04 } }];
    issuesSection.appendChild(issuesTitle);

    for (const issue of issues) {
      const issueText = figma.createText();
      issueText.characters = `• ${issue}`;
      issueText.fontSize = 13;
      issueText.fontName = { family: 'Inter', style: 'Regular' };
      issueText.fills = [{ type: 'SOLID', color: { r: 0.34, g: 0.33, b: 0.3 } }];
      issuesSection.appendChild(issueText);
    }

    mainFrame.appendChild(issuesSection);
  } else {
    const successSection = figma.createFrame();
    successSection.name = 'Success';
    successSection.layoutMode = 'VERTICAL';
    successSection.primaryAxisSizingMode = 'AUTO';
    successSection.layoutAlign = 'STRETCH';
    successSection.counterAxisSizingMode = 'AUTO';
    successSection.itemSpacing = 8;
    successSection.paddingTop = 16;
    successSection.paddingBottom = 16;
    successSection.paddingLeft = 16;
    successSection.paddingRight = 16;
    successSection.cornerRadius = 8;
    successSection.fills = [{ type: 'SOLID', color: { r: 0.94, g: 0.99, b: 0.96 } }];

    const successTitle = figma.createText();
    successTitle.characters = '✓ Looking great!';
    successTitle.fontSize = 14;
    successTitle.fontName = { family: 'Inter', style: 'Semi Bold' };
    successTitle.fills = [{ type: 'SOLID', color: { r: 0.09, g: 0.64, b: 0.26 } }];
    successSection.appendChild(successTitle);

    const successDesc = figma.createText();
    successDesc.characters = 'Your design system is well-structured and ready for implementation.';
    successDesc.fontSize = 13;
    successDesc.fontName = { family: 'Inter', style: 'Regular' };
    successDesc.fills = [{ type: 'SOLID', color: { r: 0.34, g: 0.33, b: 0.3 } }];
    successSection.appendChild(successDesc);

    mainFrame.appendChild(successSection);
  }

  // Footer with timestamp
  const footer = figma.createFrame();
  footer.name = 'Footer';
  footer.layoutMode = 'HORIZONTAL';
  footer.primaryAxisSizingMode = 'AUTO';
  footer.layoutAlign = 'STRETCH';
  footer.counterAxisSizingMode = 'AUTO';
  footer.itemSpacing = 8;
  footer.fills = [];

  const timestamp = figma.createText();
  const now = new Date();
  timestamp.characters = `Generated ${now.toLocaleDateString()} at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Run plugin to refresh`;
  timestamp.fontSize = 11;
  timestamp.fontName = { family: 'Inter', style: 'Regular' };
  timestamp.fills = [{ type: 'SOLID', color: { r: 0.66, g: 0.64, b: 0.62 } }];
  footer.appendChild(timestamp);
  mainFrame.appendChild(footer);

  // Add instruction text below the frame
  const instruction = figma.createText();
  instruction.characters = 'Tip: Add the Buoy widget (Widgets → Development → Buoy) for live updates';
  instruction.fontSize = 12;
  instruction.fontName = { family: 'Inter', style: 'Regular' };
  instruction.fills = [{ type: 'SOLID', color: { r: 0.66, g: 0.64, b: 0.62 } }];
  instruction.x = 100;
  instruction.y = mainFrame.y + mainFrame.height + 16;

  figma.viewport.scrollAndZoomIntoView([mainFrame]);
}

// ============================================================================
// Main Plugin Logic
// ============================================================================

async function runAnalysis(): Promise<AnalysisResult> {
  console.log('Starting analysis...');

  console.log('Analyzing colors...');
  const colors = await analyzeColors();
  console.log('Colors done:', colors.defined.length, 'defined');

  console.log('Analyzing typography...');
  const typography = await analyzeTypography();
  console.log('Typography done:', typography.defined.length, 'defined');

  console.log('Analyzing spacing...');
  const spacing = await analyzeSpacing();
  console.log('Spacing done:', spacing.values.length, 'values');

  console.log('Analyzing components...');
  const components = await analyzeComponents();
  console.log('Components done:', components.defined.length, 'defined');

  console.log('Calculating health...');
  const health = calculateHealth({ colors, typography, spacing, components });
  console.log('Health score:', health.score);

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

    case 'create-page':
      if (!lastAnalysis) {
        figma.notify('🛟 Hold on, still analyzing...');
        break;
      }
      try {
        figma.ui.postMessage({ type: 'creating-page' });
        await createImplementationPage(lastAnalysis);
        figma.notify('🛟 Dashboard updated!');
        figma.ui.postMessage({ type: 'page-created' });
      } catch (error) {
        console.error('Failed to create page:', error);
        figma.notify('🛟 Oops, something went wrong');
        figma.ui.postMessage({ type: 'page-error', payload: error instanceof Error ? error.message : 'Unknown error' });
      }
      break;

    case 'close':
      figma.closePlugin();
      break;

    default:
      console.log('Unknown message type:', msg.type);
  }
};

// Run initial analysis and auto-create dashboard if it doesn't exist
runAnalysis()
  .then(async (result) => {
    console.log('Analysis complete:', result);
    lastAnalysis = result;
    figma.ui.postMessage({ type: 'analysis-complete', payload: result });

    // Auto-create dashboard page if it doesn't exist
    const existingPage = figma.root.children.find(p => p.name === '🛟 Design System Health');
    if (!existingPage) {
      console.log('Creating dashboard page...');
      await createImplementationPage(result);
      figma.notify('🛟 I set up a health dashboard for you!');
    }
  })
  .catch((error) => {
    console.error('Analysis failed:', error);
    figma.ui.postMessage({
      type: 'error',
      payload: error instanceof Error ? error.message : 'Analysis failed',
    });
  });
