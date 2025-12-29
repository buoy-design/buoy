// packages/plugin-github/src/__tests__/formatter.test.ts
import { describe, it, expect } from 'vitest';
import { formatPRComment, COMMENT_MARKER } from '../formatter.js';
import type { DriftResult } from '@buoy/core';

describe('GitHub formatter', () => {
  describe('formatPRComment', () => {
    describe('empty results', () => {
      it('formats empty results as success message', () => {
        const result = formatPRComment(createEmptyResult());
        expect(result).toContain('No design drift detected');
        expect(result).toContain('aligned with the design system');
      });

      it('shows green icon for no issues', () => {
        const result = formatPRComment(createEmptyResult());
        expect(result).toContain('🟢');
      });
    });

    describe('buoy marker', () => {
      it('includes buoy marker for comment updates', () => {
        const result = formatPRComment(createEmptyResult());
        expect(result).toContain(COMMENT_MARKER);
      });

      it('places marker at the beginning of the comment', () => {
        const result = formatPRComment(createEmptyResult());
        expect(result.startsWith(COMMENT_MARKER)).toBe(true);
      });
    });

    describe('severity grouping', () => {
      it('groups critical issues under Critical section', () => {
        const driftResult = createResultWithSignals([
          createSignal('critical', 'Missing color token', 'Button'),
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('### Critical');
        expect(result).toContain('Missing color token');
      });

      it('groups warning issues under Warnings section', () => {
        const driftResult = createResultWithSignals([
          createSignal('warning', 'Consider using design token', 'Card'),
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('### Warnings');
        expect(result).toContain('Consider using design token');
      });

      it('groups info issues in collapsible details section', () => {
        const driftResult = createResultWithSignals([
          createSignal('info', 'Minor style suggestion', 'Icon'),
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('<details>');
        expect(result).toContain('1 info-level issue');
        expect(result).toContain('Minor style suggestion');
        expect(result).toContain('</details>');
      });
    });

    describe('severity icons', () => {
      it('shows red icon when critical issues exist', () => {
        const driftResult = createResultWithSignals([
          createSignal('critical', 'Critical issue'),
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('🔴');
      });

      it('shows yellow icon for warnings when no critical issues', () => {
        const driftResult = createResultWithSignals([
          createSignal('warning', 'Warning issue'),
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('🟡');
        expect(result).not.toContain('🔴');
      });

      it('shows green icon for info-only issues', () => {
        const driftResult = createResultWithSignals([
          createSignal('info', 'Info issue'),
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('🟢');
      });

      it('prioritizes critical icon over warning', () => {
        const driftResult = createResultWithSignals([
          createSignal('critical', 'Critical issue'),
          createSignal('warning', 'Warning issue'),
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('🔴');
        expect(result).not.toContain('🟡');
      });
    });

    describe('markdown formatting', () => {
      it('formats output as valid markdown with header', () => {
        const result = formatPRComment(createEmptyResult());
        expect(result).toContain('## ');
        expect(result).toContain('Buoy Drift Report');
      });

      it('includes markdown tables for critical issues', () => {
        const driftResult = createResultWithSignals([
          createSignal('critical', 'Test issue', 'TestComponent', 'src/Test.tsx', 42),
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('| Component | Issue | File |');
        expect(result).toContain('|-----------|-------|------|');
        expect(result).toContain('`TestComponent`');
        expect(result).toContain('`src/Test.tsx:42`');
      });

      it('includes footer with Buoy link', () => {
        const result = formatPRComment(createEmptyResult());
        expect(result).toContain('🔱');
        expect(result).toContain('href="https://github.com/dylantarre/buoy"');
        expect(result).toContain('Buoy');
      });
    });

    describe('summary counts', () => {
      it('includes total count in summary', () => {
        const driftResult = createResultWithSignals([
          createSignal('critical', 'Issue 1'),
          createSignal('warning', 'Issue 2'),
          createSignal('info', 'Issue 3'),
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('3 issues found');
      });

      it('includes breakdown by severity', () => {
        const driftResult = createResultWithSignals([
          createSignal('critical', 'Crit 1'),
          createSignal('critical', 'Crit 2'),
          createSignal('warning', 'Warn 1'),
          createSignal('info', 'Info 1'),
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('2 critical');
        expect(result).toContain('1 warning');
        expect(result).toContain('1 info');
      });

      it('uses singular form for single issue', () => {
        const driftResult = createResultWithSignals([
          createSignal('warning', 'Single issue'),
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('1 issue found');
      });

      it('uses plural form for multiple issues', () => {
        const driftResult = createResultWithSignals([
          createSignal('warning', 'Issue 1'),
          createSignal('warning', 'Issue 2'),
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('2 issues found');
      });
    });

    describe('warning truncation', () => {
      it('truncates warnings list when more than 10 items', () => {
        const warnings = Array.from({ length: 15 }, (_, i) =>
          createSignal('warning', `Warning ${i + 1}`, `Component${i}`)
        );
        const driftResult = createResultWithSignals(warnings);
        const result = formatPRComment(driftResult);

        // Should show first 10 and truncation message
        expect(result).toContain('Warning 1');
        expect(result).toContain('Warning 10');
        expect(result).toContain('5 more warnings');
      });

      it('shows all warnings when 10 or fewer', () => {
        const warnings = Array.from({ length: 10 }, (_, i) =>
          createSignal('warning', `Warning ${i + 1}`)
        );
        const driftResult = createResultWithSignals(warnings);
        const result = formatPRComment(driftResult);

        expect(result).not.toContain('more warnings');
      });
    });

    describe('edge cases', () => {
      it('handles missing component name', () => {
        const driftResult = createResultWithSignals([
          { type: 'hardcoded-value', severity: 'critical' as const, message: 'Issue without component' },
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('`-`');
      });

      it('handles missing file location', () => {
        const driftResult = createResultWithSignals([
          createSignal('critical', 'Issue without file', 'Component'),
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('| - |');
      });

      it('handles file without line number', () => {
        const driftResult = createResultWithSignals([
          { type: 'test', severity: 'critical' as const, message: 'Test', component: 'Comp', file: 'test.tsx' },
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('`test.tsx`');
      });

      it('formats info issues with component and location', () => {
        const driftResult = createResultWithSignals([
          createSignal('info', 'Info message', 'InfoComponent', 'src/info.tsx', 10),
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('`InfoComponent`');
        expect(result).toContain('src/info.tsx:10');
      });

      it('handles unknown component in info section', () => {
        const driftResult = createResultWithSignals([
          { type: 'test', severity: 'info' as const, message: 'Info without component' },
        ]);
        const result = formatPRComment(driftResult);
        expect(result).toContain('`Unknown`');
      });
    });
  });
});

// Helper functions

function createEmptyResult(): DriftResult {
  return {
    signals: [],
    summary: { total: 0, critical: 0, warning: 0, info: 0 },
  };
}

function createSignal(
  severity: 'critical' | 'warning' | 'info',
  message: string,
  component?: string,
  file?: string,
  line?: number
): DriftResult['signals'][0] {
  return {
    type: 'test-drift',
    severity,
    message,
    component,
    file,
    line,
  };
}

function createResultWithSignals(signals: DriftResult['signals']): DriftResult {
  const critical = signals.filter(s => s.severity === 'critical').length;
  const warning = signals.filter(s => s.severity === 'warning').length;
  const info = signals.filter(s => s.severity === 'info').length;

  return {
    signals,
    summary: {
      total: signals.length,
      critical,
      warning,
      info,
    },
  };
}
