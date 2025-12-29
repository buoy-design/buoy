import { Scanner, ScanResult, ScannerConfig, ScanError, ScanStats } from '../base/scanner.js';
import type { Component } from '@buoy-design/core';
import { createComponentId } from '@buoy-design/core';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { relative, basename } from 'path';

export interface TemplateScannerConfig extends ScannerConfig {
  templateType: 'blade' | 'erb' | 'twig' | 'php' | 'html' | 'njk';
}

interface TemplateSource {
  type: 'blade' | 'erb' | 'twig' | 'php' | 'html' | 'njk';
  path: string;
  exportName: string;
  line: number;
}

// Map template types to file extensions and patterns
const TEMPLATE_CONFIG: Record<string, { ext: string; patterns: RegExp[] }> = {
  blade: {
    ext: 'blade.php',
    patterns: [
      /@component\(['"]([^'"]+)['"]/g,           // @component('name')
      /@include\(['"]([^'"]+)['"]/g,             // @include('name')
      /<x-([a-z0-9-:.]+)/gi,                     // <x-component-name>
      /@livewire\(['"]([^'"]+)['"]/g,            // @livewire('name')
    ],
  },
  erb: {
    ext: 'html.erb',
    patterns: [
      /render\s+partial:\s*['"]([^'"]+)['"]/g,   // render partial: 'name'
      /render\s*\(\s*['"]([^'"]+)['"]/g,         // render('name') or render 'name'
      /render\s+['"]([^'"]+)['"]/g,              // render 'name'
    ],
  },
  twig: {
    ext: 'html.twig',
    patterns: [
      /\{%\s*include\s+['"]([^'"]+)['"]/g,       // {% include 'name' %}
      /\{%\s*embed\s+['"]([^'"]+)['"]/g,         // {% embed 'name' %}
      /\{%\s*extends\s+['"]([^'"]+)['"]/g,       // {% extends 'name' %}
      /\{\{\s*include\(['"]([^'"]+)['"]/g,       // {{ include('name') }}
    ],
  },
  php: {
    ext: 'php',
    patterns: [
      /include\s*\(\s*['"]([^'"]+)['"]/g,        // include('file.php')
      /include_once\s*\(\s*['"]([^'"]+)['"]/g,   // include_once('file.php')
      /require\s*\(\s*['"]([^'"]+)['"]/g,        // require('file.php')
      /require_once\s*\(\s*['"]([^'"]+)['"]/g,   // require_once('file.php')
    ],
  },
  html: {
    ext: 'html',
    patterns: [
      /\{\{\s*template\s+['"]([^'"]+)['"]/g,     // {{ template "name" }} (Go)
      /\{\{\s*partial\s+['"]([^'"]+)['"]/g,      // {{ partial "name" }} (Hugo)
      /\{%\s*include\s+['"]([^'"]+)['"]/g,       // {% include 'name' %} (Jekyll/Liquid)
    ],
  },
  njk: {
    ext: 'njk',
    patterns: [
      /\{%\s*include\s+['"]([^'"]+)['"]/g,       // {% include 'name' %}
      /\{%\s*extends\s+['"]([^'"]+)['"]/g,       // {% extends 'name' %}
      /\{%\s*macro\s+(\w+)/g,                    // {% macro name() %}
    ],
  },
};

export class TemplateScanner extends Scanner<Component, TemplateScannerConfig> {
  async scan(): Promise<ScanResult<Component>> {
    const startTime = Date.now();
    const files = await this.findTemplateFiles();
    const components: Component[] = [];
    const errors: ScanError[] = [];

    for (const file of files) {
      try {
        const parsed = await this.parseFile(file);
        if (parsed) components.push(parsed);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          file,
          message,
          code: 'PARSE_ERROR',
        });
      }
    }

    const stats: ScanStats = {
      filesScanned: files.length,
      itemsFound: components.length,
      duration: Date.now() - startTime,
    };

    return { items: components, errors, stats };
  }

  getSourceType(): string {
    return this.config.templateType;
  }

  private async findTemplateFiles(): Promise<string[]> {
    const templateConfig = TEMPLATE_CONFIG[this.config.templateType];
    const ext = templateConfig?.ext || this.config.templateType;

    const patterns = this.config.include || [`**/*.${ext}`];
    const ignore = this.config.exclude || [
      '**/node_modules/**',
      '**/vendor/**',
      '**/cache/**',
      '**/dist/**',
      '**/build/**',
    ];

    const allFiles: string[] = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.config.projectRoot,
        ignore,
        absolute: true,
      });
      allFiles.push(...matches);
    }

    return [...new Set(allFiles)];
  }

  private async parseFile(filePath: string): Promise<Component | null> {
    const content = readFileSync(filePath, 'utf-8');
    const relativePath = relative(this.config.projectRoot, filePath);

    // Generate component name from file path
    // e.g., resources/views/components/button.blade.php -> Button
    // e.g., app/views/shared/_header.html.erb -> Header
    const name = this.extractComponentName(filePath);

    // Skip non-component files (layouts, pages, etc.)
    if (!this.isLikelyComponent(filePath, content)) {
      return null;
    }

    const dependencies = this.extractDependencies(content);

    const source: TemplateSource = {
      type: this.config.templateType,
      path: relativePath,
      exportName: name,
      line: 1,
    };

    return {
      id: createComponentId(source as any, name),
      name,
      source: source as any,
      props: [], // Templates don't have typed props in the same way
      variants: [],
      tokens: [],
      dependencies,
      metadata: {
        deprecated: content.includes('@deprecated') || content.includes('DEPRECATED'),
        tags: [],
      },
      scannedAt: new Date(),
    };
  }

  private extractComponentName(filePath: string): string {
    let name = basename(filePath);

    // Remove extensions
    name = name.replace(/\.(blade\.php|html\.erb|html\.twig|php|html|njk)$/i, '');

    // Remove partial prefix (Rails convention)
    name = name.replace(/^_/, '');

    // Convert to PascalCase
    name = name
      .split(/[-_.]/)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');

    return name;
  }

  private isLikelyComponent(filePath: string, _content: string): boolean {
    const lowerPath = filePath.toLowerCase();
    const fileName = basename(filePath).toLowerCase();

    // Extract the base name without extensions for checking
    const baseName = fileName
      .replace(/\.(blade\.php|html\.erb|html\.twig|cshtml|php|html|njk)$/i, '')
      .replace(/^_/, '');

    // Obvious page/view names to exclude (not reusable components)
    const pageNames = [
      'index', 'home', 'about', 'contact', 'login', 'register', 'signup',
      'dashboard', 'profile', 'settings', 'admin', 'error', 'notfound',
      '404', '500', '403', '401', 'privacy', 'terms', 'faq', 'help',
      'checkout', 'cart', 'search', 'detail', 'details', 'list', 'show',
      'edit', 'create', 'new', 'delete', 'update', 'view', 'display',
      'functions', 'cache', 'retreatdetail', // specific to feelholy
    ];

    // Check if it's an obvious page name
    if (pageNames.includes(baseName.toLowerCase())) {
      return false;
    }

    // Include paths that suggest components
    const componentIndicators = [
      'component',
      'partial',
      'shared',
      '_includes',
      'includes',
      'partials',
      'ui',
      'atoms',
      'molecules',
      'organisms',
      'widgets',
      'blocks',
      'elements',
    ];

    // Exclude paths that suggest layouts/pages/views
    const layoutIndicators = [
      'layout',
      'master',
      'base',
      'page',
      'pages',
      'email',
      'mail',
      'views',  // ASP.NET/Rails views folder
      'areas',  // ASP.NET areas
    ];

    const pathParts = lowerPath.split('/');

    // Check for layout indicators in path (but allow shared partials within views)
    for (const indicator of layoutIndicators) {
      if (pathParts.some(p => p === indicator)) {
        // Exception: allow if path also contains a component indicator
        const hasComponentIndicator = componentIndicators.some(ci =>
          pathParts.some(p => p.includes(ci))
        );
        if (!hasComponentIndicator) {
          return false;
        }
      }
    }

    // Check for component indicators in path
    for (const indicator of componentIndicators) {
      if (pathParts.some(p => p.includes(indicator))) {
        return true;
      }
    }

    // Check for partial prefix (Rails convention: _partial.html.erb)
    if (basename(filePath).startsWith('_')) {
      return true;
    }

    // Default: don't include - require explicit component indicators
    // This prevents random HTML files from being detected as components
    return false;
  }

  private extractDependencies(content: string): string[] {
    const deps: Set<string> = new Set();
    const templateConfig = TEMPLATE_CONFIG[this.config.templateType];

    if (!templateConfig) return [];

    for (const pattern of templateConfig.patterns) {
      // Reset regex lastIndex for each use
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(content)) !== null) {
        if (match[1]) {
          // Extract the dependency name and convert to PascalCase
          const depPath = match[1];
          const depName = this.pathToComponentName(depPath);
          deps.add(depName);
        }
      }
    }

    return Array.from(deps);
  }

  private pathToComponentName(path: string): string {
    // Get the last part of the path
    const parts = path.split(/[\/\.]/);
    let name = parts[parts.length - 1] || parts[parts.length - 2] || path;

    // Remove partial prefix
    name = name.replace(/^_/, '');

    // Convert to PascalCase
    return name
      .split(/[-_]/)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
  }
}
