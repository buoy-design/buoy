import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { glob } from 'glob';

export interface DetectedFramework {
  name: string;
  plugin: string;  // Suggested plugin name
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
  matchedFiles?: string[];  // Files that triggered detection
}

export interface PluginInfo {
  name: string;
  description: string;
  detects: string;
  examples?: string[];
}

export const PLUGIN_INFO: Record<string, PluginInfo> = {
  react: {
    name: '@buoy/plugin-react',
    description: 'Scans React/JSX components for inline styles, deprecated components, and design system inconsistencies.',
    detects: 'React components',
    examples: ['Hardcoded colors in style props', 'Deprecated component usage', 'Missing design tokens'],
  },
  vue: {
    name: '@buoy/plugin-vue',
    description: 'Scans Vue single-file components for hardcoded styles and design drift.',
    detects: 'Vue components',
    examples: ['Inline styles in <style> blocks', 'Hardcoded values in templates'],
  },
  svelte: {
    name: '@buoy/plugin-svelte',
    description: 'Scans Svelte components for hardcoded styles and design inconsistencies.',
    detects: 'Svelte components',
    examples: ['Hardcoded CSS values', 'Inline style attributes'],
  },
  angular: {
    name: '@buoy/plugin-angular',
    description: 'Scans Angular components for hardcoded styles in templates and component styles.',
    detects: 'Angular components',
    examples: ['Inline styles', 'Hardcoded values in .component.css'],
  },
  webcomponents: {
    name: '@buoy/plugin-webcomponents',
    description: 'Scans Lit/Stencil web components for hardcoded styles and design drift.',
    detects: 'Web Components (Lit, Stencil)',
    examples: ['Hardcoded CSS in shadow DOM', 'Static style values'],
  },
  css: {
    name: '@buoy/plugin-css',
    description: 'Scans CSS for hardcoded colors, spacing, and fonts that should use design tokens.',
    detects: 'CSS files with potential design tokens',
    examples: ['#ff6b6b instead of var(--color-error)', '16px instead of var(--spacing-md)'],
  },
  tailwind: {
    name: '@buoy/plugin-tailwind',
    description: 'Analyzes Tailwind config and usage for design token consistency.',
    detects: 'Tailwind CSS configuration',
    examples: ['Custom colors not in design system', 'Arbitrary values like [#ff6b6b]'],
  },
  figma: {
    name: '@buoy/plugin-figma',
    description: 'Connects to Figma to compare design tokens and components with your codebase.',
    detects: 'Figma configuration',
    examples: ['Token value drift between Figma and code', 'Missing component implementations'],
  },
  storybook: {
    name: '@buoy/plugin-storybook',
    description: 'Scans Storybook stories to verify component coverage and documentation.',
    detects: 'Storybook configuration',
    examples: ['Components without stories', 'Undocumented variants'],
  },
};

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const FRAMEWORK_PATTERNS: Array<{
  name: string;
  plugin: string;
  packages?: string[];
  files?: string[];
}> = [
  // React ecosystem
  { name: 'react', plugin: 'react', packages: ['react', 'react-dom'] },
  { name: 'next', plugin: 'react', packages: ['next'] },
  { name: 'remix', plugin: 'react', packages: ['@remix-run/react'] },
  { name: 'gatsby', plugin: 'react', packages: ['gatsby'] },

  // Vue ecosystem
  { name: 'vue', plugin: 'vue', packages: ['vue'] },
  { name: 'nuxt', plugin: 'vue', packages: ['nuxt', 'nuxt3'] },

  // Svelte ecosystem
  { name: 'svelte', plugin: 'svelte', packages: ['svelte'] },
  { name: 'sveltekit', plugin: 'svelte', packages: ['@sveltejs/kit'] },

  // Angular
  { name: 'angular', plugin: 'angular', packages: ['@angular/core'] },

  // Web Components
  { name: 'lit', plugin: 'webcomponents', packages: ['lit', 'lit-element'] },
  { name: 'stencil', plugin: 'webcomponents', packages: ['@stencil/core'] },

  // CSS/Tokens
  { name: 'tailwind', plugin: 'tailwind', packages: ['tailwindcss'], files: ['tailwind.config.*'] },
  { name: 'css-variables', plugin: 'css', files: ['**/*.css'] },

  // Design tools
  { name: 'figma', plugin: 'figma', files: ['.figmarc', 'figma.config.*'] },
  { name: 'storybook', plugin: 'storybook', packages: ['@storybook/react', '@storybook/vue3', '@storybook/svelte'], files: ['.storybook/**'] },
];

export async function detectFrameworks(projectRoot: string): Promise<DetectedFramework[]> {
  const detected: DetectedFramework[] = [];

  // Read package.json
  const pkgPath = resolve(projectRoot, 'package.json');
  let pkgJson: PackageJson = {};

  if (existsSync(pkgPath)) {
    try {
      pkgJson = JSON.parse(await readFile(pkgPath, 'utf-8'));
    } catch {
      // Invalid JSON, continue with empty dependencies
    }
  }

  const allDeps = {
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
  };
  const depNames = Object.keys(allDeps);

  for (const pattern of FRAMEWORK_PATTERNS) {
    // Check package.json dependencies
    if (pattern.packages) {
      const matchedPkg = pattern.packages.find((pkg) => depNames.includes(pkg));
      if (matchedPkg) {
        detected.push({
          name: pattern.name,
          plugin: pattern.plugin,
          confidence: 'high',
          evidence: `Found "${matchedPkg}" in package.json`,
        });
        continue;
      }
    }

    // Check for config files
    if (pattern.files) {
      for (const filePattern of pattern.files) {
        const matches = await glob(filePattern, { cwd: projectRoot, nodir: true });
        if (matches.length > 0) {
          detected.push({
            name: pattern.name,
            plugin: pattern.plugin,
            confidence: pattern.packages ? 'medium' : 'high',
            evidence: `Found ${matches[0]}`,
            matchedFiles: matches.slice(0, 5),  // Keep up to 5 files for display
          });
          break;
        }
      }
    }
  }

  // Deduplicate by plugin name, keeping highest confidence
  const byPlugin = new Map<string, DetectedFramework>();
  for (const d of detected) {
    const existing = byPlugin.get(d.plugin);
    if (!existing || confidenceRank(d.confidence) > confidenceRank(existing.confidence)) {
      byPlugin.set(d.plugin, d);
    }
  }

  return Array.from(byPlugin.values());
}

function confidenceRank(c: 'high' | 'medium' | 'low'): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}

export function detectPackageManager(projectRoot: string = process.cwd()): 'pnpm' | 'yarn' | 'npm' {
  if (existsSync(resolve(projectRoot, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (existsSync(resolve(projectRoot, 'yarn.lock'))) {
    return 'yarn';
  }
  return 'npm';
}

export function getPluginInstallCommand(plugins: string[], projectRoot: string = process.cwd()): string {
  const fullNames = plugins.map((p) => `@buoy/plugin-${p}`);
  const pm = detectPackageManager(projectRoot);

  switch (pm) {
    case 'pnpm':
      return `pnpm add -D ${fullNames.join(' ')}`;
    case 'yarn':
      return `yarn add -D ${fullNames.join(' ')}`;
    default:
      return `npm install --save-dev ${fullNames.join(' ')}`;
  }
}
