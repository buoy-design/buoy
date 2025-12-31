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
});
