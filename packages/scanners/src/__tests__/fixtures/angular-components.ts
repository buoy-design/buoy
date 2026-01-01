export const SIMPLE_BUTTON_ANGULAR = `
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-button',
  template: '<button (click)="handleClick()">{{label}}</button>',
  styles: ['button { color: #0066cc; }']
})
export class ButtonComponent {
  @Input() label: string = '';
  @Output() clicked = new EventEmitter<void>();

  handleClick() {
    this.clicked.emit();
  }
}
`;

export const CARD_WITH_INPUTS_ANGULAR = `
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-card',
  template: '<div class="card"><h2>{{title}}</h2><p>{{subtitle}}</p></div>'
})
export class CardComponent {
  @Input() title: string = '';
  @Input() subtitle?: string;
  @Input() isActive: boolean = false;
}
`;

export const DEPRECATED_COMPONENT_ANGULAR = `
import { Component, Input } from '@angular/core';

/**
 * @deprecated Use NewButtonComponent instead
 */
@Component({
  selector: 'app-old-button',
  template: '<button>{{label}}</button>'
})
export class OldButtonComponent {
  @Input() label: string = '';
}
`;

export const SIGNAL_INPUTS_ANGULAR = `
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-modern',
  template: '<div>{{name()}}</div>'
})
export class ModernComponent {
  name = input<string>();
  age = input<number>();
  selected = output<void>();
}
`;

export const MULTIPLE_COMPONENTS_ANGULAR = `
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-header',
  template: '<header>{{title}}</header>'
})
export class HeaderComponent {
  @Input() title: string = '';
}

@Component({
  selector: 'app-footer',
  template: '<footer>{{copyright}}</footer>'
})
export class FooterComponent {
  @Input() copyright: string = '';
}
`;

// Angular component NOT using *.component.ts naming (like Angular Material)
export const NON_STANDARD_NAMING_ANGULAR = `
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'mat-tree',
  template: '<div class="tree">{{label}}</div>'
})
export class MatTree {
  @Input() label: string = '';
  @Output() nodeSelect = new EventEmitter<any>();
}
`;

// Input with transform (Angular 16+)
export const INPUT_WITH_TRANSFORM_ANGULAR = `
import { Component, Input, booleanAttribute, numberAttribute } from '@angular/core';

@Component({
  selector: 'app-toggle',
  template: '<div>{{disabled}}</div>'
})
export class ToggleComponent {
  @Input({ transform: booleanAttribute }) disabled: boolean = false;
  @Input({ transform: numberAttribute }) size: number = 16;
  @Input({ required: true }) id!: string;
}
`;

// Input with alias
export const INPUT_WITH_ALIAS_ANGULAR = `
import { Component, Input } from '@angular/core';

@Component({
  selector: 'mat-tab',
  template: '<div>{{textLabel}}</div>'
})
export class MatTab {
  @Input('label') textLabel: string = '';
  @Input('aria-label') ariaLabel!: string;
  @Input('aria-labelledby') ariaLabelledBy!: string;
}
`;

// Getter/setter inputs (Angular Material pattern)
export const GETTER_SETTER_INPUT_ANGULAR = `
import { Component, Input } from '@angular/core';

@Component({
  selector: 'cdk-tree',
  template: '<div>{{_dataSource}}</div>'
})
export class CdkTree {
  @Input()
  get dataSource(): any[] {
    return this._dataSource;
  }
  set dataSource(value: any[]) {
    this._dataSource = value;
  }
  private _dataSource: any[] = [];

  @Input()
  get trackBy(): any {
    return this._trackBy;
  }
  set trackBy(value: any) {
    this._trackBy = value;
  }
  private _trackBy: any;
}
`;

// Angular 17+ signal features: required inputs and model
export const ANGULAR_17_SIGNALS = `
import { Component, input, output, model } from '@angular/core';

@Component({
  selector: 'app-advanced',
  template: '<div>{{name()}}</div>'
})
export class AdvancedComponent {
  // Required signal input
  name = input.required<string>();

  // Optional signal input with default
  age = input<number>(0);

  // Two-way binding with model
  count = model<number>(0);

  // Required model
  selected = model.required<boolean>();

  // Signal output
  clicked = output<void>();
}
`;

// Deprecated input property
export const DEPRECATED_PROP_ANGULAR = `
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-deprecated-props',
  template: '<div>{{newProp}}</div>'
})
export class DeprecatedPropsComponent {
  /**
   * @deprecated Use newProp instead
   */
  @Input() oldProp: string = '';

  @Input() newProp: string = '';

  /**
   * @deprecated since v2.0.0, use styleClass instead
   */
  @Input() containerStyleClass: string = '';
}
`;
