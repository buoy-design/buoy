# Design: `buoy fix` Command

**Date:** 2026-01-05
**Status:** Approved
**Author:** Design Roundtable (20 persona interviews + competitive research)

## Summary

Implement a `buoy fix` command that automatically fixes design drift issues. The command is **conservative by default** (preview-only) and **powerful when explicitly requested** (`--apply`, `--pr`, `--interactive`).

## Problem Statement

The buoy-site heavily promotes `buoy fix --auto` but the command doesn't exist. This creates a credibility gap. However, research shows users don't actually want blind auto-fixing—they want visibility, control, and safety.

## Research Findings

### Competitive Analysis

| Tool | Modifies Files Directly? | Approach |
|------|-------------------------|----------|
| CodeRabbit | No | Generates patches, hands off to AI agents |
| Greptile | No | GitHub commit suggestions, MCP handoff |
| ESLint | Yes | AST-aware, years of hardening, dry-run option |
| Prettier | Yes | Formatting only (no logic changes) |

**Key insight:** Review tools generate suggestions; lint tools modify directly but only for well-defined transformations.

### User Research (20 Interviews)

| Theme | Count | Representative Quote |
|-------|-------|---------------------|
| PR-based fixes, not direct modification | 9 | "Create a PR, not direct commits" |
| Dry-run / preview first | 7 | "Show me before/after" |
| Confidence levels | 6 | "If 100% certain, fix it. If ambiguous, flag it." |
| Interactive mode (y/n per fix) | 5 | "Like `git add -p` for design fixes" |
| Editor integration | 4 | "Catch it before it's committed" |
| Batch fixing (low friction) | 4 | "Fix 50 things at once. One commit." |
| CI blocking more important than fix | 4 | "Detection is must-have, fix is nice-to-have" |

**Key insight:** Nobody asked for `buoy fix --auto` as currently marketed. Users want: "Show me what you'd fix, let me review it, then apply it safely."

## Design

### Command Structure

```bash
# Discovery (default behavior - no modification)
buoy fix                    # Show fixable issues with previews

# Review modes
buoy fix --dry-run          # Detailed diff of all changes
buoy fix --interactive      # Approve each fix: y/n/skip

# Apply modes
buoy fix --apply            # Apply fixes directly to files
buoy fix --pr               # Create a PR with fixes
buoy fix --patch            # Generate a .patch file

# Filters
buoy fix --confidence=high  # Only 95%+ confidence fixes
buoy fix --type=hardcoded   # Only hardcoded-value drift
buoy fix --file=<glob>      # Scope to specific files
```

### Default Experience

Running `buoy fix` with no flags shows a summary without modifying anything:

```
$ buoy fix

⚓ Buoy Fix — 23 issues can be auto-fixed

  CONFIDENCE   TYPE              COUNT   EXAMPLE
  ──────────────────────────────────────────────────────
  ● High       hardcoded-value   18      #3b82f6 → var(--color-primary)
  ◐ Medium     hardcoded-value   3       #f3f4f6 → var(--color-gray-100) ?
  ○ Low        naming            2       loginBtn → LoginButton ?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  18 high-confidence fixes ready

  Next steps:
    buoy fix --dry-run        Preview all changes
    buoy fix --interactive    Review each fix (y/n)
    buoy fix --apply          Apply 18 high-confidence fixes
    buoy fix --pr             Create a PR with fixes
```

### Confidence Levels

| Level | Criteria | Auto-fixable with --apply? |
|-------|----------|---------------------------|
| **Exact** (100%) | Value exactly matches a design token | Yes (safest) |
| **High** (95-99%) | Very close match, unambiguous | Yes |
| **Medium** (70-94%) | Close match, might be intentional | Only with --interactive |
| **Low** (<70%) | Ambiguous, multiple possibilities | No, manual only |

### V1 Fix Types (Scoped for Safety)

**Included in V1:**
- `hardcoded-color` — `#fff` → `var(--color-bg)`
- `hardcoded-spacing` — `16px` → `var(--spacing-4)`
- `hardcoded-radius` — `8px` → `var(--radius-md)`
- `hardcoded-font-size` — `14px` → `var(--text-sm)`

**NOT in V1:**
- Component replacement (changes behavior)
- Naming fixes (requires updating imports)
- Prop consistency (semantic meaning changes)
- Accessibility fixes (requires context understanding)

### Interactive Mode

Modeled after `git add -p`:

