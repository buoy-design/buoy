import { Scanner, ScanResult, ScannerConfig } from "../base/scanner.js";
import type { Component, PropDefinition } from "@buoy-design/core";
import { createComponentId } from "@buoy-design/core";
import * as ts from "typescript";
import { readFileSync } from "fs";
import { relative } from "path";

/** Extended PropDefinition with deprecated field for Angular scanner */
interface ExtendedPropDefinition extends PropDefinition {
  deprecated?: boolean;
}

export interface AngularScannerConfig extends ScannerConfig {
  designSystemPackage?: string;
}

interface AngularSource {
  type: "angular";
  path: string;
  exportName: string;
  selector: string;
  line: number;
}

export class AngularComponentScanner extends Scanner<
  Component,
  AngularScannerConfig
> {
  /** Default file patterns for Angular components */
  private static readonly DEFAULT_PATTERNS = ["**/*.component.ts"];

  async scan(): Promise<ScanResult<Component>> {
    return this.runScan(
      (file) => this.parseFile(file),
      AngularComponentScanner.DEFAULT_PATTERNS,
    );
  }

  getSourceType(): string {
    return "angular";
  }

  private async parseFile(filePath: string): Promise<Component[]> {
    const content = readFileSync(filePath, "utf-8");
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const components: Component[] = [];
    const relativePath = relative(this.config.projectRoot, filePath);

    const visit = (node: ts.Node) => {
      // Find classes with @Component decorator
      if (ts.isClassDeclaration(node) && node.name) {
        const componentDecorator = this.findComponentDecorator(node);
        if (componentDecorator) {
          const comp = this.extractComponent(
            node,
            componentDecorator,
            sourceFile,
            relativePath,
          );
          if (comp) components.push(comp);
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return components;
  }

  private findComponentDecorator(
    node: ts.ClassDeclaration,
  ): ts.Decorator | undefined {
    const modifiers = ts.getDecorators(node);
    if (!modifiers) return undefined;

    return modifiers.find((decorator) => {
      if (ts.isCallExpression(decorator.expression)) {
        const expr = decorator.expression.expression;
        return ts.isIdentifier(expr) && expr.text === "Component";
      }
      return false;
    });
  }

  private extractComponent(
    node: ts.ClassDeclaration,
    decorator: ts.Decorator,
    sourceFile: ts.SourceFile,
    relativePath: string,
  ): Component | null {
    if (!node.name) return null;

    const name = node.name.getText(sourceFile);
    const selector = this.extractSelector(decorator, sourceFile);
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
      1;

    const source: AngularSource = {
      type: "angular",
      path: relativePath,
      exportName: name,
      selector: selector || name.replace("Component", "").toLowerCase(),
      line,
    };

    const props = this.extractInputs(node, sourceFile);
    const outputs = this.extractOutputs(node, sourceFile);
    const modelSignals = this.extractModelSignals(node, sourceFile);

    return {
      id: createComponentId(source as any, name),
      name,
      source: source as any,
      props: [...props, ...outputs, ...modelSignals],
      variants: [],
      tokens: [],
      dependencies: [],
      metadata: {
        deprecated: this.hasDeprecatedDecorator(node),
        tags: [],
      },
      scannedAt: new Date(),
    };
  }

  private extractSelector(
    decorator: ts.Decorator,
    _sourceFile: ts.SourceFile,
  ): string | null {
    if (!ts.isCallExpression(decorator.expression)) return null;

    const args = decorator.expression.arguments;
    if (args.length === 0) return null;

    const config = args[0];
    if (!config || !ts.isObjectLiteralExpression(config)) return null;

    for (const prop of config.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        if (
          prop.name.text === "selector" &&
          ts.isStringLiteral(prop.initializer)
        ) {
          return prop.initializer.text;
        }
      }
    }

    return null;
  }

  /**
   * Extract input decorator options like alias, transform, required
   */
  private extractInputDecoratorOptions(
    decorator: ts.Decorator,
    sourceFile: ts.SourceFile,
  ): {
    alias?: string;
    required?: boolean;
    transform?: string;
  } {
    if (!ts.isCallExpression(decorator.expression)) {
      return {};
    }

    const args = decorator.expression.arguments;
    if (args.length === 0) return {};

    const firstArg = args[0];

    // @Input('alias') - string argument
    if (firstArg && ts.isStringLiteral(firstArg)) {
      return { alias: firstArg.text };
    }

    // @Input({ transform: booleanAttribute, required: true }) - object argument
    if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
      const result: { alias?: string; required?: boolean; transform?: string } =
        {};

      for (const prop of firstArg.properties) {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          const propName = prop.name.text;

          if (propName === "alias" && ts.isStringLiteral(prop.initializer)) {
            result.alias = prop.initializer.text;
          } else if (propName === "required") {
            result.required =
              prop.initializer.kind === ts.SyntaxKind.TrueKeyword;
          } else if (propName === "transform" && ts.isIdentifier(prop.initializer)) {
            result.transform = prop.initializer.getText(sourceFile);
          }
        }
      }

      return result;
    }

    return {};
  }

  /**
   * Check if a property member has @deprecated JSDoc tag
   */
  private hasDeprecatedJSDoc(node: ts.Node): boolean {
    const jsDocs = ts.getJSDocTags(node);
    return jsDocs.some((tag) => tag.tagName.text === "deprecated");
  }

  private extractInputs(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
  ): ExtendedPropDefinition[] {
    const inputs: ExtendedPropDefinition[] = [];

    for (const member of node.members) {
      // Handle property declarations with @Input decorator
      if (ts.isPropertyDeclaration(member)) {
        if (!member.name || !ts.isIdentifier(member.name)) continue;

        const decorators = ts.getDecorators(member);
        if (!decorators) continue;

        const inputDecorator = decorators.find((d) => {
          if (ts.isCallExpression(d.expression)) {
            const expr = d.expression.expression;
            return ts.isIdentifier(expr) && expr.text === "Input";
          }
          if (ts.isIdentifier(d.expression)) {
            return d.expression.text === "Input";
          }
          return false;
        });

        if (inputDecorator) {
          const propName = member.name.getText(sourceFile);
          const options = this.extractInputDecoratorOptions(
            inputDecorator,
            sourceFile,
          );
          const hasDefault = !!member.initializer;
          const isDeprecated = this.hasDeprecatedJSDoc(member);

          // Determine type - use transform type if available
          let propType = member.type
            ? member.type.getText(sourceFile)
            : "unknown";

          if (options.transform === "booleanAttribute") {
            propType = "boolean";
          } else if (options.transform === "numberAttribute") {
            propType = "number";
          }

          const prop: ExtendedPropDefinition = {
            name: propName,
            type: propType,
            required:
              options.required ?? (!hasDefault && !member.questionToken),
            defaultValue: member.initializer?.getText(sourceFile),
          };

          // Add alias info to description if present
          if (options.alias) {
            prop.description = `Alias: ${options.alias}`;
          }

          // Mark deprecated props
          if (isDeprecated) {
            prop.deprecated = true;
          }

          inputs.push(prop);
        }
      }

      // Handle getter/setter inputs (Angular Material pattern)
      if (ts.isGetAccessor(member)) {
        if (!member.name || !ts.isIdentifier(member.name)) continue;

        const decorators = ts.getDecorators(member);
        if (!decorators) continue;

        const inputDecorator = decorators.find((d) => {
          if (ts.isCallExpression(d.expression)) {
            const expr = d.expression.expression;
            return ts.isIdentifier(expr) && expr.text === "Input";
          }
          if (ts.isIdentifier(d.expression)) {
            return d.expression.text === "Input";
          }
          return false;
        });

        if (inputDecorator) {
          const propName = member.name.getText(sourceFile);
          const options = this.extractInputDecoratorOptions(
            inputDecorator,
            sourceFile,
          );

          // Get type from getter return type
          const propType = member.type
            ? member.type.getText(sourceFile)
            : "unknown";

          const prop: ExtendedPropDefinition = {
            name: propName,
            type: propType,
            required: options.required ?? false,
          };

          if (options.alias) {
            prop.description = `Alias: ${options.alias}`;
          }

          if (this.hasDeprecatedJSDoc(member)) {
            prop.deprecated = true;
          }

          inputs.push(prop);
        }
      }
    }

    // Check for input() signal syntax (Angular 17+)
    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      if (member.initializer && ts.isCallExpression(member.initializer)) {
        const callExpr = member.initializer.expression;

        // input<T>() or input.required<T>()
        if (ts.isIdentifier(callExpr) && callExpr.text === "input") {
          const propName = member.name.getText(sourceFile);
          const typeArgs = member.initializer.typeArguments;
          const firstTypeArg = typeArgs?.[0];
          const signalType = firstTypeArg
            ? `Signal<${firstTypeArg.getText(sourceFile)}>`
            : "Signal";

          // Check for default value
          const args = member.initializer.arguments;
          const hasDefault = args.length > 0;
          const defaultArg = args[0];

          inputs.push({
            name: propName,
            type: signalType,
            required: false,
            defaultValue:
              hasDefault && defaultArg
                ? defaultArg.getText(sourceFile)
                : undefined,
          });
        }

        // input.required<T>()
        if (
          ts.isPropertyAccessExpression(callExpr) &&
          ts.isIdentifier(callExpr.expression) &&
          callExpr.expression.text === "input" &&
          callExpr.name.text === "required"
        ) {
          const propName = member.name.getText(sourceFile);
          const typeArgs = member.initializer.typeArguments;
          const firstTypeArg = typeArgs?.[0];
          const signalType = firstTypeArg
            ? `Signal<${firstTypeArg.getText(sourceFile)}>`
            : "Signal";

          inputs.push({
            name: propName,
            type: signalType,
            required: true,
          });
        }
      }
    }

    return inputs;
  }

  private extractOutputs(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
  ): PropDefinition[] {
    const outputs: PropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      const hasOutput = decorators.some((d) => {
        if (ts.isCallExpression(d.expression)) {
          const expr = d.expression.expression;
          return ts.isIdentifier(expr) && expr.text === "Output";
        }
        if (ts.isIdentifier(d.expression)) {
          return d.expression.text === "Output";
        }
        return false;
      });

      if (hasOutput) {
        const propName = member.name.getText(sourceFile);

        outputs.push({
          name: propName,
          type: "EventEmitter",
          required: false,
          description: "Output event",
        });
      }
    }

    // Check for output() signal syntax (Angular 17+)
    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      if (member.initializer && ts.isCallExpression(member.initializer)) {
        const callExpr = member.initializer.expression;
        if (ts.isIdentifier(callExpr) && callExpr.text === "output") {
          const propName = member.name.getText(sourceFile);
          outputs.push({
            name: propName,
            type: "OutputSignal",
            required: false,
          });
        }
      }
    }

    return outputs;
  }

  /**
   * Extract model() signals for two-way binding (Angular 17+)
   */
  private extractModelSignals(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
  ): PropDefinition[] {
    const models: PropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      if (member.initializer && ts.isCallExpression(member.initializer)) {
        const callExpr = member.initializer.expression;

        // model<T>() - optional model with default
        if (ts.isIdentifier(callExpr) && callExpr.text === "model") {
          const propName = member.name.getText(sourceFile);
          const typeArgs = member.initializer.typeArguments;
          const firstTypeArg = typeArgs?.[0];
          const signalType = firstTypeArg
            ? `ModelSignal<${firstTypeArg.getText(sourceFile)}>`
            : "ModelSignal";

          const args = member.initializer.arguments;
          const hasDefault = args.length > 0;
          const defaultArg = args[0];

          models.push({
            name: propName,
            type: signalType,
            required: false,
            defaultValue:
              hasDefault && defaultArg
                ? defaultArg.getText(sourceFile)
                : undefined,
          });
        }

        // model.required<T>() - required model
        if (
          ts.isPropertyAccessExpression(callExpr) &&
          ts.isIdentifier(callExpr.expression) &&
          callExpr.expression.text === "model" &&
          callExpr.name.text === "required"
        ) {
          const propName = member.name.getText(sourceFile);
          const typeArgs = member.initializer.typeArguments;
          const firstTypeArg = typeArgs?.[0];
          const signalType = firstTypeArg
            ? `ModelSignal<${firstTypeArg.getText(sourceFile)}>`
            : "ModelSignal";

          models.push({
            name: propName,
            type: signalType,
            required: true,
          });
        }
      }
    }

    return models;
  }

  private hasDeprecatedDecorator(node: ts.ClassDeclaration): boolean {
    const jsDocs = ts.getJSDocTags(node);
    return jsDocs.some((tag) => tag.tagName.text === "deprecated");
  }
}
