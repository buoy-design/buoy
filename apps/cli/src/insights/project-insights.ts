import { ProjectDetector, type DetectedProject } from '../detect/project-detector.js';

export interface ProjectInsights {
  project: DetectedProject;
  summary: InsightSummary;
  suggestions: Suggestion[];
}

export interface InsightSummary {
  frameworkLine: string;
  fileBreakdown: FileBreakdown[];
  tokenSummary: string | null;
  scannerStatus: ScannerStatus[];
}

export interface FileBreakdown {
  type: string;
  count: number;
  path: string;
  scannable: boolean;
}

export interface ScannerStatus {
  name: string;
  available: boolean;
  reason: string;
}

export interface Suggestion {
  command: string;
  description: string;
  reason: string;
}

export async function discoverProject(cwd: string = process.cwd()): Promise<ProjectInsights> {
  const detector = new ProjectDetector(cwd);
  const project = await detector.detect();

  const summary = buildSummary(project);
  const suggestions = buildSuggestions(project, summary);

  return { project, summary, suggestions };
}

function buildSummary(project: DetectedProject): InsightSummary {
  let frameworkLine = 'Unknown project type';
  if (project.frameworks.length > 0) {
    const primary = project.frameworks[0]!;
    const ts = primary.typescript ? ' + TypeScript' : '';
    const version = primary.version !== 'unknown' ? ` ${primary.version}` : '';
    frameworkLine = `${capitalize(primary.name)}${ts}${version}`;
  }

  const fileBreakdown: FileBreakdown[] = [];
  const scannableTypes = ['jsx', 'tsx', 'vue', 'svelte', 'angular'];

  for (const loc of project.components) {
    fileBreakdown.push({
      type: getTypeLabel(loc.type),
      count: loc.fileCount,
      path: loc.path,
      scannable: scannableTypes.includes(loc.type || ''),
    });
  }

  let tokenSummary: string | null = null;
  if (project.tokens.length > 0) {
    const tokenTypes = project.tokens.map(t => t.type);
    const hasCss = tokenTypes.includes('css') || tokenTypes.includes('scss');
    const hasTailwind = tokenTypes.includes('tailwind');

    const parts: string[] = [];
    if (hasTailwind) parts.push('Tailwind config');
    if (hasCss) parts.push(`${project.tokens.filter(t => t.type === 'css' || t.type === 'scss').length} CSS file(s)`);
    tokenSummary = parts.join(', ');
  }

  const scannerStatus: ScannerStatus[] = [];

  const hasReact = project.frameworks.some(f => ['react', 'nextjs', 'remix', 'gatsby'].includes(f.name));
  const hasVue = project.frameworks.some(f => ['vue', 'nuxt'].includes(f.name));
  const hasSvelte = project.frameworks.some(f => ['svelte', 'sveltekit'].includes(f.name));
  const hasAngular = project.frameworks.some(f => f.name === 'angular');
  const hasAstro = project.frameworks.some(f => f.name === 'astro');
  const hasLit = project.frameworks.some(f => f.name === 'lit');

  if (hasReact) scannerStatus.push({ name: 'React', available: true, reason: 'React detected' });
  if (hasVue) scannerStatus.push({ name: 'Vue', available: true, reason: 'Vue detected' });
  if (hasSvelte) scannerStatus.push({ name: 'Svelte', available: true, reason: 'Svelte detected' });
  if (hasAngular) scannerStatus.push({ name: 'Angular', available: true, reason: 'Angular detected' });

  if (hasAstro) scannerStatus.push({ name: 'Astro', available: false, reason: 'Astro scanner coming soon' });
  if (hasLit) scannerStatus.push({ name: 'Lit', available: false, reason: 'Lit scanner coming soon' });

  const hasTailwindDs = project.designSystem?.type === 'tailwind' || project.tokens.some(t => t.type === 'tailwind');
  if (hasTailwindDs) {
    scannerStatus.push({ name: 'Tailwind', available: true, reason: 'Tailwind config found' });
  }

  return { frameworkLine, fileBreakdown, tokenSummary, scannerStatus };
}

function buildSuggestions(project: DetectedProject, summary: InsightSummary): Suggestion[] {
  const suggestions: Suggestion[] = [];

  const hasUnscannable = summary.fileBreakdown.some(f => !f.scannable && f.count > 0);
  const hasScannable = summary.fileBreakdown.some(f => f.scannable && f.count > 0);

  if (hasUnscannable && !hasScannable) {
    suggestions.push({
      command: 'buoy audit',
      description: 'Analyze CSS values in your codebase',
      reason: 'Component scanning not available for your framework, but CSS analysis works everywhere',
    });
  }

  if (project.tokens.length > 0) {
    suggestions.push({
      command: 'buoy tokens',
      description: 'Extract and formalize design tokens',
      reason: `Found ${project.tokens.length} potential token source(s)`,
    });
  }

  if (summary.fileBreakdown.length > 0) {
    const firstPath = summary.fileBreakdown[0]!.path;
    suggestions.push({
      command: `buoy explain ${firstPath}`,
      description: 'AI-powered investigation of your code',
      reason: 'Works on any file type',
    });
  }

  return suggestions;
}

function getTypeLabel(type: string | undefined): string {
  const labels: Record<string, string> = {
    jsx: 'React components',
    tsx: 'React components',
    vue: 'Vue components',
    svelte: 'Svelte components',
    angular: 'Angular components',
    astro: 'Astro components',
    lit: 'Lit elements',
    blade: 'Blade templates',
    erb: 'ERB templates',
    twig: 'Twig templates',
    svg: 'SVG components',
  };
  return labels[type || ''] || `${type || 'Unknown'} files`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
