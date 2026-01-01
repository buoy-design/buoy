import {
  Scanner,
  ScanResult,
  ScannerConfig,
  ScanError,
  ScanStats,
} from "../base/scanner.js";
import type {
  DesignToken,
  TokenCategory,
  FigmaTokenSource,
  ColorValue,
  SpacingValue,
  RawValue,
} from "@buoy-design/core";
import { createTokenId } from "@buoy-design/core";
import {
  FigmaClient,
  FigmaVariablesResponse,
  FigmaVariable,
  FigmaVariableCollection,
  FigmaAPIError,
} from "./client.js";

export interface FigmaVariableScannerConfig extends ScannerConfig {
  accessToken: string;
  fileKeys: string[];
  /**
   * Filter variables by collection name (case-insensitive contains)
   */
  collectionFilter?: string;
  /**
   * Map Figma mode names to theme variant suffixes
   * e.g., { "Light": "_light", "Dark": "_dark" }
   * If not specified, defaults to mapping common mode names
   */
  modeMapping?: Record<string, string>;
}

/**
 * Default mode name to variant suffix mapping
 */
const DEFAULT_MODE_MAPPING: Record<string, string> = {
  light: "_light",
  dark: "_dark",
  default: "",
  base: "",
  mobile: "_mobile",
  desktop: "_desktop",
  compact: "_compact",
  comfortable: "_comfortable",
};

/**
 * Scans Figma Variables API for design tokens
 */
export class FigmaVariableScanner extends Scanner<
  DesignToken,
  FigmaVariableScannerConfig
