// apps/cli/src/commands/__tests__/ci.e2e.test.ts
// E2E-style tests for the full CI pipeline flow

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import type { BuoyConfig } from '../../config/schema.js';
import type { Component, DriftSignal, BuoyPlugin } from '@buoy/core';

// Use a shared mocks object so vi.mock closures can access mutable state
const mocks = {
  scannerScan: vi.fn(),
  engineAnalyze: vi.fn(),
};

// Mock modules before importing the command
vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn(),
  getConfigPath: vi.fn(),
}));

vi.mock('../../plugins/index.js', () => ({
  loadDiscoveredPlugins: vi.fn().mockResolvedValue([]),
  registry: {
    get: vi.fn().mockReturnValue(null),
    getByDetection: vi.fn().mockReturnValue(null),
  },
}));

// Mock with class-like constructors - reference mocks object
vi.mock('@buoy/scanners/git', () => ({
  ReactComponentScanner: vi.fn().mockImplementation(function() {
    return {
      scan: (...args: unknown[]) => mocks.scannerScan(...args),
    };
  }),
}));

vi.mock('@buoy/core/analysis', () => ({
  SemanticDiffEngine: vi.fn().mockImplementation(function() {
    return {
      analyzeComponents: (...args: unknown[]) => mocks.engineAnalyze(...args),
    };
  }),
}));

vi.mock('../../output/reporters.js', () => ({
  setJsonMode: vi.fn(),
}));

// Import after mocks are set up
import { createCICommand } from '../ci.js';
import { loadConfig, getConfigPath } from '../../config/loader.js';
import { loadDiscoveredPlugins, registry } from '../../plugins/index.js';
import { setJsonMode } from '../../output/reporters.js';

// Type the mocked functions
const mockLoadConfig = vi.mocked(loadConfig);
const mockGetConfigPath = vi.mocked(getConfigPath);
const mockLoadDiscoveredPlugins = vi.mocked(loadDiscoveredPlugins);
const mockRegistry = registry as {
  get: ReturnType<typeof vi.fn>;
  getByDetection: ReturnType<typeof vi.fn>;
};
const mockSetJsonMode = vi.mocked(setJsonMode);

// Helper to create a test program
function createTestProgram(): Command {
  const program = new Command();
  program.exitOverride(); // Prevent process.exit
  program.configureOutput({
    writeErr: () => {}, // Suppress error output
    writeOut: () => {}, // Suppress output
  });
  program.addCommand(createCICommand());
  return program;
}

// Helper to create mock config
function createMockConfig(overrides: Partial<BuoyConfig> = {}): BuoyConfig {
  return {
    project: { name: 'test-project' },
    sources: {},
    drift: { ignore: [], severity: {} },
    claude: { enabled: false, model: 'claude-sonnet-4-20250514' },
    output: { format: 'table', colors: true },
    ...overrides,
  };
}

// Helper to create mock component
function createMockComponent(name: string, overrides: Partial<Component> = {}): Component {
  return {
    id: `comp-${name}`,
    name,
    source: {
      type: 'react',
      path: `src/${name}.tsx`,
      exportName: name,
      line: 1,
    },
    props: [{ name: 'onClick', type: '() => void', required: false }],
    variants: [],
    tokens: [],
    dependencies: [],
    metadata: { tags: [] },
    scannedAt: new Date(),
    ...overrides,
  };
}

// Helper to create drift signal
function createDrift(
  severity: 'critical' | 'warning' | 'info',
  component: string = 'Button',
  type: string = 'hardcoded-value'
): DriftSignal {
  return {
    id: `drift-${Math.random().toString(36).substring(7)}`,
    type: type as DriftSignal['type'],
    severity,
    source: {
      entityType: 'component',
      entityId: `comp-${component}`,
      entityName: component,
      location: `src/${component}.tsx:10`,
    },
    message: `Test drift in ${component}`,
    details: {
      suggestions: ['Fix the issue'],
    },
    detectedAt: new Date(),
  };
}

