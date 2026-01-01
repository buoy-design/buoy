// packages/scanners/src/storybook/extractor.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  CSF3_BUTTON_STORY,
  CSF2_CARD_STORY,
  STORY_WITH_PLAY,
  STORY_WITH_DECORATORS,
  NESTED_TITLE_STORY,
  JS_STORY_FILE,
  STORY_WITH_RENDER,
  STORY_WITH_TAGS,
  STORYBOOK_INDEX_JSON,
  STORYBOOK_STORIES_JSON,
  STORYBOOK_MAIN_CONFIG,
} from '../__tests__/fixtures/storybook-stories.js';
import { StorybookScanner, StoryFileScanner } from './extractor.js';

// fs/promises and glob are already mocked in setup.ts

describe('StorybookScanner', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('static directory scanning (index.json)', () => {
    it('parses index.json from static directory', async () => {
      vol.fromJSON({
        '/storybook-static/index.json': STORYBOOK_INDEX_JSON,
      });

      const scanner = new StorybookScanner({
        projectRoot: '/project',
        staticDir: '/storybook-static',
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      expect(result.items.length).toBeGreaterThan(0);

      // Should extract component from Button stories
      const buttonComponent = result.items.find(c => c.name === 'Button');
      expect(buttonComponent).toBeDefined();
      expect(buttonComponent?.source.type).toBe('storybook');
    });

    it('parses legacy stories.json format', async () => {
      vol.fromJSON({
        '/storybook-static/stories.json': STORYBOOK_STORIES_JSON,
      });

      const scanner = new StorybookScanner({
        projectRoot: '/project',
        staticDir: '/storybook-static',
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('extracts variants from story entries', async () => {
      vol.fromJSON({
        '/storybook-static/index.json': STORYBOOK_INDEX_JSON,
      });

      const scanner = new StorybookScanner({
        projectRoot: '/project',
        staticDir: '/storybook-static',
      });

      const result = await scanner.scan();

      const buttonComponent = result.items.find(c => c.name === 'Button');
      expect(buttonComponent?.variants).toContainEqual(
        expect.objectContaining({ name: 'Primary' })
      );
      expect(buttonComponent?.variants).toContainEqual(
        expect.objectContaining({ name: 'Secondary' })
      );
    });
  });
});

describe('StoryFileScanner', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('CSF3 story detection', () => {
    it('detects CSF3 stories with meta object', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF3_BUTTON_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      expect(result.items.length).toBeGreaterThan(0);

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories).toBeDefined();
      expect(buttonStories?.source.type).toBe('storybook');
    });

    it('extracts title from meta as tag', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF3_BUTTON_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories?.metadata?.tags).toContain('storybook-title:Components/Button');
    });

    it('extracts story variants', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF3_BUTTON_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories?.variants).toHaveLength(3);
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Primary' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Secondary' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Large' })
      );
    });

    it('extracts argTypes as props', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF3_BUTTON_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories?.props).toContainEqual(
        expect.objectContaining({ name: 'variant' })
      );
      expect(buttonStories?.props).toContainEqual(
        expect.objectContaining({ name: 'size' })
      );
      expect(buttonStories?.props).toContainEqual(
        expect.objectContaining({ name: 'disabled' })
      );
    });

    it('extracts tags from meta', async () => {
      vol.fromJSON({
        '/project/src/Feature.stories.tsx': STORY_WITH_TAGS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const featureStories = result.items.find(c => c.name === 'ExperimentalFeature');
      expect(featureStories?.metadata?.tags).toContain('experimental');
      expect(featureStories?.metadata?.tags).toContain('beta');
    });
  });

  describe('CSF2 story detection', () => {
    it('detects CSF2 stories with default export', async () => {
      vol.fromJSON({
        '/project/src/Card.stories.tsx': CSF2_CARD_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      const cardStories = result.items.find(c => c.name === 'Card');
      expect(cardStories).toBeDefined();
    });

    it('extracts CSF2 story variants from Template.bind()', async () => {
      vol.fromJSON({
        '/project/src/Card.stories.tsx': CSF2_CARD_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const cardStories = result.items.find(c => c.name === 'Card');
      expect(cardStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Default' })
      );
      expect(cardStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Elevated' })
      );
    });
  });

  describe('story hierarchy', () => {
    it('parses nested title hierarchy as tags', async () => {
      vol.fromJSON({
        '/project/src/Tooltip.stories.tsx': NESTED_TITLE_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const tooltipStories = result.items.find(c => c.name === 'Tooltip');
      // Title is stored as a tag
      expect(tooltipStories?.metadata?.tags).toContain('storybook-title:Design System/Primitives/Tooltip');
      // Hierarchy levels are stored as tags
      expect(tooltipStories?.metadata?.tags).toContain('storybook-level-0:Design System');
      expect(tooltipStories?.metadata?.tags).toContain('storybook-level-1:Primitives');
      expect(tooltipStories?.metadata?.tags).toContain('storybook-level-2:Tooltip');
    });
  });

  describe('story metadata', () => {
    it('detects stories with play functions', async () => {
      vol.fromJSON({
        '/project/src/LoginForm.stories.tsx': STORY_WITH_PLAY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const loginStories = result.items.find(c => c.name === 'LoginForm');
      const filledFormVariant = loginStories?.variants.find(v => v.name === 'FilledForm');
      expect(filledFormVariant?.props?.hasPlayFunction).toBe(true);
    });

    it('detects stories with decorators as tag', async () => {
      vol.fromJSON({
        '/project/src/Modal.stories.tsx': STORY_WITH_DECORATORS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const modalStories = result.items.find(c => c.name === 'Modal');
      expect(modalStories?.metadata?.tags).toContain('has-decorators');
    });

    it('detects stories with render functions', async () => {
      vol.fromJSON({
        '/project/src/Counter.stories.tsx': STORY_WITH_RENDER,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const counterStories = result.items.find(c => c.name === 'Counter');
      const controlledVariant = counterStories?.variants.find(v => v.name === 'Controlled');
      expect(controlledVariant?.props?.hasRenderFunction).toBe(true);
    });
  });

  describe('JavaScript story files', () => {
    it('parses JavaScript story files without types', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.js': JS_STORY_FILE,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.js'],
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories).toBeDefined();
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Primary' })
      );
    });
  });

  describe('main.ts config parsing', () => {
    it('extracts story patterns from main config', async () => {
      vol.fromJSON({
        '/project/.storybook/main.ts': STORYBOOK_MAIN_CONFIG,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
      });

      const patterns = await scanner.getStoryPatternsFromConfig();
      expect(patterns).toContain('../src/**/*.mdx');
      expect(patterns).toContain('../src/**/*.stories.@(js|jsx|mjs|ts|tsx)');
    });
  });

  describe('error handling', () => {
    it('handles invalid story files gracefully', async () => {
      vol.fromJSON({
        '/project/src/Broken.stories.tsx': 'export default { invalid syntax',
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      // Should still complete scan, but with no items from the broken file
      // (TypeScript parsing doesn't throw on syntax errors, it creates a partial AST)
      expect(result.items).toHaveLength(0);
    });
  });

  describe('component reference extraction', () => {
    it('extracts component reference from meta as tag', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF3_BUTTON_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories?.metadata?.tags).toContain('storybook-component:Button');
    });
  });
});
