import { describe, it, expect } from 'vitest';
import { extractFontSizeSignals, extractFontFamilySignals, extractFontWeightSignals } from './typography.js';
import type { SignalContext } from '../types.js';

describe('typography signal extractors', () => {
  const defaultContext: SignalContext = {
    fileType: 'tsx',
    framework: 'react',
    scope: 'inline',
    isTokenized: false,
  };

  describe('extractFontSizeSignals', () => {
    it('extracts px font sizes', () => {
      const signals = extractFontSizeSignals('16px', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('font-size');
      expect(signals[0].metadata.numericValue).toBe(16);
      expect(signals[0].metadata.unit).toBe('px');
    });

    it('extracts rem font sizes', () => {
      const signals = extractFontSizeSignals('1.25rem', 'test.tsx', 1, defaultContext);
      expect(signals[0].metadata.numericValue).toBe(1.25);
      expect(signals[0].metadata.unit).toBe('rem');
    });

    it('skips CSS variables', () => {
      const signals = extractFontSizeSignals('var(--font-size-lg)', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(0);
    });
  });

  describe('extractFontFamilySignals', () => {
    it('extracts font family', () => {
      const signals = extractFontFamilySignals('"Inter", sans-serif', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('font-family');
      expect(signals[0].metadata.families).toContain('Inter');
      expect(signals[0].metadata.fallback).toBe('sans-serif');
    });

    it('extracts single font', () => {
      const signals = extractFontFamilySignals('Arial', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].metadata.families).toContain('Arial');
    });

    it('skips inherit', () => {
      const signals = extractFontFamilySignals('inherit', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(0);
    });

    it('skips CSS variables', () => {
      const signals = extractFontFamilySignals('var(--font-sans)', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(0);
    });
  });

  describe('extractFontWeightSignals', () => {
    it('extracts numeric weight', () => {
      const signals = extractFontWeightSignals('600', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('font-weight');
      expect(signals[0].metadata.numericValue).toBe(600);
    });

    it('extracts named weight', () => {
      const signals = extractFontWeightSignals('bold', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(1);
      expect(signals[0].metadata.numericValue).toBe(700);
      expect(signals[0].metadata.namedValue).toBe('bold');
    });

    it('handles semibold/medium variants', () => {
      const semi = extractFontWeightSignals('semibold', 'test.tsx', 1, defaultContext);
      expect(semi[0].metadata.numericValue).toBe(600);

      const medium = extractFontWeightSignals('medium', 'test.tsx', 1, defaultContext);
      expect(medium[0].metadata.numericValue).toBe(500);
    });

    it('skips inherit', () => {
      const signals = extractFontWeightSignals('inherit', 'test.tsx', 1, defaultContext);
      expect(signals).toHaveLength(0);
    });
  });
});
