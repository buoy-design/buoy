/**
 * AI PR Review Tool Detection
 *
 * Detects which AI code review tools are present in a repository
 * so Buoy can cooperate with them rather than compete.
 */

import { existsSync } from 'fs';
import { join } from 'path';

export interface DetectedTool {
  name: string;
  displayName: string;
  configFile?: string;
  hasConfig: boolean;
  supportsCustomRules: boolean;
  integrationUrl?: string;
}

export interface AIToolsDetectionResult {
  hasAnyTool: boolean;
  tools: DetectedTool[];
  recommendations: string[];
}

const AI_REVIEW_TOOLS = [
  {
    name: 'coderabbit',
    displayName: 'CodeRabbit',
    configFiles: ['.coderabbit.yaml', '.coderabbit.yml'],
    supportsCustomRules: true,
    integrationUrl: 'https://docs.coderabbit.ai/guides/review-instructions',
  },
  {
    name: 'greptile',
    displayName: 'Greptile',
    configFiles: ['greptile.json'],
    supportsCustomRules: true,
    integrationUrl: 'https://www.greptile.com/docs/code-review-bot/custom-context',
  },
  {
    name: 'sourcery',
    displayName: 'Sourcery',
    configFiles: ['.sourcery.yaml'],
    supportsCustomRules: false,
    integrationUrl: 'https://docs.sourcery.ai/',
  },
  {
    name: 'codacy',
    displayName: 'Codacy',
    configFiles: ['.codacy.yml', '.codacy.yaml'],
    supportsCustomRules: true,
    integrationUrl: 'https://docs.codacy.com/',
  },
  {
    name: 'deepsource',
    displayName: 'DeepSource',
    configFiles: ['.deepsource.toml'],
    supportsCustomRules: false,
    integrationUrl: 'https://docs.deepsource.com/',
  },
];

/**
 * Detect AI review tools in a repository
 */
export function detectAIReviewTools(projectRoot: string): AIToolsDetectionResult {
  const tools: DetectedTool[] = [];
  const recommendations: string[] = [];

  for (const tool of AI_REVIEW_TOOLS) {
    let foundConfig: string | undefined;

    for (const configFile of tool.configFiles) {
      const configPath = join(projectRoot, configFile);
      if (existsSync(configPath)) {
        foundConfig = configFile;
        break;
      }
    }

    if (foundConfig) {
      tools.push({
        name: tool.name,
        displayName: tool.displayName,
        configFile: foundConfig,
        hasConfig: true,
        supportsCustomRules: tool.supportsCustomRules,
        integrationUrl: tool.integrationUrl,
      });

      // Add recommendations for tools that support custom rules
      if (tool.supportsCustomRules) {
        recommendations.push(
          `${tool.displayName} detected! Buoy can export design system rules for ${tool.displayName}.`
        );
      }
    }
  }

  // Check for AI context files that tools might read
  const aiContextFiles = ['CLAUDE.md', '.cursorrules', 'agents.md'];
  const foundContextFiles = aiContextFiles.filter(f =>
    existsSync(join(projectRoot, f))
  );

  if (foundContextFiles.length > 0 && tools.length > 0) {
    recommendations.push(
      `Found ${foundContextFiles.join(', ')} - some AI tools will read these automatically.`
    );
  }

  return {
    hasAnyTool: tools.length > 0,
    tools,
    recommendations,
  };
}

/**
 * Generate CodeRabbit configuration for design system rules
 */