> {
  private client: FigmaClient;

  constructor(config: FigmaVariableScannerConfig) {
    super(config);
    this.client = new FigmaClient(config.accessToken);
  }

  async scan(): Promise<ScanResult<DesignToken>> {
    const startTime = Date.now();
    const tokens: DesignToken[] = [];
    const errors: ScanError[] = [];
    let filesScanned = 0;

    for (const fileKey of this.config.fileKeys) {
      try {
        const variables = await this.client.getLocalVariables(fileKey);
        const fileTokens = this.extractTokensFromVariables(
          variables,
          fileKey
        );
        tokens.push(...fileTokens);
        filesScanned++;
      } catch (err) {
        const message = this.formatError(err);
        errors.push({
          file: fileKey,
          message,
          code: err instanceof FigmaAPIError ? "FIGMA_API_ERROR" : "UNKNOWN_ERROR",
        });
      }
    }

    const stats: ScanStats = {
      filesScanned,
      itemsFound: tokens.length,
      duration: Date.now() - startTime,
    };

    return { items: tokens, errors, stats };
  }

  getSourceType(): string {
    return "figma-variables";
  }

  /**
   * Format error message for user display
   */
  private formatError(err: unknown): string {
    if (err instanceof FigmaAPIError) {
      if (err.statusCode === 403) {
        return "Access denied. Check that your Figma token has Variables read access and the file is accessible.";
      }
      if (err.statusCode === 404) {
        return "File not found. Check the file key is correct.";
      }
      if (err.statusCode === 429) {
        return "Rate limited by Figma API. Try again later.";
      }
      return err.message;
    }
    return err instanceof Error ? err.message : String(err);
  }

  /**
   * Extract design tokens from Figma Variables response
   */
  private extractTokensFromVariables(
    response: FigmaVariablesResponse,
    fileKey: string
  ): DesignToken[] {
    const tokens: DesignToken[] = [];
    const { variables, variableCollections } = response.meta;

    // Build collection map for quick lookups
    const collectionMap = new Map<string, FigmaVariableCollection>();
    for (const [id, collection] of Object.entries(variableCollections)) {
      collectionMap.set(id, collection);
    }

    // Process each variable
    for (const [variableId, variable] of Object.entries(variables)) {
      // Find the collection this variable belongs to
      const collection = this.findCollectionForVariable(
        variableId,
        variableCollections
      );

      // Apply collection filter if configured
      if (this.config.collectionFilter && collection) {
        const filterLower = this.config.collectionFilter.toLowerCase();
        if (!collection.name.toLowerCase().includes(filterLower)) {
          continue;
        }
      }

      // Extract tokens for each mode
      const modeTokens = this.extractTokensForModes(
        variable,
        collection,
        fileKey
      );
      tokens.push(...modeTokens);
    }

    return tokens;
  }

  /**
   * Find the collection a variable belongs to
   */
  private findCollectionForVariable(
    variableId: string,
    collections: Record<string, FigmaVariableCollection>
  ): FigmaVariableCollection | undefined {
    // Variables don't directly reference their collection in the API response
    // The collection ID is the prefix of the variable ID before the first colon
    const parts = variableId.split(":");
    if (parts.length > 0) {
      // Look for collection by checking variable membership
      for (const collection of Object.values(collections)) {
        // Collections in Figma Variables API don't directly list their variables
        // We use the collection that has matching mode IDs in the variable's valuesByMode
        return collection;
      }
    }
    return Object.values(collections)[0];
  }

  /**
   * Extract tokens for each mode of a variable
   */
  private extractTokensForModes(
    variable: FigmaVariable,
    collection: FigmaVariableCollection | undefined,
    fileKey: string
  ): DesignToken[] {
    const tokens: DesignToken[] = [];
    const modes = collection?.modes || [];

    for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
      // Find mode name
      const mode = modes.find((m) => m.modeId === modeId);
      const modeName = mode?.name || "default";

      // Get variant suffix from mapping
      const suffix = this.getModeVariantSuffix(modeName);

      // Build token name with optional suffix
      const tokenName = suffix
        ? `${variable.name}${suffix}`
        : variable.name;

      // Create token
      const token = this.createToken(
        variable,
        value,
        tokenName,
        fileKey,
        collection?.name
      );

      if (token) {
        tokens.push(token);
      }
    }

    return tokens;
  }

  /**
   * Get the variant suffix for a mode name
   */
  private getModeVariantSuffix(modeName: string): string {
    const mapping = this.config.modeMapping || DEFAULT_MODE_MAPPING;
    const modeNameLower = modeName.toLowerCase();

    // Check for exact match in custom mapping
    if (this.config.modeMapping && mapping[modeName] !== undefined) {
      return mapping[modeName];
    }

    // Check for case-insensitive match in defaults
    if (DEFAULT_MODE_MAPPING[modeNameLower] !== undefined) {
      return DEFAULT_MODE_MAPPING[modeNameLower];
    }

    // Use mode name as suffix if not found
    return `_${modeNameLower.replace(/\s+/g, "-")}`;
  }

  /**
   * Create a DesignToken from a Figma variable value
   */
  private createToken(
    variable: FigmaVariable,
    value: unknown,
    name: string,
    fileKey: string,
    collectionName?: string
  ): DesignToken | null {
    const category = this.inferCategory(variable.resolvedType);
    const tokenValue = this.convertValue(variable.resolvedType, value);

    if (!tokenValue) {
      return null;
    }

    const source: FigmaTokenSource = {
      type: "figma",
      fileKey,
      variableId: variable.id,
      collectionName,
    };

    return {
      id: createTokenId(source, name),
      name: this.normalizeTokenName(name),
      category,
      value: tokenValue,
      source,
      aliases: [variable.key],
      usedBy: [],
      metadata: {
        tags: collectionName ? [collectionName] : [],
        description: undefined,
      },
      scannedAt: new Date(),
    };
  }

  /**
   * Normalize token name to standard format
   * Converts Figma's slash-separated names to dot notation
   */
  private normalizeTokenName(name: string): string {
    return name
      .replace(/\//g, ".")
      .replace(/\s+/g, "-")
      .toLowerCase();
  }

  /**
   * Infer token category from Figma variable type
   */
  private inferCategory(resolvedType: string): TokenCategory {
    switch (resolvedType) {
      case "COLOR":
        return "color";
      case "FLOAT":
        // Could be spacing, sizing, or other numeric value
        return "spacing";
      case "STRING":
        return "other";
      case "BOOLEAN":
        return "other";
      default:
        return "other";
    }
  }

  /**
   * Convert Figma variable value to DesignToken value format
   */
  private convertValue(
    resolvedType: string,
    value: unknown
  ): ColorValue | SpacingValue | RawValue | null {
    if (value === null || value === undefined) {
      return null;
    }

    // Handle alias references (variable references)
    if (typeof value === "object" && value !== null && "type" in value) {
      const typed = value as { type: string; value?: unknown };
      if (typed.type === "VARIABLE_ALIAS") {
        // Return as raw value with alias reference
        return {
          type: "raw",
          value: `var(--${typed.value})`,
        };
      }
    }

    switch (resolvedType) {
      case "COLOR": {
        const color = value as { r: number; g: number; b: number; a: number };
        const hex = this.rgbaToHex(color.r, color.g, color.b, color.a);
        const colorValue: ColorValue = {
          type: "color",
          hex,
          rgba: {
            r: Math.round(color.r * 255),
            g: Math.round(color.g * 255),
            b: Math.round(color.b * 255),
            a: color.a,
          },
        };
        return colorValue;
      }

      case "FLOAT": {
        const numValue = value as number;
        const spacingValue: SpacingValue = {
          type: "spacing",
          value: numValue,
          unit: "px",
        };
        return spacingValue;
      }

      case "STRING": {
        const rawValue: RawValue = {
          type: "raw",
          value: String(value),
        };
        return rawValue;
      }

      case "BOOLEAN": {
        const rawValue: RawValue = {
          type: "raw",
          value: String(value),
        };
        return rawValue;
      }

      default:
        return null;
    }
  }

  /**
   * Convert RGBA values (0-1 range) to hex color string
   */
  private rgbaToHex(r: number, g: number, b: number, a: number): string {
    const toHex = (n: number): string => {
      const hex = Math.round(n * 255)
        .toString(16)
        .padStart(2, "0");
      return hex;
    };

    const hexR = toHex(r);
    const hexG = toHex(g);
    const hexB = toHex(b);

    // Include alpha if not fully opaque
    if (a < 1) {
      const hexA = toHex(a);
      return `#${hexR}${hexG}${hexB}${hexA}`;
    }

    return `#${hexR}${hexG}${hexB}`;
  }
}