// Helper to setup scanner and analysis mocks
function setupScannerMocks(
  components: Component[],
  drifts: DriftSignal[]
): void {
  mocks.scannerScan.mockResolvedValue({
    items: components,
    errors: [],
    stats: { filesScanned: components.length, itemsFound: components.length, duration: 100 },
  });

  mocks.engineAnalyze.mockReturnValue({ drifts });
}

describe('CI command E2E tests', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let originalCwd: () => string;
  let originalEnv: NodeJS.ProcessEnv;
  let exitCode: number;

  beforeEach(() => {
    // Reset imported mocks
    mockLoadConfig.mockReset();
    mockGetConfigPath.mockReset();
    mockLoadDiscoveredPlugins.mockReset().mockResolvedValue([]);
    mockRegistry.get.mockReset().mockReturnValue(null);
    mockRegistry.getByDetection.mockReset().mockReturnValue(null);
    mockSetJsonMode.mockReset();

    // Reset the shared mock implementations
    mocks.scannerScan.mockReset();
    mocks.engineAnalyze.mockReset();

    // Reset exit code
    exitCode = -1;

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Capture exit code without throwing
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exitCode = code ?? 0;
      return undefined as never;
    }) as (code?: number) => never);
    originalCwd = process.cwd;
    process.cwd = vi.fn().mockReturnValue('/test/project');
    originalEnv = { ...process.env };
    // Clear GitHub env vars
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_PR_NUMBER;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    process.cwd = originalCwd;
    process.env = originalEnv;
  });

  // Helper to find JSON output from console.log calls
  function findJsonOutput(): Record<string, unknown> | null {
    const jsonCall = consoleLogSpy.mock.calls.find(call => {
      try {
        const parsed = JSON.parse(call[0] as string);
        return parsed && typeof parsed === 'object' && 'summary' in parsed;
      } catch {
        return false;
      }
    });
    return jsonCall ? JSON.parse(jsonCall[0] as string) : null;
  }

  describe('Full pipeline: scan -> analyze -> report flow', () => {
    it('completes full pipeline for clean codebase with no drift', async () => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });

      setupScannerMocks(
        [createMockComponent('Button'), createMockComponent('Card')],
        [] // No drifts
      );

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      expect(exitCode).toBe(0);

      const output = findJsonOutput()!;
      expect(output.summary).toEqual({ total: 0, critical: 0, warning: 0, info: 0 });
      expect(output.exitCode).toBe(0);
    });

    it('completes full pipeline for codebase with warnings only', async () => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });

      setupScannerMocks(
        [createMockComponent('Button')],
        [createDrift('warning', 'Button'), createDrift('warning', 'Card')]
      );

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      expect(exitCode).toBe(0); // Default --fail-on is critical, so warnings don't fail

      const output = findJsonOutput()!;
      expect(output.summary).toEqual({ total: 2, critical: 0, warning: 2, info: 0 });
    });

    it('completes full pipeline for codebase with critical drift', async () => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });

      setupScannerMocks(
        [createMockComponent('Button')],
        [
          createDrift('critical', 'Button', 'accessibility-conflict'),
          createDrift('warning', 'Card'),
          createDrift('info', 'Modal'),
        ]
      );

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      expect(exitCode).toBe(1);

      const output = findJsonOutput()!;
      expect(output.summary).toEqual({ total: 3, critical: 1, warning: 1, info: 1 });
      expect(output.exitCode).toBe(1);
    });

    it('handles empty config path by returning empty result', async () => {
      mockGetConfigPath.mockReturnValue(null);

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      const output = findJsonOutput()!;
      expect(output.summary).toEqual({ total: 0, critical: 0, warning: 0, info: 0 });
      expect(output.exitCode).toBe(0);
    });
  });

  describe('GitHub PR comment integration', () => {
    it('posts PR comment when GitHub options are provided', async () => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });

      setupScannerMocks(
        [createMockComponent('Button')],
        [createDrift('warning', 'Button')]
      );

      const mockReport = vi.fn().mockResolvedValue(undefined);
      mockRegistry.get.mockReturnValue({
        metadata: { name: '@buoy/plugin-github', version: '0.0.1' },
        report: mockReport,
      });

      const program = createTestProgram();
      await program.parseAsync([
        'node', 'test', 'ci',
        '--github-token', 'ghp_test123',
        '--github-repo', 'owner/repo',
        '--github-pr', '42',
      ]);

      expect(exitCode).toBe(0);
      expect(mockReport).toHaveBeenCalledTimes(1);
      expect(mockReport).toHaveBeenCalledWith(
        expect.objectContaining({
          signals: expect.any(Array),
          summary: expect.objectContaining({ total: 1, warning: 1 }),
        }),
        expect.objectContaining({
          ci: true,
          format: 'markdown',
          github: { token: 'ghp_test123', repo: 'owner/repo', pr: 42 },
        })
      );
    });

    it('reads GitHub config from environment variables', async () => {
      process.env.GITHUB_TOKEN = 'ghp_env_token';
      process.env.GITHUB_REPOSITORY = 'env-owner/env-repo';
      process.env.GITHUB_PR_NUMBER = '123';

      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });

      setupScannerMocks(
        [createMockComponent('Button')],
        [createDrift('info', 'Button')]
      );

      const mockReport = vi.fn().mockResolvedValue(undefined);
      mockRegistry.get.mockReturnValue({
        metadata: { name: '@buoy/plugin-github', version: '0.0.1' },
        report: mockReport,
      });

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      expect(exitCode).toBe(0);
      expect(mockReport).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          github: { token: 'ghp_env_token', repo: 'env-owner/env-repo', pr: 123 },
        })
      );
    });

    it('handles GitHub plugin report failure gracefully', async () => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });

      setupScannerMocks([createMockComponent('Button')], []);

      const mockReport = vi.fn().mockRejectedValue(new Error('API rate limit exceeded'));
      mockRegistry.get.mockReturnValue({
        metadata: { name: '@buoy/plugin-github', version: '0.0.1' },
        report: mockReport,
      });

      const program = createTestProgram();
      await program.parseAsync([
        'node', 'test', 'ci',
        '--github-token', 'ghp_test',
        '--github-repo', 'owner/repo',
        '--github-pr', '1',
      ]);

      expect(exitCode).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to post GitHub comment')
      );
    });

    it('skips GitHub posting when plugin is not installed', async () => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });

      setupScannerMocks([createMockComponent('Button')], []);
      mockRegistry.get.mockReturnValue(null);

      const program = createTestProgram();
      await program.parseAsync([
        'node', 'test', 'ci',
        '--github-token', 'ghp_test',
        '--github-repo', 'owner/repo',
        '--github-pr', '1',
      ]);

      expect(exitCode).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('GitHub plugin not installed')
      );
    });

    it('validates GitHub repo format', async () => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });

      const program = createTestProgram();
      await program.parseAsync([
        'node', 'test', 'ci',
        '--github-token', 'ghp_test',
        '--github-repo', 'invalid-format', // Missing owner/repo format
        '--github-pr', '1',
      ]);

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid GitHub repo format')
      );
    });

    it('validates PR number is a positive integer', async () => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });

      const program = createTestProgram();
      await program.parseAsync([
        'node', 'test', 'ci',
        '--github-token', 'ghp_test',
        '--github-repo', 'owner/repo',
        '--github-pr', '-5',
      ]);

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid PR number')
      );
    });
  });

  describe('Exit code behavior based on --fail-on setting', () => {
    beforeEach(() => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });
    });

    it('exits 0 with --fail-on none even with critical issues', async () => {
      setupScannerMocks(
        [createMockComponent('Button')],
        [createDrift('critical', 'Button')]
      );

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci', '--fail-on', 'none']);

      expect(exitCode).toBe(0);
    });

    it('exits 1 with --fail-on critical when critical exists', async () => {
      setupScannerMocks(
        [createMockComponent('Button')],
        [createDrift('critical', 'Button')]
      );

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci', '--fail-on', 'critical']);

      expect(exitCode).toBe(1);
    });

    it('exits 0 with --fail-on critical when only warnings exist', async () => {
      setupScannerMocks(
        [createMockComponent('Button')],
        [createDrift('warning', 'Button')]
      );

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci', '--fail-on', 'critical']);

      expect(exitCode).toBe(0);
    });

    it('exits 1 with --fail-on warning when warning exists', async () => {
      setupScannerMocks(
        [createMockComponent('Button')],
        [createDrift('warning', 'Button')]
      );

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci', '--fail-on', 'warning']);

      expect(exitCode).toBe(1);
    });

    it('exits 1 with --fail-on warning when critical exists', async () => {
      setupScannerMocks(
        [createMockComponent('Button')],
        [createDrift('critical', 'Button')]
      );

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci', '--fail-on', 'warning']);

      expect(exitCode).toBe(1);
    });

    it('exits 0 with --fail-on warning when only info exists', async () => {
      setupScannerMocks(
        [createMockComponent('Button')],
        [createDrift('info', 'Button')]
      );

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci', '--fail-on', 'warning']);

      expect(exitCode).toBe(0);
    });

    it('exits 1 with --fail-on info when any issues exist', async () => {
      setupScannerMocks(
        [createMockComponent('Button')],
        [createDrift('info', 'Button')]
      );

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci', '--fail-on', 'info']);

      expect(exitCode).toBe(1);
    });

    it('exits 0 with --fail-on info when no issues exist', async () => {
      setupScannerMocks([createMockComponent('Button')], []);

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci', '--fail-on', 'info']);

      expect(exitCode).toBe(0);
    });
  });

  describe('JSON output mode', () => {
    beforeEach(() => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });
    });

    it('outputs valid JSON with expected structure', async () => {
      setupScannerMocks(
        [createMockComponent('Button')],
        [createDrift('critical', 'Button'), createDrift('warning', 'Card')]
      );

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci', '--format', 'json']);

      expect(mockSetJsonMode).toHaveBeenCalledWith(true);

      const output = findJsonOutput()!;
      expect(output).toHaveProperty('version');
      expect(output).toHaveProperty('timestamp');
      expect(output).toHaveProperty('summary');
      expect(output).toHaveProperty('topIssues');
      expect(output).toHaveProperty('exitCode');
    });

    it('includes top N issues based on --top option', async () => {
      const drifts = Array.from({ length: 15 }, (_, i) =>
        createDrift('warning', `Component${i}`)
      );
      setupScannerMocks([createMockComponent('Button')], drifts);

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci', '--top', '5']);

      const output = findJsonOutput()!;
      expect((output.topIssues as unknown[]).length).toBe(5);
      expect((output.summary as { total: number }).total).toBe(15);
    });

    it('sorts top issues by severity (critical first)', async () => {
      setupScannerMocks(
        [createMockComponent('Button')],
        [
          createDrift('info', 'Info1'),
          createDrift('critical', 'Critical1'),
          createDrift('warning', 'Warning1'),
          createDrift('critical', 'Critical2'),
          createDrift('info', 'Info2'),
        ]
      );

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      const output = findJsonOutput()!;
      const severities = (output.topIssues as Array<{ severity: string }>).map(i => i.severity);
      expect(severities[0]).toBe('critical');
      expect(severities[1]).toBe('critical');
      expect(severities[2]).toBe('warning');
    });

    it('includes file and component info in top issues', async () => {
      setupScannerMocks(
        [createMockComponent('Button')],
        [createDrift('warning', 'Button')]
      );

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      const output = findJsonOutput()!;
      const firstIssue = (output.topIssues as Array<Record<string, unknown>>)[0];
      expect(firstIssue).toHaveProperty('file');
      expect(firstIssue).toHaveProperty('component');
      expect(firstIssue).toHaveProperty('message');
    });
  });

  describe('Summary output mode', () => {
    beforeEach(() => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });
    });

    it('outputs summary format when --format summary is specified', async () => {
      setupScannerMocks(
        [createMockComponent('Button')],
        [createDrift('warning', 'Button')]
      );

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci', '--format', 'summary']);

      const calls = consoleLogSpy.mock.calls.map(c => c[0] as string);
      expect(calls.some(c => c.includes('Buoy Drift Check'))).toBe(true);
      expect(calls.some(c => c.includes('Total:'))).toBe(true);
    });

    it('shows PASS status when exit code is 0', async () => {
      setupScannerMocks([createMockComponent('Button')], []);

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci', '--format', 'summary']);

      const calls = consoleLogSpy.mock.calls.map(c => c[0] as string);
      expect(calls.some(c => c.includes('PASS'))).toBe(true);
    });

    it('shows FAIL status when exit code is 1', async () => {
      setupScannerMocks(
        [createMockComponent('Button')],
        [createDrift('critical', 'Button')]
      );

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci', '--format', 'summary']);

      const calls = consoleLogSpy.mock.calls.map(c => c[0] as string);
      expect(calls.some(c => c.includes('FAIL'))).toBe(true);
    });
  });

  describe('Quiet mode', () => {
    beforeEach(() => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });
    });

    it('suppresses non-essential output with --quiet', async () => {
      setupScannerMocks([createMockComponent('Button')], []);

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci', '--quiet']);

      const errorCalls = consoleErrorSpy.mock.calls.map(c => c[0] as string);
      expect(errorCalls.some(c => c.includes('Loading configuration'))).toBe(false);
      expect(errorCalls.some(c => c.includes('Loading plugins'))).toBe(false);
    });

    it('still outputs JSON result with --quiet', async () => {
      setupScannerMocks([createMockComponent('Button')], []);

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci', '--quiet']);

      expect(findJsonOutput()).not.toBeNull();
    });
  });

  describe('Plugin integration in CI context', () => {
    beforeEach(() => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });
    });

    it('uses plugin scanner when available', async () => {
      const mockPluginScan = vi.fn().mockResolvedValue({
        components: [createMockComponent('PluginButton')],
        tokens: [],
        errors: [],
      });

      mockRegistry.getByDetection.mockReturnValue({
        metadata: { name: 'test-plugin' },
        scan: mockPluginScan,
      });

      mocks.engineAnalyze.mockReturnValue({ drifts: [] });

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      expect(exitCode).toBe(0);
      expect(mockPluginScan).toHaveBeenCalledWith(
        expect.objectContaining({ projectRoot: '/test/project' })
      );
    });

    it('falls back to bundled scanner when plugin unavailable', async () => {
      mockRegistry.getByDetection.mockReturnValue(null);
      setupScannerMocks([createMockComponent('BundledButton')], []);

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      expect(exitCode).toBe(0);
      expect(mocks.scannerScan).toHaveBeenCalled();
    });

    it('loads discovered plugins at startup', async () => {
      setupScannerMocks([createMockComponent('Button')], []);

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      expect(mockLoadDiscoveredPlugins).toHaveBeenCalledWith(
        expect.objectContaining({ projectRoot: '/test/project' })
      );
    });
  });

  describe('Ignore rules', () => {
    it('filters out ignored drifts based on config', async () => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
          drift: {
            ignore: [{ type: 'hardcoded-value', pattern: 'Legacy.*' }],
            severity: {},
          },
        }),
        configPath: '/test/buoy.config.js',
      });

      mocks.scannerScan.mockResolvedValue({
        items: [createMockComponent('Button')],
        errors: [],
        stats: { filesScanned: 1, itemsFound: 1, duration: 100 },
      });

      mocks.engineAnalyze.mockReturnValue({
        drifts: [
          createDrift('warning', 'LegacyButton', 'hardcoded-value'),
          createDrift('warning', 'NewButton', 'hardcoded-value'),
        ],
      });

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      const output = findJsonOutput()!;
      expect((output.summary as { total: number }).total).toBe(1);
      expect((output.topIssues as Array<{ component: string }>)[0].component).toBe('NewButton');
    });
  });

  describe('Error handling', () => {
    it('outputs error JSON when config load fails', async () => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockRejectedValue(new Error('Failed to parse config'));

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse config')
      );
    });

    it('handles scanner errors gracefully', async () => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });

      mocks.scannerScan.mockResolvedValue({
        items: [createMockComponent('Button')],
        errors: [{ file: 'src/Broken.tsx', message: 'Parse error' }],
        stats: { filesScanned: 2, itemsFound: 1, duration: 100 },
      });
      mocks.engineAnalyze.mockReturnValue({ drifts: [] });

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      expect(exitCode).toBe(0);
    });

    it('handles analysis engine errors gracefully', async () => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });

      mocks.scannerScan.mockResolvedValue({
        items: [createMockComponent('Button')],
        errors: [],
        stats: { filesScanned: 1, itemsFound: 1, duration: 100 },
      });
      mocks.engineAnalyze.mockImplementation(() => {
        throw new Error('Analysis engine crashed');
      });

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Analysis engine crashed')
      );
    });
  });

  describe('Multi-source scanning', () => {
    it('scans multiple enabled sources', async () => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
            vue: { enabled: true, include: ['src/**/*.vue'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });

      const reactScan = vi.fn().mockResolvedValue({
        components: [createMockComponent('ReactButton')],
        tokens: [],
        errors: [],
      });

      const vueScan = vi.fn().mockResolvedValue({
        components: [createMockComponent('VueButton')],
        tokens: [],
        errors: [],
      });

      mockRegistry.getByDetection.mockImplementation((framework: string) => {
        if (framework === 'react') return { metadata: { name: 'react-plugin' }, scan: reactScan };
        if (framework === 'vue') return { metadata: { name: 'vue-plugin' }, scan: vueScan };
        return null;
      });

      mocks.engineAnalyze.mockReturnValue({ drifts: [] });

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      expect(exitCode).toBe(0);
      expect(reactScan).toHaveBeenCalled();
      expect(vueScan).toHaveBeenCalled();
      expect(mocks.engineAnalyze).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'ReactButton' }),
          expect.objectContaining({ name: 'VueButton' }),
        ]),
        expect.any(Object)
      );
    });

    it('skips disabled sources', async () => {
      mockGetConfigPath.mockReturnValue('/test/buoy.config.js');
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ['src/**/*.tsx'], exclude: [] },
            vue: { enabled: false, include: ['src/**/*.vue'], exclude: [] },
          },
        }),
        configPath: '/test/buoy.config.js',
      });

      const reactScan = vi.fn().mockResolvedValue({
        components: [createMockComponent('ReactButton')],
        tokens: [],
        errors: [],
      });

      const vueScan = vi.fn().mockResolvedValue({
        components: [],
        tokens: [],
        errors: [],
      });

      mockRegistry.getByDetection.mockImplementation((framework: string) => {
        if (framework === 'react') return { metadata: { name: 'react-plugin' }, scan: reactScan };
        if (framework === 'vue') return { metadata: { name: 'vue-plugin' }, scan: vueScan };
        return null;
      });

      mocks.engineAnalyze.mockReturnValue({ drifts: [] });

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'ci']);

      expect(exitCode).toBe(0);
      expect(reactScan).toHaveBeenCalled();
      expect(vueScan).not.toHaveBeenCalled();
    });
  });
});
