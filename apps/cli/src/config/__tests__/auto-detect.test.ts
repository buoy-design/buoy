// apps/cli/src/config/__tests__/auto-detect.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

// Mock fs modules
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    readFile: vi.fn(),
  };
});

vi.mock('glob', () => ({
  glob: vi.fn(() => Promise.resolve([])),
}));

// Mock detectFrameworks to isolate monorepo detection testing
vi.mock('../detect/frameworks.js', () => ({
  detectFrameworks: vi.fn(() => Promise.resolve([])),
}));

// Import after mocks are set up
import { buildAutoConfig } from '../auto-detect.js';

describe('buildAutoConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('pnpm-workspace.yaml parsing', () => {
    it('strips quotes from YAML patterns', async () => {
      // Setup mocks for file system
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.endsWith('pnpm-workspace.yaml') || pathStr.endsWith('package.json');
      });

      vi.mocked(readFile).mockImplementation(async (path) => {
        const pathStr = String(path);
        if (pathStr.endsWith('pnpm-workspace.yaml')) {
          return `packages:
  - "apps/*"
  - "packages/*"
`;
        }
        if (pathStr.endsWith('package.json')) {
          return JSON.stringify({
            name: 'test-project',
            dependencies: { react: '^18.0.0' },
          });
        }
        throw new Error(`File not found: ${path}`);
      });

      const result = await buildAutoConfig('/project');

      expect(result.monorepo).not.toBeNull();
      expect(result.monorepo?.type).toBe('pnpm');
      // Patterns should NOT include quotes
      expect(result.monorepo?.patterns).toContain('apps/*');
      expect(result.monorepo?.patterns).toContain('packages/*');
      // Should not include quoted versions
      expect(result.monorepo?.patterns).not.toContain('"apps/*"');
      expect(result.monorepo?.patterns).not.toContain('"packages/*"');
    });

    it('filters out negation patterns from workspace config', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.endsWith('pnpm-workspace.yaml') || pathStr.endsWith('package.json');
      });

      vi.mocked(readFile).mockImplementation(async (path) => {
        const pathStr = String(path);
        if (pathStr.endsWith('pnpm-workspace.yaml')) {
          return `packages:
  - "apps/*"
  - "packages/*"
  - "!**/test/**"
  - "!**/fixtures/**"
`;
        }
        if (pathStr.endsWith('package.json')) {
          return JSON.stringify({
            name: 'test-project',
            dependencies: { react: '^18.0.0' },
          });
        }
        throw new Error(`File not found: ${path}`);
      });

      const result = await buildAutoConfig('/project');

      expect(result.monorepo).not.toBeNull();
      // Should only include positive patterns
      expect(result.monorepo?.patterns).toContain('apps/*');
      expect(result.monorepo?.patterns).toContain('packages/*');
      // Should not include negation patterns
      expect(result.monorepo?.patterns).not.toContain('!**/test/**');
      expect(result.monorepo?.patterns).not.toContain('!**/fixtures/**');
    });

    it('handles single-quoted YAML strings', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.endsWith('pnpm-workspace.yaml') || pathStr.endsWith('package.json');
      });

      vi.mocked(readFile).mockImplementation(async (path) => {
        const pathStr = String(path);
        if (pathStr.endsWith('pnpm-workspace.yaml')) {
          return `packages:
  - 'apps/*'
  - 'packages/*'
`;
        }
        if (pathStr.endsWith('package.json')) {
          return JSON.stringify({
            name: 'test-project',
            dependencies: { react: '^18.0.0' },
          });
        }
        throw new Error(`File not found: ${path}`);
      });

      const result = await buildAutoConfig('/project');

      expect(result.monorepo).not.toBeNull();
      expect(result.monorepo?.patterns).toContain('apps/*');
      expect(result.monorepo?.patterns).toContain('packages/*');
      expect(result.monorepo?.patterns).not.toContain("'apps/*'");
    });

    it('handles unquoted YAML strings', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.endsWith('pnpm-workspace.yaml') || pathStr.endsWith('package.json');
      });

      vi.mocked(readFile).mockImplementation(async (path) => {
        const pathStr = String(path);
        if (pathStr.endsWith('pnpm-workspace.yaml')) {
          return `packages:
  - apps/*
  - packages/*
`;
        }
        if (pathStr.endsWith('package.json')) {
          return JSON.stringify({
            name: 'test-project',
            dependencies: { react: '^18.0.0' },
          });
        }
        throw new Error(`File not found: ${path}`);
      });

      const result = await buildAutoConfig('/project');

      expect(result.monorepo).not.toBeNull();
      expect(result.monorepo?.patterns).toContain('apps/*');
      expect(result.monorepo?.patterns).toContain('packages/*');
    });

    it('handles nested wildcard patterns like packages/**/*', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.endsWith('pnpm-workspace.yaml') || pathStr.endsWith('package.json');
      });

      vi.mocked(readFile).mockImplementation(async (path) => {
        const pathStr = String(path);
        if (pathStr.endsWith('pnpm-workspace.yaml')) {
          return `packages:
  - packages/**/*
  - apps/*
`;
        }
        if (pathStr.endsWith('package.json')) {
          return JSON.stringify({
            name: 'test-project',
            dependencies: { react: '^18.0.0' },
          });
        }
        throw new Error(`File not found: ${path}`);
      });

      const result = await buildAutoConfig('/project');

      expect(result.monorepo).not.toBeNull();
      expect(result.monorepo?.patterns).toContain('packages/**/*');
      expect(result.monorepo?.patterns).toContain('apps/*');
    });
  });

  describe('nested frontend directory detection', () => {
    it('detects frontend/ subdirectory with its own package.json and React', async () => {
      // This pattern is common in full-stack apps where a Go/Python/etc backend
      // has a frontend/ directory with a separate React/Vue app
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        // Root has go.mod (Go backend) but no node package.json
        if (pathStr.endsWith('package.json')) {
          return pathStr.includes('frontend');
        }
        if (pathStr.endsWith('go.mod')) {
          return !pathStr.includes('frontend');
        }
        // frontend/ directory exists
        if (pathStr.endsWith('/frontend')) {
          return true;
        }
        return false;
      });

      vi.mocked(readFile).mockImplementation(async (path) => {
        const pathStr = String(path);
        if (pathStr.includes('frontend') && pathStr.endsWith('package.json')) {
          return JSON.stringify({
            name: 'frontend',
            dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
          });
        }
        throw new Error(`File not found: ${path}`);
      });

      const result = await buildAutoConfig('/project');

      // The config should include patterns that work for nested frontend
      expect(result.config.sources.react).toBeDefined();
      expect(result.config.sources.react?.enabled).toBe(true);
      // Include patterns should cover frontend/src/**/*.tsx
      const includePatterns = result.config.sources.react?.include || [];
      const hasFrontendPattern = includePatterns.some(
        (p: string) => p.includes('frontend/') || p.startsWith('frontend/')
      );
      expect(hasFrontendPattern).toBe(true);
    });

    it('detects client/ subdirectory with React app', async () => {
      // Another common pattern: backend + client/
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        if (pathStr.endsWith('package.json')) {
          return pathStr.includes('client');
        }
        if (pathStr.endsWith('/client')) {
          return true;
        }
        return false;
      });

      vi.mocked(readFile).mockImplementation(async (path) => {
        const pathStr = String(path);
        if (pathStr.includes('client') && pathStr.endsWith('package.json')) {
          return JSON.stringify({
            name: 'client',
            dependencies: { react: '^18.0.0' },
          });
        }
        throw new Error(`File not found: ${path}`);
      });

      const result = await buildAutoConfig('/project');

      expect(result.config.sources.react).toBeDefined();
      const includePatterns = result.config.sources.react?.include || [];
      const hasClientPattern = includePatterns.some(
        (p: string) => p.includes('client/') || p.startsWith('client/')
      );
      expect(hasClientPattern).toBe(true);
    });

    it('detects web/ subdirectory with React app', async () => {
      // Yet another common pattern: web/ directory
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        if (pathStr.endsWith('package.json')) {
          return pathStr.includes('web');
        }
        if (pathStr.endsWith('/web')) {
          return true;
        }
        return false;
      });

      vi.mocked(readFile).mockImplementation(async (path) => {
        const pathStr = String(path);
        if (pathStr.includes('web') && pathStr.endsWith('package.json')) {
          return JSON.stringify({
            name: 'web',
            dependencies: { react: '^18.0.0' },
          });
        }
        throw new Error(`File not found: ${path}`);
      });

      const result = await buildAutoConfig('/project');

      expect(result.config.sources.react).toBeDefined();
      const includePatterns = result.config.sources.react?.include || [];
      const hasWebPattern = includePatterns.some(
        (p: string) => p.includes('web/') || p.startsWith('web/')
      );
      expect(hasWebPattern).toBe(true);
    });
  });
});
