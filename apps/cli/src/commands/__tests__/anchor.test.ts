// apps/cli/src/commands/__tests__/anchor.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';

// Mock modules before importing the command
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
}));

vi.mock('../../output/reporters.js', () => ({
  spinner: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    text: '',
  })),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  header: vi.fn(),
  keyValue: vi.fn(),
  newline: vi.fn(),
}));

vi.mock('../../detect/project-detector.js', () => ({
  ProjectDetector: vi.fn(),
}));

vi.mock('../../services/architect.js', () => ({
  DesignSystemArchitect: vi.fn(),
}));

vi.mock('../../integrations/index.js', () => ({
  GitHubArchitectClient: vi.fn(),
  parseRepoString: vi.fn((repo: string) => {
    const [owner, repoName] = repo.split('/');
    return { owner, repo: repoName };
  }),
}));

// Import after mocks are set up
import { createAnchorCommand } from '../anchor.js';
import { ProjectDetector } from '../../detect/project-detector.js';
import { DesignSystemArchitect } from '../../services/architect.js';
import { GitHubArchitectClient } from '../../integrations/index.js';
import * as reporters from '../../output/reporters.js';

const mockExistsSync = vi.mocked(existsSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFile = vi.mocked(writeFile);

// Helper to create a test program
function createTestProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeErr: () => {},
    writeOut: () => {},
  });
  program.addCommand(createAnchorCommand());
  return program;
}

// Mock diagnosis result
function createMockDiagnosis() {
  return {
    maturityScore: 45,
    maturityLevel: 'emerging',
    cssAnalysis: {
      uniqueColors: 25,
      uniqueSpacing: 12,
      uniqueFonts: 4,
      tokenizationScore: 35,
      hardcodedValues: 150,
    },
    teamAnalysis: {
      totalContributors: 5,
      activeContributors: 3,
      stylingContributors: 2,
    },
    recommendations: [
      {
        title: 'Create color tokens',
        description: 'Consolidate 25 unique colors into a token palette',
        priority: 'high',
        effort: 'medium',
        impact: 'high',
      },
    ],
    suggestedTokens: [
      { name: '--color-primary', value: '#3b82f6', category: 'color', usageCount: 15 },
      { name: '--color-secondary', value: '#10b981', category: 'color', usageCount: 8 },
      { name: '--spacing-md', value: '16px', category: 'spacing', usageCount: 20 },
    ],
  };
}

