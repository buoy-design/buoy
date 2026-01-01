// packages/scanners/src/git/angular-scanner.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';
import {
  SIMPLE_BUTTON_ANGULAR,
  CARD_WITH_INPUTS_ANGULAR,
  DEPRECATED_COMPONENT_ANGULAR,
  SIGNAL_INPUTS_ANGULAR,
  MULTIPLE_COMPONENTS_ANGULAR,
  NON_STANDARD_NAMING_ANGULAR,
  INPUT_WITH_TRANSFORM_ANGULAR,
  INPUT_WITH_ALIAS_ANGULAR,
  GETTER_SETTER_INPUT_ANGULAR,
  ANGULAR_17_SIGNALS,
  DEPRECATED_PROP_ANGULAR,
} from '../__tests__/fixtures/angular-components.js';
import { AngularComponentScanner } from './angular-scanner.js';

// Mock synchronous fs for Angular scanner (it uses readFileSync)
vi.mock('fs', async () => {
  const memfs = await import('memfs');
  return {
    ...memfs.fs,
    default: memfs.fs,
  };
});

describe('AngularComponentScanner', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('component detection', () => {
    it('detects Angular components with @Component decorator', async () => {
      vol.fromJSON({
        '/project/src/button.component.ts': SIMPLE_BUTTON_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('ButtonComponent');
      expect(result.items[0]!.source.type).toBe('angular');
    });

    it('detects multiple components in single file', async () => {
      vol.fromJSON({
        '/project/src/layout.component.ts': MULTIPLE_COMPONENTS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
      const names = result.items.map(c => c.name);
      expect(names).toContain('HeaderComponent');
      expect(names).toContain('FooterComponent');
    });

    it('detects multiple components across files', async () => {
      vol.fromJSON({
        '/project/src/button.component.ts': SIMPLE_BUTTON_ANGULAR,
        '/project/src/card.component.ts': CARD_WITH_INPUTS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
      const names = result.items.map(c => c.name);
      expect(names).toContain('ButtonComponent');
      expect(names).toContain('CardComponent');
    });
  });

  describe('props extraction', () => {
    it('extracts @Input decorators as props', async () => {
      vol.fromJSON({
        '/project/src/card.component.ts': CARD_WITH_INPUTS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      // Should have at least title, subtitle, isActive
      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(3);

      const titleProp = result.items[0]!.props.find(p => p.name === 'title');
      expect(titleProp).toBeDefined();
      expect(titleProp!.type).toBe('string');

      const subtitleProp = result.items[0]!.props.find(p => p.name === 'subtitle');
      expect(subtitleProp).toBeDefined();

      const isActiveProp = result.items[0]!.props.find(p => p.name === 'isActive');
      expect(isActiveProp).toBeDefined();
      expect(isActiveProp!.type).toBe('boolean');
    });

    it('extracts @Output decorators as props', async () => {
      vol.fromJSON({
        '/project/src/button.component.ts': SIMPLE_BUTTON_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const clickedProp = result.items[0]!.props.find(p => p.name === 'clicked');
      expect(clickedProp).toBeDefined();
      expect(clickedProp!.type).toBe('EventEmitter');
    });

    it('extracts Angular 17+ signal inputs', async () => {
      vol.fromJSON({
        '/project/src/modern.component.ts': SIGNAL_INPUTS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const nameProp = result.items[0]!.props.find(p => p.name === 'name');
      expect(nameProp).toBeDefined();
      // Updated: Scanner now extracts generic type info from signals
      expect(nameProp!.type).toBe('Signal<string>');

      const ageProp = result.items[0]!.props.find(p => p.name === 'age');
      expect(ageProp).toBeDefined();
      expect(ageProp!.type).toBe('Signal<number>');
    });

    it('extracts Angular 17+ signal outputs', async () => {
      vol.fromJSON({
        '/project/src/modern.component.ts': SIGNAL_INPUTS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const selectedProp = result.items[0]!.props.find(p => p.name === 'selected');
      expect(selectedProp).toBeDefined();
      expect(selectedProp!.type).toBe('OutputSignal');
    });
  });

  describe('deprecation detection', () => {
    it('detects @deprecated JSDoc tag', async () => {
      vol.fromJSON({
        '/project/src/old-button.component.ts': DEPRECATED_COMPONENT_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(true);
    });

    it('non-deprecated components are not marked as deprecated', async () => {
      vol.fromJSON({
        '/project/src/button.component.ts': SIMPLE_BUTTON_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(false);
    });
  });

  describe('selector extraction', () => {
    it('extracts component selector from decorator', async () => {
      vol.fromJSON({
        '/project/src/button.component.ts': SIMPLE_BUTTON_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const source = result.items[0]!.source as { selector: string };
      expect(source.selector).toBe('app-button');
    });
  });

  describe('scan statistics', () => {
    it('returns correct scan statistics', async () => {
      vol.fromJSON({
        '/project/src/button.component.ts': SIMPLE_BUTTON_ANGULAR,
        '/project/src/card.component.ts': CARD_WITH_INPUTS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      expect(result.stats.filesScanned).toBe(2);
      expect(result.stats.itemsFound).toBe(2);
      expect(result.stats.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('non-standard file naming (like Angular Material)', () => {
    it('detects components in files not named *.component.ts', async () => {
      vol.fromJSON({
        '/project/src/material/tree/tree.ts': NON_STANDARD_NAMING_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
        exclude: ['**/*.spec.ts', '**/*.test.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('MatTree');
    });
  });

  describe('input transforms (Angular 16+)', () => {
    it('extracts inputs with booleanAttribute transform', async () => {
      vol.fromJSON({
        '/project/src/toggle.component.ts': INPUT_WITH_TRANSFORM_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const disabledProp = result.items[0]!.props.find(p => p.name === 'disabled');

      expect(disabledProp).toBeDefined();
      expect(disabledProp!.type).toBe('boolean');
    });

    it('extracts inputs with numberAttribute transform', async () => {
      vol.fromJSON({
        '/project/src/toggle.component.ts': INPUT_WITH_TRANSFORM_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const sizeProp = result.items[0]!.props.find(p => p.name === 'size');

      expect(sizeProp).toBeDefined();
      expect(sizeProp!.type).toBe('number');
    });

    it('detects required inputs with required: true option', async () => {
      vol.fromJSON({
        '/project/src/toggle.component.ts': INPUT_WITH_TRANSFORM_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const idProp = result.items[0]!.props.find(p => p.name === 'id');

      expect(idProp).toBeDefined();
      expect(idProp!.required).toBe(true);
    });
  });

  describe('input aliases', () => {
    it('extracts input alias name', async () => {
      vol.fromJSON({
        '/project/src/tab.component.ts': INPUT_WITH_ALIAS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const labelProp = result.items[0]!.props.find(p => p.name === 'textLabel');

      expect(labelProp).toBeDefined();
      // The alias should be captured in metadata or description
      expect(labelProp!.description).toContain('label');
    });

    it('extracts aria-* input aliases', async () => {
      vol.fromJSON({
        '/project/src/tab.component.ts': INPUT_WITH_ALIAS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const ariaLabelProp = result.items[0]!.props.find(p => p.name === 'ariaLabel');

      expect(ariaLabelProp).toBeDefined();
      expect(ariaLabelProp!.description).toContain('aria-label');
    });
  });

  describe('getter/setter inputs (Angular Material pattern)', () => {
    it('detects getter/setter style inputs', async () => {
      vol.fromJSON({
        '/project/src/tree.component.ts': GETTER_SETTER_INPUT_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const dataSourceProp = result.items[0]!.props.find(p => p.name === 'dataSource');

      expect(dataSourceProp).toBeDefined();
      expect(dataSourceProp!.type).toBe('any[]');
    });

    it('extracts type from getter return type', async () => {
      vol.fromJSON({
        '/project/src/tree.component.ts': GETTER_SETTER_INPUT_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const trackByProp = result.items[0]!.props.find(p => p.name === 'trackBy');

      expect(trackByProp).toBeDefined();
      expect(trackByProp!.type).toBe('any');
    });
  });

  describe('Angular 17+ signal features', () => {
    it('detects required signal inputs (input.required)', async () => {
      vol.fromJSON({
        '/project/src/advanced.component.ts': ANGULAR_17_SIGNALS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const nameProp = result.items[0]!.props.find(p => p.name === 'name');

      expect(nameProp).toBeDefined();
      expect(nameProp!.required).toBe(true);
      expect(nameProp!.type).toBe('Signal<string>');
    });

    it('detects optional signal inputs with default', async () => {
      vol.fromJSON({
        '/project/src/advanced.component.ts': ANGULAR_17_SIGNALS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const ageProp = result.items[0]!.props.find(p => p.name === 'age');

      expect(ageProp).toBeDefined();
      expect(ageProp!.required).toBe(false);
      expect(ageProp!.defaultValue).toBe('0');
    });

    it('detects model signals for two-way binding', async () => {
      vol.fromJSON({
        '/project/src/advanced.component.ts': ANGULAR_17_SIGNALS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const countProp = result.items[0]!.props.find(p => p.name === 'count');

      expect(countProp).toBeDefined();
      expect(countProp!.type).toBe('ModelSignal<number>');
    });

    it('detects required model signals', async () => {
      vol.fromJSON({
        '/project/src/advanced.component.ts': ANGULAR_17_SIGNALS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const selectedProp = result.items[0]!.props.find(p => p.name === 'selected');

      expect(selectedProp).toBeDefined();
      expect(selectedProp!.required).toBe(true);
      expect(selectedProp!.type).toBe('ModelSignal<boolean>');
    });
  });

  describe('deprecated property detection', () => {
    it('detects @deprecated JSDoc on input properties', async () => {
      vol.fromJSON({
        '/project/src/deprecated.component.ts': DEPRECATED_PROP_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const oldProp = result.items[0]!.props.find(p => p.name === 'oldProp');

      expect(oldProp).toBeDefined();
      expect(oldProp!.deprecated).toBe(true);
    });

    it('does not mark non-deprecated props as deprecated', async () => {
      vol.fromJSON({
        '/project/src/deprecated.component.ts': DEPRECATED_PROP_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const newProp = result.items[0]!.props.find(p => p.name === 'newProp');

      expect(newProp).toBeDefined();
      expect(newProp!.deprecated).toBeFalsy();
    });
  });
});
