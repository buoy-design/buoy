import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyFixes, generateFixDiff } from '../applier.js';
import type { Fix } from '@buoy-design/core';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';

// Mock fs modules
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  copyFile: vi.fn(),
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
    file: '/test/file.tsx',
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

describe('applyFixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('returns empty results for empty fixes array', async () => {
    const result = await applyFixes([]);

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it('applies fix to file content', async () => {
    const fix = createMockFix({
      file: '/test/file.tsx',
      line: 2,
      column: 10,
      original: '#ff0000',
      replacement: 'var(--color-danger)',
    });

    const fileContent = `const x = 1;\nconst color = '#ff0000';\nconst y = 2;`;
    vi.mocked(fs.readFile).mockResolvedValue(fileContent);

    const result = await applyFixes([fix], { dryRun: false });

    expect(result.applied).toBe(1);
    expect(fs.writeFile).toHaveBeenCalled();

    const writtenContent = vi.mocked(fs.writeFile).mock.calls[0]?.[1];
    expect(writtenContent).toContain('var(--color-danger)');
    expect(writtenContent).not.toContain('#ff0000');
  });

  it('skips fixes below confidence threshold', async () => {
    const fix = createMockFix({
      confidence: 'low',
    });

    vi.mocked(fs.readFile).mockResolvedValue('const color = "#ff0000";');

    const result = await applyFixes([fix], {
      minConfidence: 'high',
      dryRun: false,
    });

    expect(result.skipped).toBe(1);
    expect(result.applied).toBe(0);
    expect(result.results[0]?.status).toBe('skipped');
  });

  it('does not write file in dry run mode', async () => {
    const fix = createMockFix();
    vi.mocked(fs.readFile).mockResolvedValue('const color = "#ff0000";');

    await applyFixes([fix], { dryRun: true });

    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('creates backup when backup option is true', async () => {
    const fix = createMockFix({
      line: 1,
      original: '#ff0000',
    });
    vi.mocked(fs.readFile).mockResolvedValue('const color = "#ff0000";');

    await applyFixes([fix], { backup: true, dryRun: false });

    expect(fs.copyFile).toHaveBeenCalledWith(
      fix.file,
      `${fix.file}.bak`
    );
  });

  it('fails when file does not exist', async () => {
    const fix = createMockFix();
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await applyFixes([fix]);

    expect(result.failed).toBe(1);
    expect(result.results[0]?.status).toBe('failed');
    expect(result.results[0]?.error).toContain('not found');
  });

  it('fails when original value not found in file', async () => {
    const fix = createMockFix({
      line: 1,
      original: '#ff0000',
    });
    vi.mocked(fs.readFile).mockResolvedValue('const color = "#00ff00";'); // Different color

    const result = await applyFixes([fix], { dryRun: false });

    expect(result.failed).toBe(1);
    expect(result.results[0]?.error).toContain('not found');
  });

  it('applies multiple fixes to same file in correct order', async () => {
    const fix1 = createMockFix({
      id: 'fix:1',
      line: 2,
      original: '#ff0000',
      replacement: 'var(--red)',
    });
    const fix2 = createMockFix({
      id: 'fix:2',
      line: 4,
      original: '#00ff00',
      replacement: 'var(--green)',
    });

    const fileContent = `line1\n#ff0000\nline3\n#00ff00\nline5`;
    vi.mocked(fs.readFile).mockResolvedValue(fileContent);

    const result = await applyFixes([fix1, fix2], { dryRun: false });

    expect(result.applied).toBe(2);

    const writtenContent = vi.mocked(fs.writeFile).mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain('var(--red)');
    expect(writtenContent).toContain('var(--green)');
  });
});

describe('generateFixDiff', () => {
  it('generates diff header', () => {
    const fix = createMockFix({
      file: '/test/file.tsx',
      line: 10,
    });

    const diff = generateFixDiff(fix);

    expect(diff).toContain('--- /test/file.tsx');
    expect(diff).toContain('+++ /test/file.tsx');
  });

  it('generates diff hunk header', () => {
    const fix = createMockFix({
      line: 10,
    });

    const diff = generateFixDiff(fix);

    expect(diff).toContain('@@ -10,1 +10,1 @@');
  });

  it('shows removed and added lines', () => {
    const fix = createMockFix({
      original: '#ff0000',
      replacement: 'var(--color-danger)',
    });

    const diff = generateFixDiff(fix);

    expect(diff).toContain('-#ff0000');
    expect(diff).toContain('+var(--color-danger)');
  });
});
