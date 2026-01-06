// apps/cli/src/commands/__tests__/ci.test.ts
import { describe, it, expect } from 'vitest';
import { buildCIResult, calculateExitCode, type CIThresholds } from '../ci.logic.js';
import type { DriftSignal } from '@buoy-design/core';

describe('CI command logic', () => {
  describe('calculateExitCode', () => {
    it('returns 0 when fail-on is none', () => {
      const summary = { critical: 5, warning: 10, info: 20 };
      expect(calculateExitCode(summary, 'none')).toBe(0);
    });

    it('returns 1 when fail-on is critical and critical exists', () => {
      const summary = { critical: 1, warning: 0, info: 0 };
      expect(calculateExitCode(summary, 'critical')).toBe(1);
    });

    it('returns 0 when fail-on is critical and only warnings exist', () => {
      const summary = { critical: 0, warning: 5, info: 0 };
      expect(calculateExitCode(summary, 'critical')).toBe(0);
    });

    it('returns 1 when fail-on is warning and warning exists', () => {
      const summary = { critical: 0, warning: 1, info: 0 };
      expect(calculateExitCode(summary, 'warning')).toBe(1);
    });

    it('returns 1 when fail-on is warning and critical exists', () => {
      const summary = { critical: 1, warning: 0, info: 0 };
      expect(calculateExitCode(summary, 'warning')).toBe(1);
    });

    it('returns 0 when fail-on is warning and only info exists', () => {
      const summary = { critical: 0, warning: 0, info: 5 };
      expect(calculateExitCode(summary, 'warning')).toBe(0);
    });

    it('returns 1 when fail-on is info and any issues exist', () => {
      const summary = { critical: 0, warning: 0, info: 1 };
      expect(calculateExitCode(summary, 'info')).toBe(1);
    });

    it('returns 0 when no issues and fail-on is info', () => {
      const summary = { critical: 0, warning: 0, info: 0 };
      expect(calculateExitCode(summary, 'info')).toBe(0);
    });

    describe('with thresholds', () => {
      it('returns 1 when total exceeds maxDrift', () => {
        const summary = { critical: 0, warning: 5, info: 10, total: 15 };
        const thresholds: CIThresholds = { maxDrift: 10 };
        expect(calculateExitCode(summary, 'none', thresholds)).toBe(1);
      });

      it('returns 0 when total equals maxDrift', () => {
        const summary = { critical: 0, warning: 5, info: 5, total: 10 };
        const thresholds: CIThresholds = { maxDrift: 10 };
        expect(calculateExitCode(summary, 'none', thresholds)).toBe(0);
      });

      it('returns 0 when total is under maxDrift', () => {
        const summary = { critical: 0, warning: 3, info: 2, total: 5 };
        const thresholds: CIThresholds = { maxDrift: 10 };
        expect(calculateExitCode(summary, 'none', thresholds)).toBe(0);
      });

      it('returns 1 when critical exceeds maxCritical', () => {
        const summary = { critical: 3, warning: 0, info: 0 };
        const thresholds: CIThresholds = { maxCritical: 2 };
        expect(calculateExitCode(summary, 'none', thresholds)).toBe(1);
      });

      it('returns 0 when critical equals maxCritical', () => {
        const summary = { critical: 2, warning: 0, info: 0 };
        const thresholds: CIThresholds = { maxCritical: 2 };
        expect(calculateExitCode(summary, 'none', thresholds)).toBe(0);
      });

      it('returns 1 when warning exceeds maxWarning', () => {
        const summary = { critical: 0, warning: 6, info: 0 };
        const thresholds: CIThresholds = { maxWarning: 5 };
        expect(calculateExitCode(summary, 'none', thresholds)).toBe(1);
      });

      it('returns 0 when warning equals maxWarning', () => {
        const summary = { critical: 0, warning: 5, info: 0 };
        const thresholds: CIThresholds = { maxWarning: 5 };
        expect(calculateExitCode(summary, 'none', thresholds)).toBe(0);
      });

      it('threshold failure takes precedence over severity pass', () => {
        const summary = { critical: 0, warning: 0, info: 15, total: 15 };
        const thresholds: CIThresholds = { maxDrift: 10 };
        // With fail-on critical and no critical issues, severity check would pass
        // But threshold check should fail
        expect(calculateExitCode(summary, 'critical', thresholds)).toBe(1);
      });

      it('allows combining multiple thresholds', () => {
        const summary = { critical: 1, warning: 3, info: 5, total: 9 };
        const thresholds: CIThresholds = { maxDrift: 10, maxCritical: 0, maxWarning: 5 };
        // maxCritical: 0 means critical: 1 exceeds threshold
        expect(calculateExitCode(summary, 'none', thresholds)).toBe(1);
      });

      it('passes when all thresholds satisfied', () => {
        const summary = { critical: 0, warning: 3, info: 5, total: 8 };
        const thresholds: CIThresholds = { maxDrift: 10, maxCritical: 0, maxWarning: 5 };
        expect(calculateExitCode(summary, 'none', thresholds)).toBe(0);
      });
    });
  });

  describe('buildCIResult', () => {
    it('includes version field', () => {
      const result = buildCIResult([], 'critical');
      expect(result.version).toBe('1.0.0');
    });

    it('includes timestamp', () => {
      const result = buildCIResult([], 'critical');
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('calculates correct summary counts', () => {
      const drifts = [
        createDrift('critical'),
        createDrift('critical'),
        createDrift('warning'),
        createDrift('info'),
        createDrift('info'),
        createDrift('info'),
      ];

      const result = buildCIResult(drifts, 'none');

      expect(result.summary.total).toBe(6);
      expect(result.summary.critical).toBe(2);
      expect(result.summary.warning).toBe(1);
      expect(result.summary.info).toBe(3);
    });

    it('limits topIssues to 10', () => {
      const drifts = Array(20).fill(null).map(() => createDrift('warning'));

      const result = buildCIResult(drifts, 'none');

      expect(result.topIssues).toHaveLength(10);
    });

    it('sets correct exit code based on fail-on', () => {
      const drifts = [createDrift('warning')];

      const resultCritical = buildCIResult(drifts, 'critical');
      const resultWarning = buildCIResult(drifts, 'warning');

      expect(resultCritical.exitCode).toBe(0);
      expect(resultWarning.exitCode).toBe(1);
    });
  });
});

function createDrift(severity: 'critical' | 'warning' | 'info'): DriftSignal {
  return {
    id: `drift-${Math.random()}`,
    type: 'hardcoded-value',
    severity,
    source: {
      entityType: 'component',
      entityId: 'comp-1',
      entityName: 'Button',
      location: 'src/Button.tsx:10',
    },
    message: 'Test drift',
    details: {},
    detectedAt: new Date(),
  };
}
