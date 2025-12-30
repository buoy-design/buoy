// packages/agents/src/utils/git.ts
import simpleGit, { SimpleGit, LogResult } from 'simple-git';
import type { CommitInfo, BlameLine, PullRequestInfo } from '../types.js';

export interface GitClient {
  getCommits(filePath?: string, limit?: number): Promise<CommitInfo[]>;
  getBlame(filePath: string): Promise<BlameLine[]>;
  getDiff(fromRef: string, toRef?: string): Promise<string>;
  getFileAtCommit(filePath: string, commitHash: string): Promise<string | null>;
  getContributors(filePath?: string): Promise<string[]>;
}

export function createGitClient(repoPath: string): GitClient {
  const git: SimpleGit = simpleGit(repoPath);

  return {
    async getCommits(filePath?: string, limit = 50): Promise<CommitInfo[]> {
      const options: Record<string, string | number | undefined> = {
        '--max-count': limit,
      };

      if (filePath) {
        options['--follow'] = undefined;
      }

      const log: LogResult = filePath
        ? await git.log({ file: filePath, maxCount: limit })
        : await git.log({ maxCount: limit });

      return log.all.map((commit) => ({
        hash: commit.hash,
        shortHash: commit.hash.slice(0, 7),
        author: commit.author_name,
        email: commit.author_email,
        date: new Date(commit.date),
        message: commit.message,
        filesChanged: undefined,
      }));
    },

    async getBlame(filePath: string): Promise<BlameLine[]> {
      try {
        const result = await git.raw(['blame', '--line-porcelain', filePath]);
        return parseBlameOutput(result);
      } catch {
        return [];
      }
    },

    async getDiff(fromRef: string, toRef = 'HEAD'): Promise<string> {
      return git.diff([fromRef, toRef]);
    },

    async getFileAtCommit(filePath: string, commitHash: string): Promise<string | null> {
      try {
        return await git.show([`${commitHash}:${filePath}`]);
      } catch {
        return null;
      }
    },

    async getContributors(filePath?: string): Promise<string[]> {
      const commits = await this.getCommits(filePath, 100);
      const contributors = new Set<string>();
      for (const commit of commits) {
        contributors.add(commit.author);
      }
      return Array.from(contributors);
    },
  };
}

function parseBlameOutput(output: string): BlameLine[] {
  const lines: BlameLine[] = [];
  const chunks = output.split(/^([a-f0-9]{40})/m).filter(Boolean);

  let lineNumber = 1;
  for (let i = 0; i < chunks.length; i += 2) {
    const hash = chunks[i];
    const rest = chunks[i + 1];
    if (!hash || !rest) continue;

    const authorMatch = rest.match(/^author (.+)$/m);
    const emailMatch = rest.match(/^author-mail <(.+)>$/m);
    const timeMatch = rest.match(/^author-time (\d+)$/m);
    const summaryMatch = rest.match(/^summary (.+)$/m);
    const contentMatch = rest.match(/^\t(.*)$/m);

    if (authorMatch && contentMatch) {
      lines.push({
        lineNumber,
        content: contentMatch[1] ?? '',
        commit: {
          hash,
          shortHash: hash.slice(0, 7),
          author: authorMatch[1] ?? 'Unknown',
          email: emailMatch?.[1] ?? '',
          date: new Date(parseInt(timeMatch?.[1] ?? '0', 10) * 1000),
          message: summaryMatch?.[1] ?? '',
        },
      });
      lineNumber++;
    }
  }

  return lines;
}

/**
 * Extract file paths from git diff output
 */
export function extractChangedFiles(diffOutput: string): string[] {
  const files: string[] = [];
  const matches = diffOutput.matchAll(/^diff --git a\/(.+?) b\//gm);
  for (const match of matches) {
    if (match[1]) {
      files.push(match[1]);
    }
  }
  return files;
}

/**
 * Summarize commit history for a file into a narrative
 */
export function summarizeFileHistory(commits: CommitInfo[]): {
  frequency: 'active' | 'stable' | 'dormant' | 'abandoned';
  lastChange: Date | undefined;
  mainContributors: string[];
} {
  if (commits.length === 0) {
    return { frequency: 'abandoned', lastChange: undefined, mainContributors: [] };
  }

  const lastChange = commits[0]?.date;
  const now = new Date();
  const daysSinceLastChange = lastChange
    ? (now.getTime() - lastChange.getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;

  let frequency: 'active' | 'stable' | 'dormant' | 'abandoned';
  if (daysSinceLastChange < 30) {
    frequency = 'active';
  } else if (daysSinceLastChange < 90) {
    frequency = 'stable';
  } else if (daysSinceLastChange < 365) {
    frequency = 'dormant';
  } else {
    frequency = 'abandoned';
  }

  const contributorCounts = new Map<string, number>();
  for (const commit of commits) {
    contributorCounts.set(
      commit.author,
      (contributorCounts.get(commit.author) ?? 0) + 1
    );
  }

  const mainContributors = Array.from(contributorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  return { frequency, lastChange, mainContributors };
}
