// packages/agents/src/types.ts
// Simplified types for parsing agent output - SDK handles most complexity

import { z } from 'zod';

// ============================================================================
// Agent Result Types (for parsing output)
// ============================================================================

export const FindingSeveritySchema = z.enum(['critical', 'warning', 'info', 'positive']);
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

export const FindingSchema = z.object({
  type: z.string(),
  severity: FindingSeveritySchema,
  location: z.string().optional(),
  observation: z.string(),
  recommendation: z.string().optional(),
  evidence: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type Finding = z.infer<typeof FindingSchema>;

export const CodePatternSchema = z.object({
  name: z.string(),
  description: z.string(),
  occurrences: z.number(),
  examples: z.array(z.object({
    file: z.string(),
    line: z.number(),
    snippet: z.string(),
  })),
  isConsistent: z.boolean(),
});

export type CodePattern = z.infer<typeof CodePatternSchema>;

// ============================================================================
// SDK Wrapper Types
// ============================================================================

export interface AnalysisOptions {
  workingDirectory?: string;
  question?: string;
}

export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
}