```
$ buoy fix --interactive

src/components/Card.tsx:14

  - backgroundColor: '#f9fafb'
  + backgroundColor: 'var(--color-gray-50)'

  Confidence: High (98%)
  Reason: Exact match to --color-gray-50 in design-tokens.css

  [y] Apply  [n] Skip  [q] Quit  [a] Apply all remaining  [?] Help
```

### PR Mode

```
$ buoy fix --pr

⚓ Creating fix PR...

  Branch: buoy/fix-18-hardcoded-values
  Files changed: 12
  Fixes applied: 18

  ✓ PR created: https://github.com/acme/app/pull/847
```

### Safety Guarantees

1. **Never modify without explicit flag** — Default shows preview only
2. **Git dirty check** — Warn if uncommitted changes exist
3. **Backup option** — `--backup` creates `.bak` files
4. **Syntax validation** — Parse result to ensure valid JS/CSS
5. **Rollback command** — `buoy fix --undo` reverts last session

### Configuration

```javascript
// buoy.config.mjs
export default {
  fix: {
    autoApplyThreshold: 'high', // 'high' | 'medium' | 'all'
    exclude: ['**/node_modules/**', '**/dist/**'],
    requirePRInCI: true,
    backup: true,
  },
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      buoy fix                           │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │ DriftSignals │───▶│ FixGenerator │───▶│  Fixes[]  │ │
│  └──────────────┘    └──────────────┘    └───────────┘ │
│                             │                    │      │
│                      ┌──────▼──────┐    ┌───────▼────┐ │
│                      │ Confidence  │    │  Appliers  │ │
│                      │   Scorer    │    ├────────────┤ │
│                      └─────────────┘    │ DryRun     │ │
│                                         │ Apply      │ │
│                                         │ PR         │ │
│                                         │ Interactive│ │
│                                         └────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Key Types

```typescript
interface Fix {
  id: string;
  driftSignal: DriftSignal;
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number; // 0-100
  file: string;
  line: number;
  column: number;
  original: string;
  replacement: string;
  reason: string;
}

interface FixSession {
  id: string;
  startedAt: Date;
  fixes: Fix[];
  applied: string[]; // fix IDs
  skipped: string[];
  failed: Array<{ fixId: string; error: string }>;
}
```

## Implementation Phases

### Phase 1: Foundation
- `buoy fix` — Preview mode (no modification)
- `buoy fix --dry-run` — Detailed diff output
- `buoy fix --apply` — Direct file modification (high confidence only)
- Hardcoded color/spacing/radius/font-size fixes only
- Confidence scoring based on token matching

### Phase 2: Workflow Integration
- `buoy fix --interactive` — Per-fix approval
- `buoy fix --pr` — GitHub PR creation
- `buoy fix --patch` — Generate patch file
- `buoy fix --undo` — Rollback last session

### Phase 3: Advanced
- Editor extension (fix-on-save)
- Token migration mode (`--migrate old=new`)
- Team-scoped fix permissions
- Pre-commit hook integration

## Success Metrics

1. **Adoption:** 50%+ of users who run `buoy drift check` also try `buoy fix`
2. **Safety:** Zero reported incidents of broken code from auto-fix
3. **Satisfaction:** "buoy fix" mentioned positively in user feedback
4. **Coverage:** 80%+ of hardcoded-value drifts are auto-fixable

## Rejected Alternatives

### 1. Full auto-fix by default (like site promises)
**Rejected because:** 9/20 users explicitly wanted PR-based workflow. Direct modification without preview is too risky for a v1.

### 2. No fix command, only suggestions
**Rejected because:** Users want the convenience of applying fixes. CodeRabbit/Greptile delegate to other tools; we can be more integrated.

### 3. AI-powered fixes (use Claude to rewrite code)
**Rejected because:** Unpredictable output, can't guarantee safety. Save for v2 after deterministic fixes are proven.

## Open Questions

1. Should `--apply` require a confirmation prompt, or is the flag itself enough confirmation?
2. How do we handle fixes that span multiple lines (e.g., multi-line template literals)?
3. Should we support `--fix` as an alias for `--apply` (ESLint compatibility)?

## References

- [ESLint CLI --fix documentation](https://eslint.org/docs/latest/use/command-line-interface)
- [CodeRabbit CLI integration](https://www.coderabbit.ai/cli)
- [Greptile MCP auto-resolve](https://www.greptile.com/docs/code-review-bot/auto-resolve-with-mcp)
