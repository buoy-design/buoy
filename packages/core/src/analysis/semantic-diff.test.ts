// packages/core/src/analysis/semantic-diff.test.ts
import { describe, it, expect } from 'vitest';
import { SemanticDiffEngine } from './semantic-diff.js';

describe('SemanticDiffEngine', () => {
  const engine = new SemanticDiffEngine();

  describe('checkFrameworkSprawl', () => {
    it('returns null for single framework', () => {
      const result = engine.checkFrameworkSprawl([
        { name: 'react', version: '18.2.0' },
      ]);
      expect(result).toBeNull();
    });

    it('returns null for empty frameworks', () => {
      const result = engine.checkFrameworkSprawl([]);
      expect(result).toBeNull();
    });

    it('detects sprawl with two UI frameworks', () => {
      const result = engine.checkFrameworkSprawl([
        { name: 'react', version: '18.2.0' },
        { name: 'vue', version: '3.0.0' },
      ]);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('framework-sprawl');
      expect(result?.severity).toBe('warning');
      expect(result?.message).toContain('2 UI frameworks');
    });

    it('ignores non-UI frameworks', () => {
      const result = engine.checkFrameworkSprawl([
        { name: 'react', version: '18.2.0' },
        { name: 'express', version: '4.0.0' },
      ]);
      expect(result).toBeNull();
    });

    it('detects sprawl with meta-frameworks', () => {
      const result = engine.checkFrameworkSprawl([
        { name: 'nextjs', version: '14.0.0' },
        { name: 'nuxt', version: '3.0.0' },
      ]);
      expect(result).not.toBeNull();
      expect(result?.message).toContain('nextjs');
      expect(result?.message).toContain('nuxt');
    });
  });
});
