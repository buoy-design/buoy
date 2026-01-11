// packages/core/src/models/drift.test.ts
import { describe, it, expect } from 'vitest';
import {
  createDriftId,
  getSeverityWeight,
  getDefaultSeverity,
  DriftTypeSchema,
  DRIFT_TYPE_LABELS,
  DRIFT_TYPE_DESCRIPTIONS,
} from './drift.js';

describe('drift model helpers', () => {
  describe('createDriftId', () => {
    it('creates id with source only', () => {
      const id = createDriftId('hardcoded-value', 'component-123');
      expect(id).toBe('drift:hardcoded-value:component-123');
    });

    it('creates id with source and target', () => {
      const id = createDriftId('semantic-mismatch', 'src-1', 'tgt-2');
      expect(id).toBe('drift:semantic-mismatch:src-1:tgt-2');
    });
  });

  describe('getSeverityWeight', () => {
    it('returns 3 for critical', () => {
      expect(getSeverityWeight('critical')).toBe(3);
    });

    it('returns 2 for warning', () => {
      expect(getSeverityWeight('warning')).toBe(2);
    });

    it('returns 1 for info', () => {
      expect(getSeverityWeight('info')).toBe(1);
    });
  });

  describe('getDefaultSeverity', () => {
    it('returns critical for accessibility-conflict', () => {
      expect(getDefaultSeverity('accessibility-conflict')).toBe('critical');
    });

    it('returns critical for color-contrast', () => {
      expect(getDefaultSeverity('color-contrast')).toBe('critical');
    });

    it('returns warning for hardcoded-value', () => {
      expect(getDefaultSeverity('hardcoded-value')).toBe('warning');
    });

    it('returns warning for unused-component', () => {
      expect(getDefaultSeverity('unused-component')).toBe('warning');
    });

    it('returns info for naming-inconsistency', () => {
      expect(getDefaultSeverity('naming-inconsistency')).toBe('info');
    });

    it('returns info for unused-token', () => {
      expect(getDefaultSeverity('unused-token')).toBe('info');
    });
  });
});

describe('repeated-pattern drift type', () => {
  it('should be a valid drift type', () => {
    const result = DriftTypeSchema.safeParse('repeated-pattern');
    expect(result.success).toBe(true);
  });

  it('should have info as default severity', () => {
    expect(getDefaultSeverity('repeated-pattern')).toBe('info');
  });

  it('should have a label', () => {
    expect(DRIFT_TYPE_LABELS['repeated-pattern']).toBe('Repeated Pattern');
  });

  it('should have a description', () => {
    expect(DRIFT_TYPE_DESCRIPTIONS['repeated-pattern']).toBeDefined();
  });
});
