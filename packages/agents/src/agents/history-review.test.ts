// packages/agents/src/agents/history-review.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoryReviewAgent } from './history-review.js';
import type { HistoryContext } from '../types.js';

vi.mock('../utils/claude.js', async () => {
  const actual = await vi.importActual('../utils/claude.js');
  return {
    ...actual,
    ClaudeClient: vi.fn().mockImplementation(() => ({
      completeJSON: vi.fn().mockResolvedValue({
        data: {
          summary: 'File was last updated 8 months ago during token migration',
          narratives: [
            {
              file: 'Button.tsx',
              summary: 'Component was created in 2023, updated during design system migration',
              keyEvents: [
                {
                  date: '2024-06-15T00:00:00Z',
                  event: 'Token migration',
                  commit: 'abc1234',
                  significance: 'major',
                },
              ],
              mainContributors: ['Alice'],
              lastMeaningfulChange: '2024-06-15T00:00:00Z',
              changeFrequency: 'stable',
            },
          ],
          whyNotUpdated: [
            {
              file: 'Button.tsx',
              reason: 'Missed during token migration PR',
              evidence: ['PR #301 updated 5 of 8 component files'],
              shouldUpdate: true,
            },
          ],
          relatedPRs: [
            {
              pr: {
                number: 301,
                title: 'Migrate to design tokens',
                author: 'alice',
                state: 'merged',
                createdAt: '2024-06-01T00:00:00Z',
                mergedAt: '2024-06-15T00:00:00Z',
                url: 'https://github.com/org/repo/pull/301',
                labels: ['design-system'],
              },
              relevance: 'Introduced the tokens this file should use',
            },
          ],
          findings: [
            {
              type: 'historical-context',
              severity: 'info',
              observation: 'File was missed during migration',
              evidence: ['PR #301'],
              confidence: 0.9,
            },
          ],
        },
        tokensUsed: { input: 150, output: 300 },
      }),
    })),
  };
});

describe('HistoryReviewAgent', () => {
  let agent: HistoryReviewAgent;
  let context: HistoryContext;

  beforeEach(() => {
    agent = new HistoryReviewAgent();
    context = {
      repo: {
        url: 'https://github.com/test/repo',
        name: 'repo',
        owner: 'test',
        defaultBranch: 'main',
        localPath: '/tmp/repo',
      },
      files: [
        {
          path: 'Button.tsx',
          content: 'export const Button = () => {}',
          lineCount: 1,
        },
      ],
      commits: [
        {
          hash: 'abc1234567890',
          shortHash: 'abc1234',
          author: 'Alice',
          email: 'alice@test.com',
          date: new Date('2024-06-15'),
          message: 'feat: migrate to design tokens',
        },
      ],
    };
  });

  it('has correct metadata', () => {
    expect(agent.id).toBe('history-review');
    expect(agent.name).toBe('History Review Agent');
  });

  it('validates context requires commits', () => {
    const noCommits = { ...context, commits: [] };
    const result = agent.validateContext(noCommits);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('At least one commit is required for history analysis');
  });

  it('executes and returns structured result', async () => {
    const result = await agent.execute(context);

    expect(result.agentId).toBe('history-review');
    expect(result.narratives).toHaveLength(1);
    expect(result.narratives[0]?.file).toBe('Button.tsx');
    expect(result.narratives[0]?.changeFrequency).toBe('stable');
    expect(result.whyNotUpdated).toHaveLength(1);
    expect(result.whyNotUpdated[0]?.shouldUpdate).toBe(true);
    expect(result.relatedPRs).toHaveLength(1);
    expect(result.relatedPRs[0]?.pr.number).toBe(301);
  });
});
