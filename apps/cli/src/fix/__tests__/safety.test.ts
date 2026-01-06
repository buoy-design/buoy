import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runSafetyChecks,
  validateFixTargets,
  isGitRepository,
} from '../safety.js';
import type { Fix } from '@buoy-design/core';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Mock modules
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

// Helper to create a mock fix
function createMockFix(overrides: Partial<Fix> = {}): Fix {
  return {
    id: 'fix:test:1:1',
    driftSignalId: 'drift:test',
    confidence: 'high',
    confidenceScore: 100,
    file: 'src/components/Button.tsx',
    line: 10,
    column: 5,
    original: '#ff0000',
    replacement: 'var(--color-danger)',
    reason: 'Exact match',
    fixType: 'hardcoded-color',
    tokenName: '--color-danger',
    ...overrides,
  };
}

describe('runSafetyChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(execSync).mockReturnValue('');
  });

  it('returns safe when all checks pass', () => {
    const fixes = [createMockFix()];
    const result = runSafetyChecks(fixes);

    expect(result.safe).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('warns about uncommitted git changes', () => {
    vi.mocked(execSync).mockReturnValue('M src/file.tsx');

    const fixes = [createMockFix()];
    const result = runSafetyChecks(fixes);

    expect(result.warnings).toContainEqual(
      expect.stringContaining('uncommitted changes')
    );
  });

  it('handles git status errors gracefully', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Not a git repository');
    });

    const fixes = [createMockFix()];
    const result = runSafetyChecks(fixes);

    expect(result.warnings).toContainEqual(
      expect.stringContaining('Could not check git status')
    );
  });

  it('errors on fixes targeting node_modules', () => {
    const fix = createMockFix({
      file: 'node_modules/some-package/index.js',
    });

    const result = runSafetyChecks([fix]);

    expect(result.safe).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('excluded path')
    );
  });

  it('errors on fixes targeting dist directory', () => {
    const fix = createMockFix({
      file: 'dist/bundle.js',
    });

    const result = runSafetyChecks([fix]);

    expect(result.safe).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('excluded path')
    );
  });

  it('errors on fixes targeting minified files', () => {
    const fix = createMockFix({
      file: 'src/vendor/lib.min.js',
    });

    const result = runSafetyChecks([fix]);

    expect(result.safe).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('excluded path')
    );
  });

  it('errors when target file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const fix = createMockFix();
    const result = runSafetyChecks([fix]);

    expect(result.safe).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('File not found')
    );
  });

  it('warns about duplicate fixes at same location', () => {
    const fix1 = createMockFix({ id: 'fix:1' });
    const fix2 = createMockFix({ id: 'fix:2' });

    const result = runSafetyChecks([fix1, fix2]);

    expect(result.warnings).toContainEqual(
      expect.stringContaining('Multiple fixes')
    );
  });

  it('handles multiple errors and warnings', () => {
    vi.mocked(execSync).mockReturnValue('M src/file.tsx'); // Uncommitted changes
    vi.mocked(existsSync).mockReturnValue(false); // File not found

    const fix = createMockFix();
    const result = runSafetyChecks([fix]);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.safe).toBe(false);
  });
});

describe('validateFixTargets', () => {
  it('returns all fixes as valid when they are valid', () => {
    const fixes = [
      createMockFix({ id: 'fix:1' }),
      createMockFix({ id: 'fix:2' }),
    ];

    const result = validateFixTargets(fixes);

    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(0);
  });

  it('invalidates fixes with line < 1', () => {
    const fix = createMockFix({ line: 0 });
    const result = validateFixTargets([fix]);

    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]?.reason).toContain('Invalid location');
  });

  it('invalidates fixes with column < 1', () => {
    const fix = createMockFix({ column: 0 });
    const result = validateFixTargets([fix]);

    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]?.reason).toContain('Invalid location');
  });

  it('invalidates fixes where original equals replacement', () => {
    const fix = createMockFix({
      original: '#ff0000',
      replacement: '#ff0000',
    });

    const result = validateFixTargets([fix]);

    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]?.reason).toContain('identical');
  });

  it('invalidates fixes with empty file path', () => {
    const fix = createMockFix({ file: '' });
    const result = validateFixTargets([fix]);

    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]?.reason).toContain('Invalid file path');
  });

  it('separates valid and invalid fixes', () => {
    const validFix = createMockFix({ id: 'fix:valid' });
    const invalidFix = createMockFix({ id: 'fix:invalid', line: 0 });

    const result = validateFixTargets([validFix, invalidFix]);

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]?.id).toBe('fix:valid');
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]?.fix.id).toBe('fix:invalid');
  });
});

describe('isGitRepository', () => {
  it('returns true when git directory exists', () => {
    vi.mocked(execSync).mockReturnValue('.git\n');

    const result = isGitRepository();

    expect(result).toBe(true);
  });

  it('returns false when not a git repository', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('fatal: not a git repository');
    });

    const result = isGitRepository();

    expect(result).toBe(false);
  });
});
