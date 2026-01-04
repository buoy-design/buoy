import { describe, it, expect } from 'vitest';
import { extractSpacingSignals } from './spacing.js';
import type { SignalContext } from '../types.js';

describe('extractSpacingSignals', () => {
  const defaultContext: SignalContext = {
    fileType: 'tsx',
    framework: 'react',
    scope: 'inline',
    isTokenized: false,
  };

  it('extracts px values', () => {
    const signals = extractSpacingSignals(
      '16px',
      'src/Button.tsx',
      42,
      'padding',
      defaultContext,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('spacing-value');
    expect(signals[0].value).toBe('16px');
    expect(signals[0].metadata.numericValue).toBe(16);
    expect(signals[0].metadata.unit).toBe('px');
  });

  it('extracts rem values', () => {
    const signals = extractSpacingSignals(
      '1.5rem',
      'src/Button.tsx',
      10,
      'margin',
      defaultContext,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.numericValue).toBe(1.5);
    expect(signals[0].metadata.unit).toBe('rem');
  });

  it('extracts em values', () => {
    const signals = extractSpacingSignals(
      '0.5em',
      'src/Button.tsx',
      15,
      'gap',
      defaultContext,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.unit).toBe('em');
  });

  it('extracts percentage values', () => {
    const signals = extractSpacingSignals(
      '25%',
      'src/Button.tsx',
      20,
      'width',
      defaultContext,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].metadata.unit).toBe('%');
    expect(signals[0].metadata.numericValue).toBe(25);
  });

  it('extracts viewport units', () => {
    const signalsVh = extractSpacingSignals('100vh', 'test.tsx', 1, 'height', defaultContext);
    expect(signalsVh[0].metadata.unit).toBe('vh');

    const signalsVw = extractSpacingSignals('50vw', 'test.tsx', 1, 'width', defaultContext);
    expect(signalsVw[0].metadata.unit).toBe('vw');
  });

  it('skips zero without unit', () => {
    const signals = extractSpacingSignals(
      '0',
      'src/Button.tsx',
      25,
      'padding',
      defaultContext,
    );

    expect(signals).toHaveLength(0);
  });

  it('skips auto', () => {
    const signals = extractSpacingSignals(
      'auto',
      'src/Button.tsx',
      30,
      'margin',
      defaultContext,
    );

    expect(signals).toHaveLength(0);
  });

  it('skips CSS variables', () => {
    const signals = extractSpacingSignals(
      'var(--spacing-md)',
      'src/Button.tsx',
      35,
      'padding',
      defaultContext,
    );

    expect(signals).toHaveLength(0);
  });

  it('includes property name in metadata', () => {
    const signals = extractSpacingSignals(
      '8px',
      'src/Button.tsx',
      42,
      'marginTop',
      defaultContext,
    );

    expect(signals[0].metadata.property).toBe('marginTop');
  });

  it('detects spacing category from property', () => {
    const padding = extractSpacingSignals('8px', 'test.tsx', 1, 'padding', defaultContext);
    expect(padding[0].metadata.category).toBe('padding');

    const margin = extractSpacingSignals('8px', 'test.tsx', 1, 'marginLeft', defaultContext);
    expect(margin[0].metadata.category).toBe('margin');

    const gap = extractSpacingSignals('8px', 'test.tsx', 1, 'gap', defaultContext);
    expect(gap[0].metadata.category).toBe('gap');

    const size = extractSpacingSignals('100px', 'test.tsx', 1, 'width', defaultContext);
    expect(size[0].metadata.category).toBe('size');
  });
});
