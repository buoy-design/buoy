// packages/agents/src/utils/git.test.ts
import { describe, it, expect } from 'vitest';
import { extractChangedFiles, summarizeFileHistory } from './git.js';
import type { CommitInfo } from '../types.js';

describe('git utilities', () => {
  describe('extractChangedFiles', () => {
    it('extracts file paths from diff output', () => {
      const diff = `diff --git a/src/Button.tsx b/src/Button.tsx
index 123..456 789
--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,3 +1,4 @@
+import React from 'react';
diff --git a/src/Input.tsx b/src/Input.tsx
index abc..def ghi`;

      const files = extractChangedFiles(diff);
      expect(files).toEqual(['src/Button.tsx', 'src/Input.tsx']);
    });

    it('returns empty array for no matches', () => {
      expect(extractChangedFiles('')).toEqual([]);
    });
  });

  describe('summarizeFileHistory', () => {
    it('returns abandoned for empty commits', () => {
      const result = summarizeFileHistory([]);
      expect(result.frequency).toBe('abandoned');
      expect(result.mainContributors).toEqual([]);
    });

    it('returns active for recent commits', () => {
      const commits: CommitInfo[] = [
        {
          hash: 'abc123',
          shortHash: 'abc123',
          author: 'Alice',
          email: 'alice@test.com',
          date: new Date(),
          message: 'Recent commit',
        },
      ];
      const result = summarizeFileHistory(commits);
      expect(result.frequency).toBe('active');
      expect(result.mainContributors).toContain('Alice');
    });

    it('identifies main contributors', () => {
      const now = new Date();
      const commits: CommitInfo[] = [
        { hash: '1', shortHash: '1', author: 'Alice', email: '', date: now, message: '' },
        { hash: '2', shortHash: '2', author: 'Alice', email: '', date: now, message: '' },
        { hash: '3', shortHash: '3', author: 'Bob', email: '', date: now, message: '' },
        { hash: '4', shortHash: '4', author: 'Alice', email: '', date: now, message: '' },
      ];
      const result = summarizeFileHistory(commits);
      expect(result.mainContributors[0]).toBe('Alice');
    });
  });
});
