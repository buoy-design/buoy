// packages/agents/src/agents/history-review.ts
import { BaseAgent, type BaseAgentOptions } from './base.js';
import {
  type HistoryContext,
  type HistoryReviewResult,
  type EvolutionNarrative,
} from '../types.js';
import { promptSection, truncateForTokens } from '../utils/claude.js';

const SYSTEM_PROMPT = `You are an expert at understanding code evolution and git history.

Your task is to analyze git history to understand:
1. Why code evolved to its current state
2. Who maintains different parts of the codebase
3. Whether files were intentionally left unchanged (and why)
4. Historical context that explains current code patterns
5. Related PRs and discussions that provide context

You will receive:
- Commit history for specific files
- Git blame information showing who wrote each line
- Pull request information when available
- Optional drift signals to explain

Respond with a JSON object (no markdown, just JSON) matching this structure:
{
  "summary": "1-2 sentence summary of the history analysis",
  "narratives": [
    {
      "file": "path/to/file.ts",
      "summary": "This file handles X and was last significantly updated when Y",
      "keyEvents": [
        {
          "date": "2024-06-15T00:00:00Z",
          "event": "Added token migration",
          "commit": "abc1234",
          "significance": "major|minor|context"
        }
      ],
      "mainContributors": ["Alice", "Bob"],
      "lastMeaningfulChange": "2024-06-15T00:00:00Z",
      "changeFrequency": "active|stable|dormant|abandoned"
    }
  ],
  "whyNotUpdated": [
    {
      "file": "path/to/file.ts",
      "reason": "Token migration PR #301 missed this file",
      "evidence": ["Commit abc123 only updated 5 of 8 files"],
      "shouldUpdate": true
    }
  ],
  "relatedPRs": [
    {
      "pr": {
        "number": 301,
        "title": "Migrate to design tokens",
        "author": "alice",
        "state": "merged",
        "createdAt": "2024-06-01T00:00:00Z",
        "mergedAt": "2024-06-15T00:00:00Z",
        "url": "https://github.com/org/repo/pull/301",
        "labels": ["design-system"]
      },
      "relevance": "This PR introduced the tokens this file should be using"
    }
  ],
  "findings": [
    {
      "type": "historical-context|maintenance-pattern|ownership",
      "severity": "info|warning|positive",
      "location": "file:line",
      "observation": "What you found in the history",
      "recommendation": "Suggested action based on history",
      "evidence": ["commit hashes", "PR references"],
      "confidence": 0.85
    }
  ]
}`;

export class HistoryReviewAgent extends BaseAgent<HistoryContext, HistoryReviewResult> {
  readonly id = 'history-review';
  readonly name = 'History Review Agent';
  readonly description =
    'Analyzes git history to understand why code evolved and whether files were intentionally left unchanged';

  constructor(options: BaseAgentOptions = {}) {
    super(options);
  }

  async execute(context: HistoryContext): Promise<HistoryReviewResult> {
    const startTime = Date.now();
    const validation = this.validateContext(context);
    if (!validation.valid) {
      throw new Error(`Invalid context: ${validation.errors.join(', ')}`);
    }

    const userPrompt = this.buildPrompt(context);
    const response = await this.client.completeJSON<RawHistoryReviewResponse>(
      SYSTEM_PROMPT,
      [{ role: 'user', content: userPrompt }]
    );

    const { data } = response;
    const findings = this.parseFindings(data.findings ?? []);

    const baseResult = this.buildResult(
      data.summary ?? 'History analysis complete',
      findings,
      JSON.stringify(data, null, 2),
      startTime,
      response.tokensUsed
    );

    return {
      ...baseResult,
      narratives: this.parseNarratives(data.narratives ?? []),
      whyNotUpdated: (data.whyNotUpdated ?? []).map((w) => ({
        file: String(w.file ?? ''),
        reason: String(w.reason ?? ''),
        evidence: Array.isArray(w.evidence) ? w.evidence.map(String) : [],
        shouldUpdate: w.shouldUpdate === true,
      })),
      relatedPRs: (data.relatedPRs ?? []).map((r) => ({
        pr: this.parsePR(r.pr),
        relevance: String(r.relevance ?? ''),
      })),
    };
  }

  override validateContext(context: HistoryContext): { valid: boolean; errors: string[] } {
    const baseValidation = super.validateContext(context);
    const errors = [...baseValidation.errors];

    if (!context.commits || context.commits.length === 0) {
      errors.push('At least one commit is required for history analysis');
    }

    return { valid: errors.length === 0, errors };
  }