describe('anchor command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let originalCwd: () => string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    originalCwd = process.cwd;
    process.cwd = vi.fn().mockReturnValue('/test/project');
    originalEnv = { ...process.env };

    // Default mocks
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('{}');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    process.cwd = originalCwd;
    process.env = originalEnv;
  });

  describe('command structure', () => {
    it('creates anchor command with correct name and description', () => {
      const cmd = createAnchorCommand();

      expect(cmd.name()).toBe('anchor');
      expect(cmd.description()).toContain('Anchor your design system');
    });

    it('has expected options', () => {
      const cmd = createAnchorCommand();
      const options = cmd.options;
      const optionNames = options.map(o => o.long?.replace('--', '') || o.short?.replace('-', ''));

      expect(optionNames).toContain('fresh');
      expect(optionNames).toContain('style');
      expect(optionNames).toContain('output');
      expect(optionNames).toContain('pr');
      expect(optionNames).toContain('json');
    });
  });

  describe('default mode (analyze codebase)', () => {
    beforeEach(() => {
      const mockAnalyze = vi.fn().mockResolvedValue({
        diagnosis: createMockDiagnosis(),
        generatedTokensFile: ':root { --color-primary: #3b82f6; }',
        prDescription: 'Design system tokens PR',
      });

      (DesignSystemArchitect as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        analyze: mockAnalyze,
      }));
    });

    it('analyzes codebase by default', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor']);

      expect(DesignSystemArchitect).toHaveBeenCalled();
      expect(reporters.header).toHaveBeenCalledWith('Design System Analysis');
    });

    it('displays maturity score', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor']);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Maturity Score:')
      );
    });

    it('displays CSS analysis results', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor']);

      expect(reporters.keyValue).toHaveBeenCalledWith('Unique Colors', '25');
      expect(reporters.keyValue).toHaveBeenCalledWith('Unique Spacing Values', '12');
      expect(reporters.keyValue).toHaveBeenCalledWith('Hardcoded Values', '150');
    });

    it('displays recommendations', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor']);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Create color tokens')
      );
    });

    it('displays suggested tokens preview', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor']);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('--color-primary')
      );
    });

    it('outputs generated CSS tokens', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor']);

      expect(reporters.info).toHaveBeenCalledWith('Generated design-tokens.css:');
    });
  });

  describe('--json output', () => {
    beforeEach(() => {
      const mockAnalyze = vi.fn().mockResolvedValue({
        diagnosis: createMockDiagnosis(),
        generatedTokensFile: ':root { --color-primary: #3b82f6; }',
        prDescription: 'Design system tokens PR',
      });

      (DesignSystemArchitect as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        analyze: mockAnalyze,
      }));
    });

    it('outputs JSON when --json flag is provided', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(call => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed && typeof parsed === 'object' && 'diagnosis' in parsed;
        } catch {
          return false;
        }
      });

      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it('JSON output contains diagnosis and tokens', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find(call => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed && 'diagnosis' in parsed;
        } catch {
          return false;
        }
      });

      const output = JSON.parse(jsonCall![0] as string);
      expect(output).toHaveProperty('diagnosis');
      expect(output).toHaveProperty('generatedTokens');
      expect(output.diagnosis).toHaveProperty('maturityScore');
    });
  });

  describe('--output option', () => {
    beforeEach(() => {
      const mockAnalyze = vi.fn().mockResolvedValue({
        diagnosis: createMockDiagnosis(),
        generatedTokensFile: ':root { --color-primary: #3b82f6; }',
        prDescription: 'Design system tokens PR',
      });

      (DesignSystemArchitect as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        analyze: mockAnalyze,
      }));
    });

    it('writes tokens to specified file', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor', '--output', 'tokens.css']);

      expect(mockWriteFile).toHaveBeenCalledWith(
        'tokens.css',
        expect.stringContaining('--color-primary')
      );
      expect(reporters.success).toHaveBeenCalledWith(
        expect.stringContaining('tokens.css')
      );
    });
  });

  describe('--pr option', () => {
    beforeEach(() => {
      const mockAnalyze = vi.fn().mockResolvedValue({
        diagnosis: createMockDiagnosis(),
        generatedTokensFile: ':root { --color-primary: #3b82f6; }',
        prDescription: 'Design system tokens PR',
      });

      (DesignSystemArchitect as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        analyze: mockAnalyze,
      }));
    });

    it('warns when GitHub credentials missing', async () => {
      delete process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_REPOSITORY;

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor', '--pr']);

      expect(reporters.warning).toHaveBeenCalledWith(
        expect.stringContaining('GitHub token and repo required')
      );
    });

    it('creates PR when credentials provided', async () => {
      const mockCreatePR = vi.fn().mockResolvedValue({
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
      });

      (GitHubArchitectClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        createDesignTokensPR: mockCreatePR,
      }));

      const program = createTestProgram();
      await program.parseAsync([
        'node', 'test', 'anchor', '--pr',
        '--github-token', 'test-token',
        '--github-repo', 'owner/repo',
      ]);

      expect(GitHubArchitectClient).toHaveBeenCalled();
      expect(mockCreatePR).toHaveBeenCalled();
      expect(reporters.success).toHaveBeenCalledWith('Created PR #42');
    });

    it('uses environment variables for GitHub credentials', async () => {
      process.env.GITHUB_TOKEN = 'env-token';
      process.env.GITHUB_REPOSITORY = 'env-owner/env-repo';

      const mockCreatePR = vi.fn().mockResolvedValue({
        number: 99,
        url: 'https://github.com/env-owner/env-repo/pull/99',
      });

      (GitHubArchitectClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        createDesignTokensPR: mockCreatePR,
      }));

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor', '--pr']);

      expect(mockCreatePR).toHaveBeenCalled();
    });
  });

  describe('--fresh mode', () => {
    beforeEach(() => {
      // Mock global config
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('.buoy/config.json')) {
          return true;
        }
        return false;
      });

      mockReadFileSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('.buoy/config.json')) {
          return JSON.stringify({ anthropicApiKey: 'test-key' });
        }
        return '{}';
      });

      // Mock project detector
      const mockDetect = vi.fn().mockResolvedValue({
        name: 'test-project',
        frameworks: [{ name: 'react', typescript: true }],
      });
      (ProjectDetector as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        detect: mockDetect,
      }));

      // Mock fetch for Claude API
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: [{
            type: 'text',
            text: '```json\n{"colors": {"primary": "#3b82f6"}}\n```\n```css\n:root { --primary: #3b82f6; }\n```\n```javascript\nmodule.exports = {}\n```',
          }],
        }),
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('requires API key for fresh mode', async () => {
      mockExistsSync.mockReturnValue(false);
      delete process.env.ANTHROPIC_API_KEY;

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor', '--fresh']);

      expect(reporters.error).toHaveBeenCalledWith(
        expect.stringContaining('API key required')
      );
    });

    it('generates fresh design system with API key', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor', '--fresh']);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.any(Object)
      );
      expect(reporters.header).toHaveBeenCalledWith('Generated Design System');
    });

    it('uses style preset when provided', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor', '--fresh', '--style', 'bold']);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('Bold'),
        })
      );
    });

    it('writes tokens.json and tokens.css files', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor', '--fresh']);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('tokens.json'),
        expect.any(String)
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('tokens.css'),
        expect.any(String)
      );
    });
  });

  describe('--set-key option', () => {
    it('saves API key to global config', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor', '--set-key', 'sk-ant-test123']);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.buoy/config.json'),
        expect.stringContaining('sk-ant-test123')
      );
      expect(reporters.success).toHaveBeenCalledWith(
        expect.stringContaining('API key saved')
      );
    });
  });

  describe('error handling', () => {
    it('handles analysis failure gracefully', async () => {
      const mockAnalyze = vi.fn().mockRejectedValue(new Error('Analysis failed'));
      (DesignSystemArchitect as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        analyze: mockAnalyze,
      }));

      const program = createTestProgram();

      try {
        await program.parseAsync(['node', 'test', 'anchor']);
      } catch {
        // Expected
      }

      expect(reporters.error).toHaveBeenCalledWith(
        expect.stringContaining('Build failed')
      );
    });

    it('handles PR creation failure', async () => {
      const mockAnalyze = vi.fn().mockResolvedValue({
        diagnosis: createMockDiagnosis(),
        generatedTokensFile: ':root {}',
        prDescription: 'PR',
      });

      (DesignSystemArchitect as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        analyze: mockAnalyze,
      }));

      const mockCreatePR = vi.fn().mockRejectedValue(new Error('API rate limit'));
      (GitHubArchitectClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        createDesignTokensPR: mockCreatePR,
      }));

      const program = createTestProgram();
      await program.parseAsync([
        'node', 'test', 'anchor', '--pr',
        '--github-token', 'test-token',
        '--github-repo', 'owner/repo',
      ]);

      expect(reporters.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create PR')
      );
    });
  });

  describe('--no-ai option', () => {
    it('passes noAI flag to architect', async () => {
      const mockAnalyze = vi.fn().mockResolvedValue({
        diagnosis: createMockDiagnosis(),
        generatedTokensFile: ':root {}',
        prDescription: 'PR',
      });

      (DesignSystemArchitect as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        analyze: mockAnalyze,
      }));

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'anchor', '--no-ai']);

      expect(mockAnalyze).toHaveBeenCalledWith(
        expect.objectContaining({
          noAI: true,
        })
      );
    });
  });
});
