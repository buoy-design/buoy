import { SignalAwareScanner, ScanResult, ScannerConfig } from "../base/index.js";
import type {
  Component,
  PropDefinition,
  HardcodedValue,
} from "@buoy-design/core";
import { createComponentId } from "@buoy-design/core";
import * as ts from "typescript";
import { readFile } from "fs/promises";
import { readFileSync, existsSync, statSync } from "fs";
import { relative, join, dirname, basename } from "path";
import { glob } from "glob";
import {
  createScannerSignalCollector,
  type ScannerSignalCollector,
} from "../signals/scanner-integration.js";
import { getHardcodedValueType } from "../patterns/index.js";

/**
 * Next.js-specific source type - extends the base source structure
 * We use 'react' as the type for compatibility with core types
 */
interface NextJSComponentMetadata {
  /** Whether this is a client component ('use client' directive) */
  isClientComponent: boolean;
  /** Whether this is a server component (default in App Router) */
  isServerComponent: boolean;
  /** App Router special file type */
  appRouterFileType?: "page" | "layout" | "loading" | "error" | "not-found" | "template" | "default" | "route";
  /** Route group this component belongs to (if any) */
  routeGroup?: string;
  /** Dynamic route segments */
  dynamicSegments?: string[];
}

/**
 * CSS Module analysis result
 */
interface CSSModuleAnalysis {
  /** Path to the CSS module file */
  path: string;
  /** Class names defined in the module */
  classNames: string[];
  /** Hardcoded values found */
  hardcodedValues: HardcodedValue[];
  /** CSS custom properties used */
  cssVariables: string[];
}

/**
 * Next.js Image component usage tracking
 */
interface NextImageUsage {
  file: string;
  line: number;
  /** Whether required props are present */
  hasAlt: boolean;
  hasWidth: boolean;
  hasHeight: boolean;
  hasFill: boolean;
  /** Style-related props that might have hardcoded values */
  styleIssues: HardcodedValue[];
}

export interface NextJSScannerConfig extends ScannerConfig {
  /** Whether to scan App Router structure (default: true) */
  appRouter?: boolean;
  /** Whether to scan CSS modules (default: true) */
  cssModules?: boolean;
  /** Whether to validate next/image usage (default: true) */
  validateImage?: boolean;
  /** Design system package name for detecting imports */
  designSystemPackage?: string;
}

export interface NextJSScanResult extends ScanResult<Component> {
  /** Server components found */
  serverComponents: Component[];
  /** Client components found */
  clientComponents: Component[];
  /** CSS module analysis results */
  cssModules: CSSModuleAnalysis[];
  /** Next Image usage analysis */
  imageUsage: NextImageUsage[];
  /** App Router routes detected */
  routes: AppRoute[];
  /** Route groups found */
  routeGroups: string[];
}

/**
 * Represents a Next.js App Router route
 */
interface AppRoute {
  /** Route path (e.g., /dashboard/[id]) */
  path: string;
  /** Page component file */
  pageFile?: string;
  /** Layout component file */
  layoutFile?: string;
  /** Loading component file */
  loadingFile?: string;
  /** Error component file */
  errorFile?: string;
  /** Whether this route has dynamic segments */
  isDynamic: boolean;
  /** Dynamic segment names */
  dynamicSegments: string[];
  /** Route group (if any) */
  routeGroup?: string;
}