  private buildPrompt(context: HistoryContext): string {
    const sections: string[] = [];

    // Repository context
    sections.push(
      promptSection(
        'repository',
        `Name: ${context.repo.name}
Owner: ${context.repo.owner}
URL: ${context.repo.url}`
      )
    );

    // Commit history
    const commitsText = context.commits
      .slice(0, 50) // Limit to recent 50 commits
      .map(
        (c) =>
          `${c.shortHash} | ${c.date.toISOString().split('T')[0]} | ${c.author} | ${c.message.split('\n')[0]}`
      )
      .join('\n');
    sections.push(promptSection('commit_history', commitsText));

    // Blame info if present
    if (context.blame) {
      const blameText = Object.entries(context.blame)
        .map(([file, lines]) => {
          const summary = this.summarizeBlame(lines);
          return `## ${file}\n${summary}`;
        })
        .join('\n\n');
      sections.push(promptSection('blame_summary', truncateForTokens(blameText, 2000)));
    }

    // PRs if present
    if (context.pullRequests && context.pullRequests.length > 0) {
      const prsText = context.pullRequests
        .slice(0, 20)
        .map(
          (pr) =>
            `#${pr.number} | ${pr.state} | ${pr.author} | ${pr.title}
  Labels: ${pr.labels.join(', ') || 'none'}
  URL: ${pr.url}`
        )
        .join('\n\n');
      sections.push(promptSection('pull_requests', prsText));
    }

    // Files for context
    const filesText = context.files
      .map((f) => `- ${f.path} (${f.lineCount} lines)`)
      .join('\n');
    sections.push(promptSection('files_under_analysis', filesText));

    // Drift signals if present
    if (context.signals && context.signals.length > 0) {
      const signalsText = context.signals
        .map(
          (s) =>
            `- ${s.type} in ${s.source.location}: ${s.message}`
        )
        .join('\n');
      sections.push(promptSection('drift_signals_to_explain', signalsText));
    }

    // Question
    if (context.question) {
      sections.push(promptSection('question', context.question));
    } else {
      sections.push(
        promptSection(
          'question',
          'Analyze this git history to understand why the code is in its current state and whether any files were intentionally left unchanged.'
        )
      );
    }

    return sections.join('\n\n');
  }

  private summarizeBlame(lines: Array<{ lineNumber: number; commit: { author: string; date: Date } }>): string {
    const authorCounts = new Map<string, number>();
    let oldestDate = new Date();
    let newestDate = new Date(0);

    for (const line of lines) {
      authorCounts.set(
        line.commit.author,
        (authorCounts.get(line.commit.author) ?? 0) + 1
      );
      if (line.commit.date < oldestDate) oldestDate = line.commit.date;
      if (line.commit.date > newestDate) newestDate = line.commit.date;
    }

    const authors = Array.from(authorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name} (${count} lines)`)
      .join(', ');

    return `Contributors: ${authors}
Date range: ${oldestDate.toISOString().split('T')[0]} to ${newestDate.toISOString().split('T')[0]}
Total lines: ${lines.length}`;
  }

  private parseNarratives(narratives: unknown[]): EvolutionNarrative[] {
    if (!Array.isArray(narratives)) return [];

    return narratives
      .filter((n): n is Record<string, unknown> => typeof n === 'object' && n !== null)
      .map((n) => ({
        file: String(n['file'] ?? ''),
        summary: String(n['summary'] ?? ''),
        keyEvents: Array.isArray(n['keyEvents'])
          ? n['keyEvents']
              .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
              .map((e) => ({
                date: new Date(String(e['date'] ?? '')),
                event: String(e['event'] ?? ''),
                commit: String(e['commit'] ?? ''),
                significance: this.parseSignificance(e['significance']),
              }))
          : [],
        mainContributors: Array.isArray(n['mainContributors'])
          ? n['mainContributors'].map(String)
          : [],
        lastMeaningfulChange: n['lastMeaningfulChange']
          ? new Date(String(n['lastMeaningfulChange']))
          : undefined,
        changeFrequency: this.parseFrequency(n['changeFrequency']),
      }));
  }

  private parseSignificance(value: unknown): 'major' | 'minor' | 'context' {
    if (value === 'major' || value === 'minor' || value === 'context') {
      return value;
    }
    return 'context';
  }

  private parseFrequency(value: unknown): 'active' | 'stable' | 'dormant' | 'abandoned' {
    if (value === 'active' || value === 'stable' || value === 'dormant' || value === 'abandoned') {
      return value;
    }
    return 'stable';
  }

  private parsePR(pr: unknown): HistoryReviewResult['relatedPRs'][0]['pr'] {
    if (typeof pr !== 'object' || pr === null) {
      return {
        number: 0,
        title: '',
        author: '',
        state: 'closed',
        createdAt: new Date(),
        url: '',
        labels: [],
      };
    }

    const p = pr as Record<string, unknown>;
    return {
      number: typeof p['number'] === 'number' ? p['number'] : 0,
      title: String(p['title'] ?? ''),
      author: String(p['author'] ?? ''),
      state: this.parsePRState(p['state']),
      createdAt: new Date(String(p['createdAt'] ?? '')),
      mergedAt: p['mergedAt'] ? new Date(String(p['mergedAt'])) : undefined,
      url: String(p['url'] ?? ''),
      body: p['body'] ? String(p['body']) : undefined,
      labels: Array.isArray(p['labels']) ? p['labels'].map(String) : [],
    };
  }

  private parsePRState(value: unknown): 'open' | 'closed' | 'merged' {
    if (value === 'open' || value === 'closed' || value === 'merged') {
      return value;
    }
    return 'closed';
  }
}

interface RawHistoryReviewResponse {
  summary?: string;
  narratives?: unknown[];
  whyNotUpdated?: Array<{
    file?: string;
    reason?: string;
    evidence?: unknown[];
    shouldUpdate?: boolean;
  }>;
  relatedPRs?: Array<{
    pr?: unknown;
    relevance?: string;
  }>;
  findings?: unknown[];
}
