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
  CSF3_AUTO_TITLE_STORY,
  STORY_WITH_SUBCOMPONENTS,
  STORY_WITH_DOCS_PARAMS,
  STORY_WITH_LOADERS,
  STORY_WITH_BEFORE_EACH,
  STORYBOOK_INDEX_JSON_V5,
  CSF1_ARROW_FUNCTION_STORY,
  STORY_WITH_STORYNAME,
  STORY_WITH_REEXPORTS,
  STORY_WITH_MIXED_PATTERNS,
  STORY_WITH_GLOBALS,
  CSF4_PREVIEW_STORY,
  CSF4_AUTO_TITLE,
  CSF4_STORYBOOK_IMPORT,
  STORY_WITH_INLINE_COMPONENT,
  STORY_WITH_INLINE_FUNCTION_COMPONENT,
  CSF4_IMPORTED_PREVIEW,
  CSF4_IMPORTED_PREVIEW_WITH_ARGTYPES,
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

  describe('auto-title detection', () => {
    it('infers title from file path when no title is specified', async () => {
      vol.fromJSON({
        '/project/src/components/Button.stories.tsx': CSF3_AUTO_TITLE_STORY,
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
      // Should infer title from file path: src/components/Button.stories.tsx -> components/Button
      expect(buttonStories?.metadata?.tags).toContain('storybook-title:components/Button');
    });

    it('uses component name as title when component is specified but no title', async () => {
      vol.fromJSON({
        '/project/src/ui/MyButton.stories.tsx': CSF3_AUTO_TITLE_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories).toBeDefined();
      // When component is specified but no title, should use component name with path
      expect(buttonStories?.metadata?.tags).toContain('storybook-title:ui/Button');
    });
  });

  describe('subcomponents extraction', () => {
    it('extracts subcomponents from meta', async () => {
      vol.fromJSON({
        '/project/src/List.stories.tsx': STORY_WITH_SUBCOMPONENTS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const listStories = result.items.find(c => c.name === 'List');
      expect(listStories).toBeDefined();
      // Should have subcomponents as tags or in metadata
      expect(listStories?.metadata?.tags).toContain('storybook-subcomponent:ListItem');
      expect(listStories?.metadata?.tags).toContain('storybook-subcomponent:ListHeader');
    });

    it('includes subcomponents count in dependencies', async () => {
      vol.fromJSON({
        '/project/src/List.stories.tsx': STORY_WITH_SUBCOMPONENTS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const listStories = result.items.find(c => c.name === 'List');
      // Subcomponents should be tracked as dependencies
      expect(listStories?.dependencies).toContain('ListItem');
      expect(listStories?.dependencies).toContain('ListHeader');
    });
  });

  describe('docs parameters extraction', () => {
    it('extracts component description from docs parameters', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_DOCS_PARAMS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories).toBeDefined();
      expect(buttonStories?.metadata?.documentation).toContain(
        'A versatile button component for user interactions.'
      );
    });

    it('extracts story-level description from docs parameters', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_DOCS_PARAMS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      const primaryVariant = buttonStories?.variants.find(v => v.name === 'Primary');
      // Story description should be available in variant props
      expect(primaryVariant?.props?.description).toBe(
        'The primary variant is used for main actions.'
      );
    });
  });

  describe('loaders detection', () => {
    it('detects stories with loaders as tag', async () => {
      vol.fromJSON({
        '/project/src/UserProfile.stories.tsx': STORY_WITH_LOADERS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const userProfileStories = result.items.find(c => c.name === 'UserProfile');
      expect(userProfileStories).toBeDefined();
      expect(userProfileStories?.metadata?.tags).toContain('has-loaders');
    });
  });

  describe('beforeEach detection', () => {
    it('detects stories with beforeEach as tag', async () => {
      vol.fromJSON({
        '/project/src/Form.stories.tsx': STORY_WITH_BEFORE_EACH,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const formStories = result.items.find(c => c.name === 'Form');
      expect(formStories).toBeDefined();
      expect(formStories?.metadata?.tags).toContain('has-beforeEach');
    });

    it('detects story-level beforeEach', async () => {
      vol.fromJSON({
        '/project/src/Form.stories.tsx': STORY_WITH_BEFORE_EACH,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const formStories = result.items.find(c => c.name === 'Form');
      const prefilledVariant = formStories?.variants.find(v => v.name === 'Prefilled');
      expect(prefilledVariant?.props?.hasBeforeEach).toBe(true);
    });
  });

  describe('index.json v5 parsing', () => {
    it('extracts componentPath from v5 entries', async () => {
      vol.fromJSON({
        '/storybook-static/index.json': STORYBOOK_INDEX_JSON_V5,
      });

      const scanner = new StorybookScanner({
        projectRoot: '/project',
        staticDir: '/storybook-static',
      });

      const result = await scanner.scan();

      const buttonComponent = result.items.find(c => c.name === 'Button');
      expect(buttonComponent).toBeDefined();
      // v5 includes componentPath which should be extracted
      expect(buttonComponent?.metadata?.tags).toContain(
        'storybook-componentPath:./src/components/Button.tsx'
      );
    });
  });

  describe('CSF1 arrow function story detection', () => {
    it('detects arrow function stories as variants', async () => {
      vol.fromJSON({
        '/project/src/Alert.stories.tsx': CSF1_ARROW_FUNCTION_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      const alertStories = result.items.find(c => c.name === 'Alert');
      expect(alertStories).toBeDefined();
      // Arrow function stories should be detected as variants
      expect(alertStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Success' })
      );
      expect(alertStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Warning' })
      );
      expect(alertStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Error' })
      );
    });
  });

  describe('storyName override detection', () => {
    it('extracts storyName overrides from CSF2 patterns', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_STORYNAME,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories).toBeDefined();
      // Should use the storyName override as the variant name
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Default' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Interactive' })
      );
    });

    it('detects play function assigned after declaration', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_STORYNAME,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      const interactiveVariant = buttonStories?.variants.find(v => v.name === 'Interactive');
      expect(interactiveVariant?.props?.hasPlayFunction).toBe(true);
    });
  });

  describe('re-export story detection', () => {
    it('detects re-exported stories as variants', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_REEXPORTS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories).toBeDefined();
      // Re-exported stories should be detected as variants
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Basic' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Icon' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Loading' })
      );
    });
  });

  describe('mixed CSF patterns detection', () => {
    it('detects all story types in mixed pattern files', async () => {
      vol.fromJSON({
        '/project/src/Input.stories.tsx': STORY_WITH_MIXED_PATTERNS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const inputStories = result.items.find(c => c.name === 'Input');
      expect(inputStories).toBeDefined();
      // Should detect all three types: CSF3 object, CSF2 bind, and CSF1 arrow
      expect(inputStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Default' })
      );
      expect(inputStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'WithLabel' })
      );
      expect(inputStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Disabled' })
      );
    });
  });

  describe('globals access detection', () => {
    it('detects stories with globals access', async () => {
      vol.fromJSON({
        '/project/src/LocaleDisplay.stories.tsx': STORY_WITH_GLOBALS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const localeStories = result.items.find(c => c.name === 'LocaleDisplay');
      expect(localeStories).toBeDefined();
      // Stories accessing globals should be detected
      expect(localeStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Locale Aware' })
      );
      expect(localeStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'WithTheme' })
      );
    });
  });

  describe('CSF4 story format detection', () => {
    it('detects CSF4 stories with preview.meta().story() pattern', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF4_PREVIEW_STORY,
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

    it('extracts CSF4 title from meta', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF4_PREVIEW_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories?.metadata?.tags).toContain('storybook-title:Example/CSF4/Button');
    });

    it('extracts CSF4 story variants from meta.story() calls', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF4_PREVIEW_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories?.variants).toHaveLength(4);
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Primary' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Secondary' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'WithRender' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'WithPlay' })
      );
    });

    it('detects CSF4 stories with render functions', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF4_PREVIEW_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      const withRenderVariant = buttonStories?.variants.find(v => v.name === 'WithRender');
      expect(withRenderVariant?.props?.hasRenderFunction).toBe(true);
    });

    it('detects CSF4 stories with play functions', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF4_PREVIEW_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      const withPlayVariant = buttonStories?.variants.find(v => v.name === 'WithPlay');
      expect(withPlayVariant?.props?.hasPlayFunction).toBe(true);
    });

    it('infers CSF4 title from file path when no title specified', async () => {
      vol.fromJSON({
        '/project/src/components/Input.stories.tsx': CSF4_AUTO_TITLE,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThan(0);
      const inputStories = result.items.find(c => c.name === 'Input');
      expect(inputStories).toBeDefined();
      // Should infer title from file path
      expect(inputStories?.metadata?.tags).toContain('storybook-title:components/Input');
    });

    it('extracts CSF4 argTypes as props', async () => {
      vol.fromJSON({
        '/project/src/components/Input.stories.tsx': CSF4_AUTO_TITLE,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const inputStories = result.items.find(c => c.name === 'Input');
      expect(inputStories?.props).toContainEqual(
        expect.objectContaining({ name: 'size' })
      );
    });

    it('detects CSF4 with definePreview import from storybook package', async () => {
      vol.fromJSON({
        '/project/src/Card.stories.tsx': CSF4_STORYBOOK_IMPORT,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThan(0);
      const cardStories = result.items.find(c => c.name === 'Card');
      expect(cardStories).toBeDefined();
      expect(cardStories?.metadata?.tags).toContain('storybook-title:Components/Card');
      expect(cardStories?.metadata?.tags).toContain('autodocs');
    });
  });

  describe('inline component detection', () => {
    it('extracts component name from title when component is inline arrow function', async () => {
      vol.fromJSON({
        '/project/src/UnhandledErrors.stories.tsx': STORY_WITH_INLINE_COMPONENT,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      expect(result.items.length).toBeGreaterThan(0);

      // Should use title-derived name, NOT the inline function body
      const stories = result.items.find(c => c.name === 'InlineComponent');
      expect(stories).toBeDefined();
      // Should NOT have the function body as the name
      expect(stories?.name).not.toContain('errorType');
      expect(stories?.name).not.toContain('forceFailure');
      expect(stories?.name).not.toContain('=>');
    });

    it('extracts component name from inline function expression name', async () => {
      vol.fromJSON({
        '/project/src/FunctionComponent.stories.tsx': STORY_WITH_INLINE_FUNCTION_COMPONENT,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      expect(result.items.length).toBeGreaterThan(0);

      // Should extract name from the named function expression (MyRenderer)
      const stories = result.items.find(c => c.name === 'MyRenderer');
      expect(stories).toBeDefined();
      // Should NOT have the function body as the name
      expect(stories?.name).not.toContain('return');
      expect(stories?.name).not.toContain('<div>');
      // The title should be extracted properly
      expect(stories?.metadata?.tags).toContain('storybook-title:Example/FunctionComponent');
    });

    it('extracts variants from inline component stories', async () => {
      vol.fromJSON({
        '/project/src/UnhandledErrors.stories.tsx': STORY_WITH_INLINE_COMPONENT,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const stories = result.items.find(c => c.name === 'InlineComponent');
      expect(stories?.variants).toHaveLength(2);
      expect(stories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Default' })
      );
      expect(stories?.variants).toContainEqual(
        expect.objectContaining({ name: 'WithError' })
      );
    });
  });

  describe('CSF4 imported preview pattern detection', () => {
    it('detects CSF4 with imported preview object calling .meta()', async () => {
      vol.fromJSON({
        '/project/src/A11YPanel.stories.tsx': CSF4_IMPORTED_PREVIEW,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      expect(result.items.length).toBeGreaterThan(0);

      const panelStories = result.items.find(c => c.name === 'A11YPanel');
      expect(panelStories).toBeDefined();
      expect(panelStories?.source.type).toBe('storybook');
    });

    it('extracts title from imported preview pattern', async () => {
      vol.fromJSON({
        '/project/src/A11YPanel.stories.tsx': CSF4_IMPORTED_PREVIEW,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const panelStories = result.items.find(c => c.name === 'A11YPanel');
      expect(panelStories?.metadata?.tags).toContain('storybook-title:Panel');
    });

    it('extracts story variants from imported preview pattern', async () => {
      vol.fromJSON({
        '/project/src/A11YPanel.stories.tsx': CSF4_IMPORTED_PREVIEW,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const panelStories = result.items.find(c => c.name === 'A11YPanel');
      expect(panelStories?.variants).toHaveLength(3);
      expect(panelStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Initializing' })
      );
      expect(panelStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Running' })
      );
      expect(panelStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'ReadyWithResults' })
      );
    });

    it('detects render function in imported preview pattern stories', async () => {
      vol.fromJSON({
        '/project/src/A11YPanel.stories.tsx': CSF4_IMPORTED_PREVIEW,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const panelStories = result.items.find(c => c.name === 'A11YPanel');
      const initializingVariant = panelStories?.variants.find(v => v.name === 'Initializing');
      expect(initializingVariant?.props?.hasRenderFunction).toBe(true);
    });

    it('detects play function in imported preview pattern stories', async () => {
      vol.fromJSON({
        '/project/src/A11YPanel.stories.tsx': CSF4_IMPORTED_PREVIEW,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const panelStories = result.items.find(c => c.name === 'A11YPanel');
      const readyVariant = panelStories?.variants.find(v => v.name === 'ReadyWithResults');
      expect(readyVariant?.props?.hasPlayFunction).toBe(true);
    });

    it('extracts argTypes from imported preview pattern', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF4_IMPORTED_PREVIEW_WITH_ARGTYPES,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories).toBeDefined();
      expect(buttonStories?.props).toContainEqual(
        expect.objectContaining({ name: 'variant' })
      );
      expect(buttonStories?.props).toContainEqual(
        expect.objectContaining({ name: 'size' })
      );
    });

    it('extracts tags from imported preview pattern', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF4_IMPORTED_PREVIEW_WITH_ARGTYPES,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories?.metadata?.tags).toContain('autodocs');
      expect(buttonStories?.metadata?.tags).toContain('chromatic');
    });

    it('detects decorators in imported preview pattern', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF4_IMPORTED_PREVIEW_WITH_ARGTYPES,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories?.metadata?.tags).toContain('has-decorators');
    });
  });

  describe('args validation', () => {
    const STORY_WITH_VALID_ARGS = `
import { Button } from './Button';
import type { Meta, StoryObj } from '@storybook/react';

const meta = {
  title: 'Components/Button',
  component: Button,
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'danger'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
    label: { control: 'text' },
    count: { control: 'number' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: 'primary',
    size: 'md',
    disabled: false,
    label: 'Click me',
    count: 5,
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    size: 'lg',
    disabled: true,
    label: 'Submit',
    count: 10,
  },
};
`;

    const STORY_WITH_TYPE_MISMATCH = `
import { Button } from './Button';
import type { Meta, StoryObj } from '@storybook/react';

const meta = {
  title: 'Components/Button',
  component: Button,
  argTypes: {
    count: { control: 'number' },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Invalid: Story = {
  args: {
    count: 'not-a-number',
    disabled: 'yes',
  },
};
`;

    const STORY_WITH_INVALID_OPTIONS = `
import { Button } from './Button';
import type { Meta, StoryObj } from '@storybook/react';

const meta = {
  title: 'Components/Button',
  component: Button,
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'danger'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BadVariant: Story = {
  args: {
    variant: 'invalid-variant',
  },
};
`;

    const STORY_WITH_UNKNOWN_PROPS = `
import { Button } from './Button';
import type { Meta, StoryObj } from '@storybook/react';

const meta = {
  title: 'Components/Button',
  component: Button,
  argTypes: {
    label: { control: 'text' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExtraProps: Story = {
  args: {
    label: 'Hello',
    unknownProp: 'value',
    anotherUnknown: true,
  },
};
`;

    const STORY_WITH_REQUIRED_PROPS = `
import { Button } from './Button';
import type { Meta, StoryObj } from '@storybook/react';

const meta = {
  title: 'Components/Button',
  component: Button,
  argTypes: {
    label: { control: 'text', type: { name: 'string', required: true } },
    onClick: { type: { name: 'function', required: true } },
    optional: { control: 'text' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MissingRequired: Story = {
  args: {
    optional: 'some value',
  },
};
`;

    it('validates args when validateArgs is enabled', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_VALID_ARGS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
        validateArgs: true,
      });

      const result = await scanner.scan();

      expect(result.argsValidation).toBeDefined();
      expect(result.argsValidation!.length).toBe(1);
      expect(result.argsValidation![0]!.isValid).toBe(true);
      expect(result.argsValidation![0]!.issues).toHaveLength(0);
      expect(result.argsValidation![0]!.argsValidated).toBe(10); // 5 args per story * 2 stories
    });

    it('does not validate args when validateArgs is false', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_VALID_ARGS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
        validateArgs: false,
      });

      const result = await scanner.scan();

      expect(result.argsValidation).toBeUndefined();
    });

    it('detects type mismatches in args', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_TYPE_MISMATCH,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
        validateArgs: true,
      });

      const result = await scanner.scan();

      expect(result.argsValidation).toBeDefined();
      const validation = result.argsValidation![0]!;
      expect(validation.isValid).toBe(false);

      const typeMismatchIssues = validation.issues.filter(i => i.issueType === 'type-mismatch');
      expect(typeMismatchIssues.length).toBeGreaterThan(0);

      // Check count type mismatch
      const countIssue = typeMismatchIssues.find(i => i.propName === 'count');
      expect(countIssue).toBeDefined();
      expect(countIssue!.expectedType).toBe('number');
      expect(countIssue!.actualType).toBe('string');

      // Check disabled type mismatch
      const disabledIssue = typeMismatchIssues.find(i => i.propName === 'disabled');
      expect(disabledIssue).toBeDefined();
      expect(disabledIssue!.expectedType).toBe('boolean');
      expect(disabledIssue!.actualType).toBe('string');
    });

    it('detects invalid option values', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_INVALID_OPTIONS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
        validateArgs: true,
      });

      const result = await scanner.scan();

      expect(result.argsValidation).toBeDefined();
      const validation = result.argsValidation![0]!;
      expect(validation.isValid).toBe(false);

      const optionIssues = validation.issues.filter(i => i.issueType === 'invalid-option');
      expect(optionIssues.length).toBe(1);
      expect(optionIssues[0]!.propName).toBe('variant');
      expect(optionIssues[0]!.message).toContain('invalid-variant');
      expect(optionIssues[0]!.message).toContain('primary');
    });

    it('detects unknown props', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_UNKNOWN_PROPS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
        validateArgs: true,
      });

      const result = await scanner.scan();

      expect(result.argsValidation).toBeDefined();
      const validation = result.argsValidation![0]!;
      expect(validation.isValid).toBe(false);

      const unknownPropIssues = validation.issues.filter(i => i.issueType === 'unknown-prop');
      expect(unknownPropIssues.length).toBe(2);

      const unknownNames = unknownPropIssues.map(i => i.propName);
      expect(unknownNames).toContain('unknownProp');
      expect(unknownNames).toContain('anotherUnknown');
    });

    it('detects missing required props', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_REQUIRED_PROPS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
        validateArgs: true,
      });

      const result = await scanner.scan();

      expect(result.argsValidation).toBeDefined();
      const validation = result.argsValidation![0]!;
      expect(validation.isValid).toBe(false);

      const missingRequiredIssues = validation.issues.filter(i => i.issueType === 'missing-required');
      expect(missingRequiredIssues.length).toBe(2);

      const missingNames = missingRequiredIssues.map(i => i.propName);
      expect(missingNames).toContain('label');
      expect(missingNames).toContain('onClick');
    });

    it('provides component and file info in validation result', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_VALID_ARGS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
        validateArgs: true,
      });

      const result = await scanner.scan();

      expect(result.argsValidation).toBeDefined();
      const validation = result.argsValidation![0]!;
      expect(validation.componentName).toBe('Button');
      expect(validation.file).toBe('src/Button.stories.tsx');
    });
  });
});
