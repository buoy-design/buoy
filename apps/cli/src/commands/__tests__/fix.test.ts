import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFixCommand } from '../fix.js';

// Mock dependencies
vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    config: {
      sources: {
        react: { include: ['src/**/*.tsx'] },
      },
    },
  }),
  getConfigPath: vi.fn().mockReturnValue('buoy.config.mjs'),
}));

vi.mock('../../config/auto-detect.js', () => ({
  buildAutoConfig: vi.fn().mockResolvedValue({
    config: {
      sources: {
        react: { include: ['src/**/*.tsx'] },
      },
    },
    detected: [],
    tokenFiles: [],
  }),
}));

vi.mock('../../output/reporters.js', () => ({
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    text: '',
  })),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  setJsonMode: vi.fn(),
}));

vi.mock('../../scan/orchestrator.js', () => ({
  ScanOrchestrator: vi.fn().mockImplementation(() => ({
    scan: vi.fn().mockResolvedValue({
      components: [],
      tokens: [
        {
          id: 'token:--color-primary',
          name: '--color-primary',
          category: 'color',
          value: { type: 'color', hex: '#3b82f6' },
          source: { type: 'css', file: 'tokens.css', line: 1 },
          metadata: {},
        },
      ],
      errors: [],
    }),
  })),
}));

vi.mock('@buoy-design/core/analysis', () => ({
  SemanticDiffEngine: vi.fn().mockImplementation(() => ({
    analyzeComponents: vi.fn().mockReturnValue({
      drifts: [],
    }),
  })),
}));

vi.mock('../../fix/index.js', () => ({
  applyFixes: vi.fn().mockResolvedValue({
    results: [],
    applied: 0,
    skipped: 0,
    failed: 0,
  }),
  runSafetyChecks: vi.fn().mockReturnValue({
    safe: true,
    warnings: [],
    errors: [],
  }),
  validateFixTargets: vi.fn().mockImplementation((fixes) => ({
    valid: fixes,
    invalid: [],
  })),
}));

vi.mock('../../output/fix-formatters.js', () => ({
  formatFixPreview: vi.fn().mockReturnValue('Preview output'),
  formatFixDiff: vi.fn().mockReturnValue('Diff output'),
  formatFixResult: vi.fn().mockReturnValue('Result output'),
  formatSafetyCheck: vi.fn().mockReturnValue('Safety output'),
  formatFixesJson: vi.fn().mockReturnValue('{}'),
}));

vi.mock('@buoy-design/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@buoy-design/core')>();
  return {
    ...actual,
    generateFixes: vi.fn().mockReturnValue([]),
  };
});

describe('fix command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('command structure', () => {
    it('creates command with correct name', () => {
      const cmd = createFixCommand();
      expect(cmd.name()).toBe('fix');
    });

    it('has correct description', () => {
      const cmd = createFixCommand();
      expect(cmd.description()).toContain('fix');
    });

    it('has --apply option', () => {
      const cmd = createFixCommand();
      const options = cmd.options.map((o) => o.long);
      expect(options).toContain('--apply');
    });

    it('has --dry-run option', () => {
      const cmd = createFixCommand();
      const options = cmd.options.map((o) => o.long);
      expect(options).toContain('--dry-run');
    });

    it('has --confidence option', () => {
      const cmd = createFixCommand();
      const options = cmd.options.map((o) => o.long);
      expect(options).toContain('--confidence');
    });

    it('has --type option', () => {
      const cmd = createFixCommand();
      const options = cmd.options.map((o) => o.long);
      expect(options).toContain('--type');
    });

    it('has --file option', () => {
      const cmd = createFixCommand();
      const options = cmd.options.map((o) => o.long);
      expect(options).toContain('--file');
    });

    it('has --exclude option', () => {
      const cmd = createFixCommand();
      const options = cmd.options.map((o) => o.long);
      expect(options).toContain('--exclude');
    });

    it('has --backup option', () => {
      const cmd = createFixCommand();
      const options = cmd.options.map((o) => o.long);
      expect(options).toContain('--backup');
    });

    it('has --json option', () => {
      const cmd = createFixCommand();
      const options = cmd.options.map((o) => o.long);
      expect(options).toContain('--json');
    });

    it('has --force option', () => {
      const cmd = createFixCommand();
      const options = cmd.options.map((o) => o.long);
      expect(options).toContain('--force');
    });
  });

  describe('default mode (preview)', () => {
    it('runs scan and drift analysis', async () => {
      const { ScanOrchestrator } = await import('../../scan/orchestrator.js');
      const { success } = await import('../../output/reporters.js');

      const cmd = createFixCommand();
      await cmd.parseAsync(['node', 'test']);

      expect(ScanOrchestrator).toHaveBeenCalled();
      // With empty drifts, should show success
      expect(success).toHaveBeenCalledWith(expect.stringContaining('No'));
    });
  });

  describe('confidence level parsing', () => {
    it('defaults to high confidence', () => {
      const cmd = createFixCommand();
      const confidenceOpt = cmd.options.find((o) => o.long === '--confidence');
      expect(confidenceOpt?.defaultValue).toBe('high');
    });
  });
});
