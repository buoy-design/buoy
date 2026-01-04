import { z } from 'zod';

/**
 * Signal types representing atomic facts extracted from code
 */
export const SignalTypeSchema = z.enum([
  // Value-level signals
  'color-value',
  'spacing-value',
  'font-size',
  'font-family',
  'font-weight',
  'radius-value',
  'shadow-value',
  'breakpoint',
  // Token signals
  'token-definition',
  'token-usage',
  // Component signals
  'component-def',
  'component-usage',
  // Pattern signals
  'prop-pattern',
  'class-pattern',
]);

export type SignalType = z.infer<typeof SignalTypeSchema>;

/**
 * Source location for a signal
 */
export const SourceLocationSchema = z.object({
  path: z.string(),
  line: z.number(),
  column: z.number().optional(),
  snippet: z.string().optional(),
});

export type SourceLocation = z.infer<typeof SourceLocationSchema>;

/**
 * File type enum for context
 */
export const FileTypeSchema = z.enum([
  'tsx',
  'jsx',
  'ts',
  'js',
  'vue',
  'svelte',
  'css',
  'scss',
  'less',
  'json',
  'config',
  'html',
  'template',
]);

export type FileType = z.infer<typeof FileTypeSchema>;

/**
 * Framework enum for context
 */
export const FrameworkSchema = z.enum([
  'react',
  'vue',
  'svelte',
  'angular',
  'tailwind',
  'vanilla',
  'css',
]).nullable();

export type Framework = z.infer<typeof FrameworkSchema>;

/**
 * Scope enum for context
 */
export const ScopeSchema = z.enum([
  'global',
  'component',
  'inline',
]);

export type Scope = z.infer<typeof ScopeSchema>;

/**
 * Context for a signal - helps determine how to score it later
 */
export const SignalContextSchema = z.object({
  fileType: FileTypeSchema,
  framework: FrameworkSchema,
  scope: ScopeSchema,
  isTokenized: z.boolean(),
});

export type SignalContext = z.infer<typeof SignalContextSchema>;

/**
 * Raw signal - an atomic fact extracted from source code
 */
export const RawSignalSchema = z.object({
  id: z.string(),
  type: SignalTypeSchema,
  value: z.unknown(),
  location: SourceLocationSchema,
  context: SignalContextSchema,
  metadata: z.record(z.unknown()),
});

export type RawSignal = z.infer<typeof RawSignalSchema>;

/**
 * Create a unique signal ID
 */
export function createSignalId(
  type: SignalType,
  path: string,
  line: number,
  value: unknown,
): string {
  const valueHash = typeof value === 'string'
    ? value.slice(0, 20)
    : String(value).slice(0, 20);
  return `${type}:${path}:${line}:${valueHash}`;
}