export function generateCodeRabbitConfig(options: {
  tokens: Array<{ name: string; value: string; category?: string }>;
  patterns: Array<{ name: string; description: string }>;
  antiPatterns: Array<{ pattern: string; message: string }>;
}): string {
  const { tokens, antiPatterns } = options;

  // Build path instructions for design system
  const pathInstructions: string[] = [];

  // Add token enforcement instructions
  if (tokens.length > 0) {
    const colorTokens = tokens.filter(t => t.category === 'color' || t.name.includes('color'));
    const spacingTokens = tokens.filter(t => t.category === 'spacing' || t.name.includes('spacing'));

    if (colorTokens.length > 0) {
      pathInstructions.push(`
  - path: "**/*.{tsx,jsx,vue,svelte}"
    instructions: |
      Check for hardcoded color values. This project uses design tokens.
      Available color tokens: ${colorTokens.slice(0, 10).map(t => t.name).join(', ')}${colorTokens.length > 10 ? ` (and ${colorTokens.length - 10} more)` : ''}
      Flag any hex colors (#xxx), rgb(), or hsl() that aren't using tokens.`);
    }

    if (spacingTokens.length > 0) {
      pathInstructions.push(`
  - path: "**/*.{tsx,jsx,vue,svelte,css,scss}"
    instructions: |
      Check for hardcoded spacing values. This project uses spacing tokens.
      Available spacing tokens: ${spacingTokens.slice(0, 10).map(t => t.name).join(', ')}${spacingTokens.length > 10 ? ` (and ${spacingTokens.length - 10} more)` : ''}
      Flag arbitrary pixel values for margin, padding, gap that don't use tokens.`);
    }
  }

  // Add anti-pattern rules
  if (antiPatterns.length > 0) {
    pathInstructions.push(`
  - path: "**/*.{tsx,jsx,vue,svelte}"
    instructions: |
      Watch for these design system anti-patterns:
${antiPatterns.slice(0, 5).map(ap => `      - ${ap.message}`).join('\n')}`);
  }

  return `# CodeRabbit Configuration
# Generated by Buoy - Design System Rules
# https://buoy.design

reviews:
  profile: "chill"
  request_changes_workflow: false
  high_level_summary: true
  poem: false

path_instructions:${pathInstructions.join('\n') || '\n  []'}

chat:
  auto_reply: true
`;
}

/**
 * Generate Greptile configuration for design system context
 */
export function generateGreptileConfig(options: {
  tokens: Array<{ name: string; value: string; category?: string }>;
  patterns: Array<{ name: string; description: string }>;
  antiPatterns: Array<{ pattern: string; message: string }>;
  projectName?: string;
}): string {
  const { tokens, patterns, antiPatterns, projectName } = options;

  const customContext: Array<{ type: string; content: string; scope?: string }> = [];

  // Add token context
  if (tokens.length > 0) {
    const tokensByCategory = tokens.reduce((acc, t) => {
      const cat = t.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(t);
      return acc;
    }, {} as Record<string, typeof tokens>);

    let tokenContent = `Design System Tokens for ${projectName || 'this project'}:\n\n`;
    for (const [category, catTokens] of Object.entries(tokensByCategory)) {
      tokenContent += `${category.toUpperCase()}:\n`;
      tokenContent += catTokens.slice(0, 20).map(t => `  ${t.name}: ${t.value}`).join('\n');
      if (catTokens.length > 20) {
        tokenContent += `\n  ... and ${catTokens.length - 20} more`;
      }
      tokenContent += '\n\n';
    }

    customContext.push({
      type: 'rules',
      content: tokenContent,
    });
  }

  // Add pattern guidance
  if (patterns.length > 0) {
    customContext.push({
      type: 'rules',
      content: `Approved UI Patterns:\n${patterns.map(p => `- ${p.name}: ${p.description}`).join('\n')}`,
      scope: 'src/**/*.{tsx,jsx,vue,svelte}',
    });
  }

  // Add anti-pattern warnings
  if (antiPatterns.length > 0) {
    customContext.push({
      type: 'rules',
      content: `Design System Anti-Patterns to Flag:\n${antiPatterns.map(ap => `- ${ap.message}`).join('\n')}`,
      scope: 'src/**/*.{tsx,jsx,vue,svelte}',
    });
  }

  const config = {
    instructions: `Review code for design system compliance. Flag hardcoded values that should use design tokens. Check component patterns match the design system.`,
    strictness: 2,
    customContext,
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Get instructions for integrating with detected tools
 */
export function getIntegrationInstructions(tool: DetectedTool): string {
  switch (tool.name) {
    case 'coderabbit':
      return `To add Buoy's design system rules to CodeRabbit:
  1. Run: buoy lighthouse --export-coderabbit
  2. Merge the output into your .coderabbit.yaml
  3. CodeRabbit will now enforce your design system!`;

    case 'greptile':
      return `To add Buoy's design system context to Greptile:
  1. Run: buoy lighthouse --export-greptile
  2. Add the output to your greptile.json customContext
  3. Or: Greptile auto-reads CLAUDE.md - run 'buoy context' to update it`;

    case 'sourcery':
      return `Sourcery focuses on code quality, not design systems.
  Buoy complements Sourcery by handling design token enforcement.
  Both can run together without conflict.`;

    case 'codacy':
      return `Codacy focuses on security and code quality.
  Buoy complements Codacy by handling design system enforcement.
  Both can run together without conflict.`;

    case 'deepsource':
      return `DeepSource focuses on security and code quality.
  Buoy complements DeepSource by handling design system enforcement.
  Both can run together without conflict.`;

    default:
      return '';
  }
}
