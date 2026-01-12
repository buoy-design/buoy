/**
 * Pattern Analyzer
 *
 * Detects repeated className patterns across the codebase.
 * Suggests extracting common patterns into components or utility classes.
 */

import type { DriftSignal } from "../../models/index.js";
import { createDriftId } from "../../models/index.js";

/**
 * Variant categories for tight matching.
 * These patterns identify Tailwind classes that represent the same concept with different values.
 */
const VARIANT_PATTERNS: Record<string, RegExp> = {
  shadow: /^shadow(-none|-sm|-md|-lg|-xl|-2xl)?$/,
  rounded: /^rounded(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full)?$/,
  gap: /^gap-(\d+|px)$/,
  p: /^p-(\d+|px)$/,
  px: /^px-(\d+|px)$/,
  py: /^py-(\d+|px)$/,
  pt: /^pt-(\d+|px)$/,
  pr: /^pr-(\d+|px)$/,
  pb: /^pb-(\d+|px)$/,
  pl: /^pl-(\d+|px)$/,
  m: /^m-(\d+|px)$/,
  mx: /^mx-(\d+|px)$/,
  my: /^my-(\d+|px)$/,
  mt: /^mt-(\d+|px)$/,
  mr: /^mr-(\d+|px)$/,
  mb: /^mb-(\d+|px)$/,
  ml: /^ml-(\d+|px)$/,
  text: /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/,
};

/**
 * Normalize a class for tight matching - replace variant values with placeholders.
 */
function normalizeTight(classes: string): { normalized: string; variants: string[] } {
  const classList = classes.trim().split(/\s+/).filter(Boolean);
  const normalized: string[] = [];
  const variants: string[] = [];

  for (const cls of classList) {
    let matched = false;
    for (const [category, pattern] of Object.entries(VARIANT_PATTERNS)) {
      if (pattern.test(cls)) {
        normalized.push(`{${category}}`);
        variants.push(cls);
        matched = true;
        break;
      }
    }
    if (!matched) {
      normalized.push(cls);
    }
  }

  return {
    normalized: normalized.sort().join(" "),
    variants,
  };
}

export interface ClassOccurrence {
  classes: string;
  file: string;
  line: number;
}

export interface PatternAnalyzerOptions {
  minOccurrences?: number;
  matching?: "exact" | "tight" | "loose";
}

/**
 * Normalize a className string by sorting classes alphabetically.
 * "flex items-center gap-2" -> "flex gap-2 items-center"
 */
export function normalizeClassPattern(classes: string): string {
  return classes
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * Group occurrences by normalized pattern.
 */
export function groupPatterns(
  occurrences: ClassOccurrence[],
  matching: "exact" | "tight" | "loose" = "exact"
): Map<string, ClassOccurrence[]> {
  const groups = new Map<string, ClassOccurrence[]>();

  for (const occ of occurrences) {
    let normalized: string;

    if (matching === "tight") {
      normalized = normalizeTight(occ.classes).normalized;
    } else {
      normalized = normalizeClassPattern(occ.classes);
    }

    if (!normalized) continue;

    const existing = groups.get(normalized) || [];
    existing.push(occ);
    groups.set(normalized, existing);
  }

  return groups;
}

/**
 * Detect repeated patterns and generate drift signals.
 */
export function detectRepeatedPatterns(
  occurrences: ClassOccurrence[],
  options: PatternAnalyzerOptions = {}
): DriftSignal[] {
  const { minOccurrences = 2, matching = "exact" } = options;
  const groups = groupPatterns(occurrences, matching);
  const drifts: DriftSignal[] = [];

  for (const [pattern, locations] of groups) {
    if (locations.length < minOccurrences) continue;

    const classCount = pattern.split(" ").length;
    const isSimple = classCount <= 3;
    const firstLocation = locations[0]!;

    // For tight matching, collect unique variants used across all locations
    let suggestions: string[];
    let variants: string[] | undefined;

    if (matching === "tight") {
      // Collect all unique variants from the grouped occurrences
      const variantSet = new Set<string>();
      for (const loc of locations) {
        const { variants: locVariants } = normalizeTight(loc.classes);
        for (const v of locVariants) {
          variantSet.add(v);
        }
      }
      variants = Array.from(variantSet);

      // For tight matches with variants, suggest component with props
      suggestions = [
        "Consider extracting this pattern into a component with props for variants",
        `Variants found: ${variants.join(", ")}`,
      ];
    } else {
      suggestions = isSimple
        ? ["Consider creating a utility class for this pattern"]
        : ["Consider extracting this pattern into a reusable component"];
    }

    drifts.push({
      id: createDriftId("repeated-pattern", pattern.replace(/\s+/g, "-")),
      type: "repeated-pattern",
      severity: "info",
      source: {
        entityType: "component",
        entityId: `pattern:${pattern.replace(/\s+/g, "-")}`,
        entityName: pattern,
        location: `${firstLocation.file}:${firstLocation.line}`,
      },
      message: `Pattern "${pattern}" appears ${locations.length} times across ${new Set(locations.map(l => l.file)).size} files`,
      details: {
        occurrences: locations.length,
        locations: locations.map((l) => `${l.file}:${l.line}`),
        suggestions,
        ...(variants ? { variants } : {}),
      },
      detectedAt: new Date(),
    });
  }

  return drifts;
}