// Color patterns for CSS scanning
const COLOR_PATTERNS = [
  /^#[0-9a-fA-F]{3,8}$/,
  /^rgb\s*\(/i,
  /^rgba\s*\(/i,
  /^hsl\s*\(/i,
  /^hsla\s*\(/i,
  /^oklch\s*\(/i,
];

// Spacing patterns for CSS scanning
const SPACING_PATTERNS = [
  /^\d+(\.\d+)?(px|rem|em|vh|vw|%)$/,
];

// App Router special file patterns
const APP_ROUTER_FILES: Record<string, RegExp> = {
  page: /^page\.(tsx?|jsx?)$/,
  layout: /^layout\.(tsx?|jsx?)$/,
  loading: /^loading\.(tsx?|jsx?)$/,
  error: /^error\.(tsx?|jsx?)$/,
  "not-found": /^not-found\.(tsx?|jsx?)$/,
  template: /^template\.(tsx?|jsx?)$/,
  default: /^default\.(tsx?|jsx?)$/,
  route: /^route\.(tsx?|jsx?)$/,
};

export class NextJSScanner extends SignalAwareScanner<Component, NextJSScannerConfig> {
  private static readonly DEFAULT_PATTERNS = ["**/*.tsx", "**/*.jsx", "**/*.ts", "**/*.js"];
  private static readonly CSS_MODULE_PATTERNS = ["**/*.module.css", "**/*.module.scss"];

  async scan(): Promise<NextJSScanResult> {
    this.clearSignals();

    const result: NextJSScanResult = {
      items: [],
      serverComponents: [],
      clientComponents: [],
      cssModules: [],
      imageUsage: [],
      routes: [],
      routeGroups: [],
      errors: [],
      stats: {
        filesScanned: 0,
        itemsFound: 0,
        duration: 0,
      },
    };

    const startTime = Date.now();

    // Detect App Router structure
    const appDir = join(this.config.projectRoot, "app");
    let hasAppRouter = false;
    try {
      hasAppRouter = existsSync(appDir) && statSync(appDir).isDirectory();
    } catch {
      // App directory not accessible
    }

    if (hasAppRouter && this.config.appRouter !== false) {
      // Scan App Router routes
      const routeResult = await this.scanAppRouter(appDir);
      result.routes = routeResult.routes;
      result.routeGroups = routeResult.routeGroups;
    }

    // Scan components
    let componentResult: ScanResult<Component>;
    if (this.config.cache) {
      componentResult = await this.runScanWithCache(
        (file) => this.parseFile(file),
        NextJSScanner.DEFAULT_PATTERNS,
      );
    } else {
      componentResult = await this.runScan(
        (file) => this.parseFile(file),
        NextJSScanner.DEFAULT_PATTERNS,
      );
    }

    result.items = componentResult.items;
    result.errors = componentResult.errors;
    result.stats = {
      ...componentResult.stats,
      duration: Date.now() - startTime,
    };

    // Categorize server vs client components based on tags
    for (const comp of result.items) {
      const tags = comp.metadata.tags || [];
      if (tags.includes("client-component")) {
        result.clientComponents.push(comp);
      } else if (tags.includes("server-component")) {
        result.serverComponents.push(comp);
      }
    }

    // Scan CSS modules
    if (this.config.cssModules !== false) {
      result.cssModules = await this.scanCSSModules();
    }

    // Scan next/image usage
    if (this.config.validateImage !== false) {
      result.imageUsage = await this.scanImageUsage();
    }

    return result;
  }

  getSourceType(): string {
    return "nextjs";
  }

  /**
   * Scan the App Router directory structure
   */
  private async scanAppRouter(appDir: string): Promise<{
    routes: AppRoute[];
    routeGroups: string[];
  }> {
    const routes: AppRoute[] = [];
    const routeGroups: Set<string> = new Set();

    const scanDirectory = async (dir: string, routePath: string, currentGroup?: string) => {
      const entries = await this.readDirectory(dir);

      // Check for route group (parentheses directory)
      const dirName = basename(dir);
      let groupName = currentGroup;
      if (dirName.startsWith("(") && dirName.endsWith(")")) {
        groupName = dirName.slice(1, -1);
        routeGroups.add(groupName);
      }

      // Detect dynamic segments
      const isDynamic = dirName.startsWith("[") && dirName.endsWith("]");
      let segmentName: string | undefined;
      if (isDynamic) {
        segmentName = dirName.slice(1, -1);
        // Handle catch-all routes [...slug] and optional catch-all [[...slug]]
        if (segmentName.startsWith("...")) {
          segmentName = segmentName.slice(3);
        } else if (segmentName.startsWith("[...")) {
          segmentName = segmentName.slice(4, -1);
        }
      }

      // Build route path (skip route group names in path)
      let currentRoutePath = routePath;
      if (!dirName.startsWith("(")) {
        if (isDynamic && segmentName) {
          currentRoutePath = routePath + `/[${segmentName}]`;
        } else if (dirName !== "app") {
          currentRoutePath = routePath + "/" + dirName;
        }
      }

      const route: AppRoute = {
        path: currentRoutePath || "/",
        isDynamic: isDynamic,
        dynamicSegments: [],
        routeGroup: groupName,
      };

      // Check for special App Router files
      for (const entry of entries) {
        const entryPath = join(dir, entry);

        // Gracefully handle files that don't exist or are inaccessible
        let stat;
        try {
          stat = statSync(entryPath);
        } catch {
          // Skip entries that can't be accessed (symlinks, permissions, etc.)
          continue;
        }

        if (stat.isFile()) {
          for (const [fileType, pattern] of Object.entries(APP_ROUTER_FILES)) {
            if (pattern.test(entry)) {
              const relativePath = relative(this.config.projectRoot, entryPath);
              switch (fileType) {
                case "page":
                  route.pageFile = relativePath;
                  break;
                case "layout":
                  route.layoutFile = relativePath;
                  break;
                case "loading":
                  route.loadingFile = relativePath;
                  break;
                case "error":
                  route.errorFile = relativePath;
                  break;
              }
            }
          }
        } else if (stat.isDirectory()) {
          await scanDirectory(entryPath, currentRoutePath, groupName);
        }
      }

      // Only add route if it has at least a page
      if (route.pageFile) {
        routes.push(route);
      }
    };

    await scanDirectory(appDir, "", undefined);

    return { routes, routeGroups: Array.from(routeGroups) };
  }

  /**
   * Read directory entries
   */
  private async readDirectory(dir: string): Promise<string[]> {
    try {
      const { readdir } = await import("fs/promises");
      return await readdir(dir);
    } catch {
      return [];
    }
  }

  /**
   * Parse a single file for components
   */
  private async parseFile(filePath: string): Promise<Component[]> {
    const content = await readFile(filePath, "utf-8");
    const relativePath = relative(this.config.projectRoot, filePath);

    // Determine if this is a client or server component
    const isClientComponent = this.hasUseClientDirective(content);
    const isInAppDir = relativePath.startsWith("app/") || relativePath.startsWith("app\\");
    const isServerComponent = isInAppDir && !isClientComponent;

    // Detect App Router file type
    const fileName = basename(filePath);
    let appRouterFileType: NextJSComponentMetadata["appRouterFileType"];
    for (const [fileType, pattern] of Object.entries(APP_ROUTER_FILES)) {
      if (pattern.test(fileName)) {
        appRouterFileType = fileType as NextJSComponentMetadata["appRouterFileType"];
        break;
      }
    }

    // Detect route group from path
    const routeGroup = this.extractRouteGroup(relativePath);

    // Detect dynamic segments from path
    const dynamicSegments = this.extractDynamicSegments(relativePath);

    // Parse TypeScript/JavaScript
    let scriptKind: ts.ScriptKind;
    if (filePath.endsWith(".tsx")) {
      scriptKind = ts.ScriptKind.TSX;
    } else if (filePath.endsWith(".jsx") || filePath.endsWith(".js")) {
      scriptKind = ts.ScriptKind.JSX;
    } else {
      scriptKind = ts.ScriptKind.TS;
    }

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );

    const components: Component[] = [];
    // Use 'react' as the signal collector type since Next.js is React-based
    const signalCollector = createScannerSignalCollector("react", relativePath);

    const visit = (node: ts.Node) => {
      // Function declarations
      if (ts.isFunctionDeclaration(node) && node.name) {
        if (this.isAtModuleScope(node) && this.isReactComponent(node, sourceFile)) {
          const comp = this.extractComponent(
            node,
            sourceFile,
            relativePath,
            isClientComponent,
            isServerComponent,
            appRouterFileType,
            routeGroup,
            dynamicSegments,
            signalCollector,
          );
          if (comp) components.push(comp);
        }
      }

      // Variable declarations (arrow functions, etc.)
      if (ts.isVariableStatement(node) && this.isAtModuleScope(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer) {
            if (this.isReactComponentExpression(decl.initializer, sourceFile)) {
              const comp = this.extractVariableComponent(
                decl,
                sourceFile,
                relativePath,
                isClientComponent,
                isServerComponent,
                appRouterFileType,
                routeGroup,
                dynamicSegments,
                signalCollector,
              );
              if (comp) components.push(comp);
            }
          }
        }
      }

      // Default exports (common in Next.js pages/layouts)
      if (ts.isExportAssignment(node) && !node.isExportEquals) {
        const expr = node.expression;
        if (ts.isIdentifier(expr)) {
          // export default ComponentName - already handled by function/variable declarations
        } else if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
          // export default () => {} or export default function() {}
          const comp = this.extractDefaultExportComponent(
            node,
            sourceFile,
            relativePath,
            isClientComponent,
            isServerComponent,
            appRouterFileType,
            routeGroup,
            dynamicSegments,
            signalCollector,
          );
          if (comp) components.push(comp);
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    // Add signals
    this.addSignals(relativePath, signalCollector.getEmitter());

    return components;
  }

  /**
   * Check if content has 'use client' directive
   */
  private hasUseClientDirective(content: string): boolean {
    // Check first few lines for 'use client'
    const lines = content.split("\n").slice(0, 10);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '"use client"' || trimmed === "'use client'" || trimmed === '"use client";' || trimmed === "'use client';") {
        return true;
      }
      // Stop checking if we hit actual code (not comments or empty lines)
      if (trimmed && !trimmed.startsWith("//") && !trimmed.startsWith("/*") && !trimmed.startsWith("*")) {
        if (!trimmed.includes("use client")) {
          break;
        }
      }
    }
    return false;
  }

  /**
   * Extract route group from file path
   */
  private extractRouteGroup(filePath: string): string | undefined {
    const match = filePath.match(/\(([^)]+)\)/);
    return match ? match[1] : undefined;
  }

  /**
   * Extract dynamic segments from file path
   */
  private extractDynamicSegments(filePath: string): string[] {
    const segments: string[] = [];
    const matches = filePath.matchAll(/\[([^\]]+)\]/g);
    for (const match of matches) {
      let segment = match[1];
      if (segment) {
        // Handle catch-all routes
        if (segment.startsWith("...")) {
          segment = segment.slice(3);
        }
        segments.push(segment);
      }
    }
    return segments;
  }

  /**
   * Check if node is at module scope
   */
  private isAtModuleScope(node: ts.Node): boolean {
    let current = node.parent;
    while (current) {
      if (
        ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isArrowFunction(current) ||
        ts.isMethodDeclaration(current)
      ) {
        return false;
      }
      if (ts.isSourceFile(current)) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * Check if a function declaration is a React component
   */
  private isReactComponent(node: ts.FunctionDeclaration, sourceFile: ts.SourceFile): boolean {
    if (!node.name) return false;
    const name = node.name.getText(sourceFile);
    if (!/^[A-Z]/.test(name)) return false;

    // Check for JSX
    if (this.returnsJsx(node)) return true;

    // Check return type
    if (node.type) {
      const returnType = node.type.getText(sourceFile);
      if (
        returnType.includes("ReactNode") ||
        returnType.includes("ReactElement") ||
        returnType.includes("JSX.Element")
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if an expression is a React component
   */
  private isReactComponentExpression(node: ts.Expression, sourceFile: ts.SourceFile): boolean {
    if (ts.isAsExpression(node)) {
      return this.isReactComponentExpression(node.expression, sourceFile);
    }

    if (ts.isParenthesizedExpression(node)) {
      return this.isReactComponentExpression(node.expression, sourceFile);
    }

    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      if (this.returnsJsx(node)) return true;
      if (node.type) {
        const returnType = node.type.getText(sourceFile);
        if (
          returnType.includes("ReactNode") ||
          returnType.includes("ReactElement") ||
          returnType.includes("JSX.Element")
        ) {
          return true;
        }
      }
      return false;
    }

    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);
      if (
        callText.includes("forwardRef") ||
        callText.includes("memo") ||
        callText === "lazy" ||
        callText === "React.lazy"
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a function returns JSX
   */
  private returnsJsx(node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression): boolean {
    let hasJsx = false;
    const checkNode = (n: ts.Node) => {
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
        hasJsx = true;
        return;
      }
      ts.forEachChild(n, checkNode);
    };
    if (node.body) {
      checkNode(node.body);
    }
    return hasJsx;
  }

  /**
   * Extract component from function declaration
   */
  private extractComponent(
    node: ts.FunctionDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: string,
    isClientComponent: boolean,
    isServerComponent: boolean,
    appRouterFileType: NextJSComponentMetadata["appRouterFileType"],
    routeGroup: string | undefined,
    _dynamicSegments: string[],
    signalCollector: ScannerSignalCollector,
  ): Component | null {
    if (!node.name) return null;

    const name = node.name.getText(sourceFile);
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const props = this.extractProps(node.parameters, sourceFile);
    const hardcodedValues = this.extractHardcodedValues(node, sourceFile, signalCollector);

    // Build tags
    const tags: string[] = [];
    if (isClientComponent) tags.push("client-component");
    if (isServerComponent) tags.push("server-component");
    if (appRouterFileType) tags.push(`app-router-${appRouterFileType}`);
    if (routeGroup) tags.push(`route-group-${routeGroup}`);

    signalCollector.collectComponentDef(name, line, {
      isClientComponent,
      isServerComponent,
      appRouterFileType,
    });

    // Use react source type for compatibility
    const source = {
      type: "react" as const,
      path: relativePath,
      exportName: name,
      line,
    };

    return {
      id: createComponentId(source, name),
      name,
      source,
      props,
      variants: [],
      tokens: [],
      dependencies: this.extractDependencies(node, sourceFile, signalCollector),
      metadata: {
        tags,
        hardcodedValues: hardcodedValues.length > 0 ? hardcodedValues : undefined,
      },
      scannedAt: new Date(),
    };
  }

  /**
   * Extract component from variable declaration
   */
  private extractVariableComponent(
    node: ts.VariableDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: string,
    isClientComponent: boolean,
    isServerComponent: boolean,
    appRouterFileType: NextJSComponentMetadata["appRouterFileType"],
    routeGroup: string | undefined,
    _dynamicSegments: string[],
    signalCollector: ScannerSignalCollector,
  ): Component | null {
    if (!ts.isIdentifier(node.name)) return null;

    const name = node.name.getText(sourceFile);
    if (!/^[A-Z]/.test(name)) return null;

    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const hardcodedValues = this.extractHardcodedValues(node, sourceFile, signalCollector);

    let props: PropDefinition[] = [];
    const init = node.initializer;
    if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
      props = this.extractProps(init.parameters, sourceFile);
    }

    const tags: string[] = [];
    if (isClientComponent) tags.push("client-component");
    if (isServerComponent) tags.push("server-component");
    if (appRouterFileType) tags.push(`app-router-${appRouterFileType}`);
    if (routeGroup) tags.push(`route-group-${routeGroup}`);

    signalCollector.collectComponentDef(name, line, {
      isClientComponent,
      isServerComponent,
      appRouterFileType,
    });

    const source = {
      type: "react" as const,
      path: relativePath,
      exportName: name,
      line,
    };

    return {
      id: createComponentId(source, name),
      name,
      source,
      props,
      variants: [],
      tokens: [],
      dependencies: [],
      metadata: {
        tags,
        hardcodedValues: hardcodedValues.length > 0 ? hardcodedValues : undefined,
      },
      scannedAt: new Date(),
    };
  }

  /**
   * Extract component from default export
   */
  private extractDefaultExportComponent(
    node: ts.ExportAssignment,
    sourceFile: ts.SourceFile,
    relativePath: string,
    isClientComponent: boolean,
    isServerComponent: boolean,
    appRouterFileType: NextJSComponentMetadata["appRouterFileType"],
    routeGroup: string | undefined,
    _dynamicSegments: string[],
    signalCollector: ScannerSignalCollector,
  ): Component | null {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    // Generate name from file path for default exports
    const fileName = basename(relativePath, ".tsx").replace(/\.jsx?$/, "");
    let name: string;
    if (appRouterFileType) {
      // Use the route segment + file type for App Router files
      const pathParts = dirname(relativePath).split("/").filter(p => p && p !== "app");
      const routeSegment = pathParts[pathParts.length - 1] || "Root";
      name = this.toPascalCase(routeSegment) + this.toPascalCase(appRouterFileType);
    } else {
      name = this.toPascalCase(fileName);
    }

    const expr = node.expression;
    let props: PropDefinition[] = [];
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
      props = this.extractProps(expr.parameters, sourceFile);
    }

    const hardcodedValues = this.extractHardcodedValues(node, sourceFile, signalCollector);

    const tags: string[] = ["default-export"];
    if (isClientComponent) tags.push("client-component");
    if (isServerComponent) tags.push("server-component");
    if (appRouterFileType) tags.push(`app-router-${appRouterFileType}`);
    if (routeGroup) tags.push(`route-group-${routeGroup}`);

    signalCollector.collectComponentDef(name, line, {
      isClientComponent,
      isServerComponent,
      appRouterFileType,
      isDefaultExport: true,
    });

    const source = {
      type: "react" as const,
      path: relativePath,
      exportName: "default",
      line,
    };

    return {
      id: createComponentId(source, name),
      name,
      source,
      props,
      variants: [],
      tokens: [],
      dependencies: [],
      metadata: {
        tags,
        hardcodedValues: hardcodedValues.length > 0 ? hardcodedValues : undefined,
      },
      scannedAt: new Date(),
    };
  }

  /**
   * Convert string to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, (_, c) => c.toUpperCase());
  }

  /**
   * Extract props from parameters
   */
  private extractProps(
    parameters: ts.NodeArray<ts.ParameterDeclaration>,
    sourceFile: ts.SourceFile,
  ): PropDefinition[] {
    const props: PropDefinition[] = [];
    const propsParam = parameters[0];
    if (!propsParam) return props;

    const typeNode = propsParam.type;
    if (typeNode && ts.isTypeLiteralNode(typeNode)) {
      for (const member of typeNode.members) {
        if (ts.isPropertySignature(member) && member.name) {
          props.push({
            name: member.name.getText(sourceFile),
            type: member.type ? member.type.getText(sourceFile) : "unknown",
            required: !member.questionToken,
          });
        }
      }
    } else if (typeNode && ts.isTypeReferenceNode(typeNode)) {
      props.push({
        name: "props",
        type: typeNode.getText(sourceFile),
        required: true,
      });
    }

    if (ts.isObjectBindingPattern(propsParam.name)) {
      for (const element of propsParam.name.elements) {
        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          props.push({
            name: element.name.getText(sourceFile),
            type: "unknown",
            required: !element.initializer,
            defaultValue: element.initializer ? element.initializer.getText(sourceFile) : undefined,
          });
        }
      }
    }

    return props;
  }

  /**
   * Extract dependencies (component usage)
   */
  private extractDependencies(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    signalCollector?: ScannerSignalCollector,
  ): string[] {
    const deps: Set<string> = new Set();

    const visit = (n: ts.Node) => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const tagName = n.tagName.getText(sourceFile);
        if (/^[A-Z]/.test(tagName)) {
          deps.add(tagName);
          if (signalCollector) {
            const depLine = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile)).line + 1;
            signalCollector.collectComponentUsage(tagName, depLine);
          }
        }
      }
      ts.forEachChild(n, visit);
    };

    visit(node);
    return Array.from(deps);
  }

  /**
   * Extract hardcoded values from a node
   */
  private extractHardcodedValues(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    signalCollector?: ScannerSignalCollector,
  ): HardcodedValue[] {
    const hardcoded: HardcodedValue[] = [];

    const visit = (n: ts.Node) => {
      if (ts.isJsxAttribute(n)) {
        const attrName = n.name.getText(sourceFile);

        // Style prop
        if (attrName === "style" && n.initializer) {
          const styleValues = this.extractStyleObjectValues(n.initializer, sourceFile, signalCollector);
          hardcoded.push(...styleValues);
        }

        // Direct color/spacing props
        if (["color", "bg", "backgroundColor", "fill", "stroke"].includes(attrName)) {
          const value = this.getJsxAttributeValue(n, sourceFile);
          if (value && this.isHardcodedColor(value)) {
            const attrLine = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile)).line + 1;
            hardcoded.push({
              type: "color",
              value,
              property: attrName,
              location: `line ${attrLine}`,
            });
            signalCollector?.collectFromValue(value, attrName, attrLine);
          }
        }
      }
      ts.forEachChild(n, visit);
    };

    visit(node);

    // Deduplicate
    const seen = new Set<string>();
    return hardcoded.filter((h) => {
      const key = `${h.property}:${h.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Extract hardcoded values from style object
   */
  private extractStyleObjectValues(
    initializer: ts.JsxAttributeValue,
    sourceFile: ts.SourceFile,
    signalCollector?: ScannerSignalCollector,
  ): HardcodedValue[] {
    const values: HardcodedValue[] = [];

    const styleProperties: Record<string, HardcodedValue["type"]> = {
      color: "color",
      backgroundColor: "color",
      background: "color",
      borderColor: "color",
      padding: "spacing",
      paddingTop: "spacing",
      paddingRight: "spacing",
      paddingBottom: "spacing",
      paddingLeft: "spacing",
      margin: "spacing",
      marginTop: "spacing",
      marginRight: "spacing",
      marginBottom: "spacing",
      marginLeft: "spacing",
      fontSize: "fontSize",
    };

    const processObject = (obj: ts.ObjectLiteralExpression) => {
      for (const prop of obj.properties) {
        if (ts.isPropertyAssignment(prop) && prop.name) {
          const propName = prop.name.getText(sourceFile);
          const valueType = styleProperties[propName];

          if (valueType && prop.initializer) {
            const value = this.getLiteralValue(prop.initializer, sourceFile);
            if (value && this.isHardcodedValue(value, valueType)) {
              const propLine = sourceFile.getLineAndCharacterOfPosition(prop.getStart(sourceFile)).line + 1;
              values.push({
                type: valueType,
                value,
                property: propName,
                location: `line ${propLine}`,
              });
              signalCollector?.collectFromValue(value, propName, propLine);
            }
          }
        }
      }
    };

    if (ts.isJsxExpression(initializer) && initializer.expression) {
      if (ts.isObjectLiteralExpression(initializer.expression)) {
        processObject(initializer.expression);
      }
    }

    return values;
  }

  /**
   * Get JSX attribute value
   */
  private getJsxAttributeValue(attr: ts.JsxAttribute, sourceFile: ts.SourceFile): string | null {
    if (!attr.initializer) return null;
    if (ts.isStringLiteral(attr.initializer)) {
      return attr.initializer.text;
    }
    if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
      return this.getLiteralValue(attr.initializer.expression, sourceFile);
    }
    return null;
  }

  /**
   * Get literal value from expression
   */
  private getLiteralValue(node: ts.Expression, _sourceFile: ts.SourceFile): string | null {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }
    if (ts.isNumericLiteral(node)) {
      return node.text;
    }
    return null;
  }

  /**
   * Check if value is hardcoded
   */
  private isHardcodedValue(value: string, type: HardcodedValue["type"]): boolean {
    if (value.includes("var(--") || value.includes("theme.") || value.includes("tokens.")) {
      return false;
    }

    switch (type) {
      case "color":
        return this.isHardcodedColor(value);
      case "spacing":
      case "fontSize":
        return this.isHardcodedSpacing(value);
      default:
        return false;
    }
  }

  /**
   * Check if value is a hardcoded color
   */
  private isHardcodedColor(value: string): boolean {
    if (value.includes("var(--") || value.includes("theme.") || value.includes("tokens.")) {
      return false;
    }
    if (["inherit", "transparent", "currentColor", "initial", "unset"].includes(value)) {
      return false;
    }
    return COLOR_PATTERNS.some((p) => p.test(value));
  }

  /**
   * Check if value is hardcoded spacing
   */
  private isHardcodedSpacing(value: string): boolean {
    if (value.includes("var(--") || value.includes("theme.") || value.includes("tokens.")) {
      return false;
    }
    if (["auto", "inherit", "0", "100%", "50%"].includes(value)) {
      return false;
    }
    return SPACING_PATTERNS.some((p) => p.test(value));
  }

  /**
   * Scan CSS modules for hardcoded values
   */
  private async scanCSSModules(): Promise<CSSModuleAnalysis[]> {
    const results: CSSModuleAnalysis[] = [];

    for (const pattern of NextJSScanner.CSS_MODULE_PATTERNS) {
      try {
        const files = await glob(pattern, {
          cwd: this.config.projectRoot,
          ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
          absolute: true,
        });

        for (const file of files) {
          const analysis = this.analyzeCSSModule(file);
          if (analysis) {
            results.push(analysis);
          }
        }
      } catch {
        // Continue on error
      }
    }

    return results;
  }

  /**
   * Analyze a single CSS module file
   */
  private analyzeCSSModule(filePath: string): CSSModuleAnalysis | null {
    try {
      const content = readFileSync(filePath, "utf-8");
      const relativePath = relative(this.config.projectRoot, filePath);

      const analysis: CSSModuleAnalysis = {
        path: relativePath,
        classNames: [],
        hardcodedValues: [],
        cssVariables: [],
      };

      // Extract class names
      const classNameRegex = /\.([a-zA-Z_][\w-]*)/g;
      let match;
      while ((match = classNameRegex.exec(content)) !== null) {
        const className = match[1];
        if (className && !analysis.classNames.includes(className)) {
          analysis.classNames.push(className);
        }
      }

      // Extract CSS variables used
      const varRegex = /var\(--([^)]+)\)/g;
      while ((match = varRegex.exec(content)) !== null) {
        const varName = match[1];
        if (varName && !analysis.cssVariables.includes(varName)) {
          analysis.cssVariables.push(varName);
        }
      }

      // Find hardcoded values
      let lineNum = 1;
      const lines = content.split("\n");

      for (const lineContent of lines) {
        const localRegex = /([a-z-]+)\s*:\s*([^;{}]+)/g;
        let propMatch;

        while ((propMatch = localRegex.exec(lineContent)) !== null) {
          const property = propMatch[1];
          const value = propMatch[2]?.trim();

          if (!property || !value) continue;

          // Skip if using CSS variable
          if (value.includes("var(--")) continue;

          const hardcodedType = getHardcodedValueType(property, value);
          if (hardcodedType) {
            analysis.hardcodedValues.push({
              type: hardcodedType,
              value,
              property,
              location: `${relativePath}:${lineNum}`,
            });
          }
        }
        lineNum++;
      }

      return analysis;
    } catch {
      return null;
    }
  }

  /**
   * Scan for next/image usage
   */
  private async scanImageUsage(): Promise<NextImageUsage[]> {
    const results: NextImageUsage[] = [];

    try {
      const files = await glob("**/*.{tsx,jsx}", {
        cwd: this.config.projectRoot,
        ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
        absolute: true,
      });

      for (const file of files) {
        const content = await readFile(file, "utf-8");
        const relativePath = relative(this.config.projectRoot, file);

        // Check if file imports next/image
        if (!content.includes("next/image") && !content.includes("from 'next/image'") && !content.includes('from "next/image"')) {
          continue;
        }

        // Parse and find Image usage
        const sourceFile = ts.createSourceFile(
          file,
          content,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        );

        const visit = (node: ts.Node) => {
          if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
            const tagName = node.tagName.getText(sourceFile);
            if (tagName === "Image" || tagName === "NextImage") {
              const imageLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
              const usage = this.analyzeImageUsage(node, sourceFile, relativePath, imageLine);
              results.push(usage);
            }
          }
          ts.forEachChild(node, visit);
        };

        ts.forEachChild(sourceFile, visit);
      }
    } catch {
      // Continue on error
    }

    return results;
  }

  /**
   * Analyze a single Image component usage
   */
  private analyzeImageUsage(
    node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
    sourceFile: ts.SourceFile,
    file: string,
    line: number,
  ): NextImageUsage {
    const usage: NextImageUsage = {
      file,
      line,
      hasAlt: false,
      hasWidth: false,
      hasHeight: false,
      hasFill: false,
      styleIssues: [],
    };

    const attributes = node.attributes;
    for (const attr of attributes.properties) {
      if (ts.isJsxAttribute(attr) && attr.name) {
        const attrName = attr.name.getText(sourceFile);

        switch (attrName) {
          case "alt":
            usage.hasAlt = true;
            break;
          case "width":
            usage.hasWidth = true;
            break;
          case "height":
            usage.hasHeight = true;
            break;
          case "fill":
            usage.hasFill = true;
            break;
          case "style":
            // Check for hardcoded values in style
            if (attr.initializer) {
              const styleValues = this.extractStyleObjectValues(attr.initializer, sourceFile);
              usage.styleIssues.push(...styleValues);
            }
            break;
        }
      }
    }

    return usage;
  }
}
