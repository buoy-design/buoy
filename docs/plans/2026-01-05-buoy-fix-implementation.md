# Implementation Plan: `buoy fix` Command

**Design Doc:** [2026-01-05-buoy-fix-design.md](./2026-01-05-buoy-fix-design.md)
**Phase:** 1 (Foundation)

## Overview

Implement the core `buoy fix` command with preview mode, dry-run, and apply functionality for hardcoded value fixes only.

## Tasks

### 1. Create Fix Generator Module

**File:** `packages/core/src/fix/generator.ts`

```typescript
// Generate Fix objects from DriftSignals
export function generateFixes(
  drifts: DriftSignal[],
  tokens: DesignToken[],
  options?: { types?: string[] }
): Fix[];
```

**Subtasks:**
- [ ] Define `Fix` and `FixSession` types in `packages/core/src/models/fix.ts`
- [ ] Export from `packages/core/src/models/index.ts`
- [ ] Implement fix generation for `hardcoded-value` drift type
- [ ] Match hardcoded values to closest tokens
- [ ] Generate replacement strings (CSS var, Tailwind class, etc.)

### 2. Create Confidence Scorer

**File:** `packages/core/src/fix/confidence.ts`

```typescript
export function scoreConfidence(
  original: string,
  replacement: string,
  token: DesignToken
): { level: 'exact' | 'high' | 'medium' | 'low'; score: number; reason: string };
```

**Subtasks:**
- [x] Exact match = 100% confidence ('exact' level)
- [x] 1-2 char difference (typo) = 95%+ confidence ('high' level)
- [x] Color within deltaE < 5 = 85%+ confidence ('high' level)
- [x] Spacing within 2px = 80%+ confidence ('high' level)
- [x] Multiple possible matches = medium confidence
- [x] No clear match = low confidence

### 3. Create Fix Command

**File:** `apps/cli/src/commands/fix.ts`

**Subtasks:**
- [ ] Register command with Commander
- [ ] Implement default preview mode (no flags)
- [ ] Implement `--dry-run` with detailed diff output
- [ ] Implement `--apply` for direct file modification
- [ ] Implement `--confidence` filter
- [ ] Implement `--type` filter
- [ ] Implement `--file` glob filter
- [ ] Add to `apps/cli/src/commands/index.ts` exports

### 4. Create Fix Applier

**File:** `apps/cli/src/fix/applier.ts`

```typescript
export async function applyFixes(
  fixes: Fix[],
  options: { backup?: boolean; dryRun?: boolean }
): Promise<FixResult>;
```

**Subtasks:**
- [ ] Read file content
- [ ] Apply string replacements at specified locations
- [ ] Validate syntax after replacement (parse JS/CSS)
- [ ] Write file (or skip if dry-run)
- [ ] Create backup files if `--backup`
- [ ] Return success/failure for each fix

### 5. Create Fix Formatters

**File:** `apps/cli/src/output/fix-formatters.ts`

**Subtasks:**
- [ ] `formatFixPreview(fixes)` — Summary table for default mode
- [ ] `formatFixDiff(fixes)` — Detailed diff for `--dry-run`
- [ ] `formatFixResult(result)` — Applied/skipped/failed summary

### 6. Safety Checks

**File:** `apps/cli/src/fix/safety.ts`

**Subtasks:**
- [ ] Check for uncommitted git changes, warn user
- [ ] Validate file is not in `node_modules`, `dist`, etc.
- [ ] Parse result to ensure valid syntax
- [ ] Track fix session for potential `--undo`

### 7. Configuration Support

**File:** `apps/cli/src/config/schema.ts`

**Subtasks:**
- [ ] Add `fix` section to config schema
- [ ] Support `autoApplyThreshold`, `exclude`, `backup` options
- [ ] Validate config on load

### 8. Tests

**Subtasks:**
- [ ] Unit tests for fix generator
- [ ] Unit tests for confidence scorer
- [ ] Unit tests for applier (with mock fs)
- [ ] Integration test: full fix workflow
- [ ] Snapshot tests for formatter output

## File Changes Summary

| File | Change |
|------|--------|
| `packages/core/src/models/fix.ts` | New file |
| `packages/core/src/models/index.ts` | Export fix types |
| `packages/core/src/fix/generator.ts` | New file |
| `packages/core/src/fix/confidence.ts` | New file |
| `packages/core/src/fix/index.ts` | New file (exports) |
| `packages/core/src/index.ts` | Export fix module |
| `apps/cli/src/commands/fix.ts` | New file |
| `apps/cli/src/commands/index.ts` | Add fix export |
| `apps/cli/src/fix/applier.ts` | New file |
| `apps/cli/src/fix/safety.ts` | New file |
| `apps/cli/src/output/fix-formatters.ts` | New file |
| `apps/cli/src/config/schema.ts` | Add fix config |

## Acceptance Criteria

### Preview Mode (default)
- [ ] Running `buoy fix` shows fixable issues grouped by confidence
- [ ] No files are modified
- [ ] Shows clear next steps

### Dry Run
- [ ] `buoy fix --dry-run` shows detailed diff for each fix
- [ ] Uses standard diff format (- old, + new)
- [ ] Shows file path and line numbers

### Apply
- [ ] `buoy fix --apply` modifies files in place
- [ ] Only applies high-confidence fixes by default
- [ ] Shows summary of applied/skipped fixes
- [ ] Warns if git has uncommitted changes
- [ ] Creates backups if configured

### Filters
- [ ] `--confidence=medium` includes medium confidence fixes
- [ ] `--type=hardcoded-value` filters by drift type
- [ ] `--file=src/**` scopes to matching files

## Dependencies

- Existing `DriftSignal` from scan/drift check
- Existing `DesignToken` from token scanning
- Existing formatters in `apps/cli/src/output/`

## Estimated Effort

| Task | Complexity | Estimate |
|------|------------|----------|
| Fix types & generator | Medium | 2-3 hours |
| Confidence scorer | Medium | 2 hours |
| Fix command | Medium | 2-3 hours |
| Applier | High | 3-4 hours |
| Formatters | Low | 1-2 hours |
| Safety checks | Medium | 2 hours |
| Config support | Low | 1 hour |
| Tests | Medium | 3-4 hours |
| **Total** | | **16-21 hours** |

## Phase 2 Preview (Not This PR)

- `--interactive` mode with y/n prompts
- `--pr` mode with GitHub integration
- `--patch` mode for patch file generation
- `--undo` for rollback
