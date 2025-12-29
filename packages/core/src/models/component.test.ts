// packages/core/src/models/component.test.ts
import { describe, it, expect } from 'vitest';
import { createComponentId, normalizeComponentName } from './component.js';
import type { ReactSource, FigmaSource, VueSource } from './component.js';

describe('component model helpers', () => {
  describe('createComponentId', () => {
    it('creates id for React component', () => {
      const source: ReactSource = {
        type: 'react',
        path: 'src/Button.tsx',
        exportName: 'Button',
      };
      const id = createComponentId(source, 'Button');
      expect(id).toBe('react:src/Button.tsx:Button');
    });

    it('creates id for Figma component', () => {
      const source: FigmaSource = {
        type: 'figma',
        fileKey: 'abc123',
        nodeId: '1:23',
      };
      const id = createComponentId(source, 'Button');
      expect(id).toBe('figma:abc123:1:23');
    });

    it('creates id for Vue component', () => {
      const source: VueSource = {
        type: 'vue',
        path: 'src/Button.vue',
        exportName: 'default',
      };
      const id = createComponentId(source, 'Button');
      expect(id).toBe('vue:src/Button.vue:default');
    });
  });

  describe('normalizeComponentName', () => {
    it('lowercases names', () => {
      expect(normalizeComponentName('Button')).toBe('button');
    });

    it('removes hyphens', () => {
      expect(normalizeComponentName('my-button')).toBe('mybutton');
    });

    it('removes underscores', () => {
      expect(normalizeComponentName('my_button')).toBe('mybutton');
    });

    it('removes spaces', () => {
      expect(normalizeComponentName('My Button')).toBe('mybutton');
    });

    it('removes Component suffix', () => {
      expect(normalizeComponentName('ButtonComponent')).toBe('button');
    });

    it('handles complex names', () => {
      expect(normalizeComponentName('Primary-Button_Component')).toBe('primarybutton');
    });
  });
});
