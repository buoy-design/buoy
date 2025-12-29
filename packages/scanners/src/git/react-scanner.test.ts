// packages/scanners/src/git/react-scanner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  SIMPLE_BUTTON,
  ARROW_COMPONENT,
  HARDCODED_STYLES,
  DEPRECATED_COMPONENT,
} from '../__tests__/fixtures/react-components.js';
import { ReactComponentScanner } from './react-scanner.js';

describe('ReactComponentScanner', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('component detection', () => {
    it('detects function declaration components', async () => {
      vol.fromJSON({
        '/project/src/Button.tsx': SIMPLE_BUTTON,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Button');
      expect(result.items[0]!.source.type).toBe('react');
    });

    it('detects arrow function components', async () => {
      vol.fromJSON({
        '/project/src/Card.tsx': ARROW_COMPONENT,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Card');
    });

    it('ignores non-component functions', async () => {
      vol.fromJSON({
        '/project/src/utils.tsx': `
          export function formatDate(date: Date): string {
            return date.toISOString();
          }
        `,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
    });

    it('ignores lowercase named functions', async () => {
      vol.fromJSON({
        '/project/src/helper.tsx': `
          export function button() {
            return <button>Click</button>;
          }
        `,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
    });
  });

  describe('hardcoded value detection', () => {
    it('detects hex colors in style prop', async () => {
      vol.fromJSON({
        '/project/src/Badge.tsx': HARDCODED_STYLES,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const hardcoded = result.items[0]!.metadata.hardcodedValues || [];

      expect(hardcoded).toContainEqual(
        expect.objectContaining({ type: 'color', value: '#ff0000' })
      );
    });

    it('detects hardcoded spacing', async () => {
      vol.fromJSON({
        '/project/src/Badge.tsx': HARDCODED_STYLES,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const hardcoded = result.items[0]!.metadata.hardcodedValues || [];

      expect(hardcoded).toContainEqual(
        expect.objectContaining({ type: 'spacing', value: '8px' })
      );
    });
  });

  describe('deprecation detection', () => {
    it('detects @deprecated JSDoc tag', async () => {
      vol.fromJSON({
        '/project/src/OldButton.tsx': DEPRECATED_COMPONENT,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(true);
    });
  });
});
