# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Buoy is a design drift detection tool for AI-generated code. It scans codebases to catch when developers (especially AI tools like Copilot/Claude) diverge from design system patterns before code ships.

## Common Commands

```bash
# Build all packages (required before running CLI)
pnpm build

# Build specific package
pnpm --filter @buoy/cli build
pnpm --filter @buoy/core build

# Run CLI locally (after building)
node apps/cli/dist/bin.js <command>

# Type checking
pnpm typecheck

# Run tests
pnpm test

# Format code
pnpm format

# Watch mode development
pnpm dev
```

## Architecture

This is a TypeScript monorepo using pnpm workspaces and Turbo.

### Package Structure

```
apps/cli/          # @buoy/cli - CLI application (entry point: bin.js)
packages/core/     # @buoy/core - Domain models, drift detection engine
packages/scanners/ # @buoy/scanners - Framework-specific code scanners
packages/db/       # @buoy/db - SQLite persistence via Drizzle
packages/plugin-react/   # React component scanner plugin
packages/plugin-github/  # GitHub PR comment integration
```

### Key Data Flow

1. **CLI commands** (`apps/cli/src/commands/`) parse args and orchestrate
2. **Plugins** (`apps/cli/src/plugins/`) are auto-discovered from `@buoy/plugin-*` packages
3. **Scanners** (`packages/scanners/`) extract Components and DesignTokens from source files
4. **SemanticDiffEngine** (`packages/core/src/analysis/`) compares sources and produces DriftSignals
5. **Reporters** (`apps/cli/src/output/`) format output (table, JSON, markdown)

### Core Domain Models (packages/core/src/models/)

- **Component**: Represents UI components from any framework (React, Vue, Svelte, etc.)
- **DesignToken**: Color, spacing, typography values from CSS/JSON/Figma
- **DriftSignal**: A detected issue (hardcoded-value, naming-inconsistency, deprecated-pattern, etc.)

### Plugin System

Plugins implement the `BuoyPlugin` interface with optional `scan()` and `report()` methods:
- `scan(context)` → returns components/tokens from a source
- `report(results, context)` → posts results somewhere (e.g., GitHub PR comment)

Plugins are auto-discovered from `package.json` dependencies matching `@buoy/plugin-*`.

## CLI Commands

| Command | Purpose |
|---------|---------|
| `buoy init` | Auto-detect frameworks, generate buoy.config.mjs |
| `buoy scan` | Scan components and tokens from enabled sources |
| `buoy status` | Visual coverage grid showing what's detected |
| `buoy drift check` | Detailed drift signals with filtering |
| `buoy ci` | CI-optimized output with exit codes, GitHub PR integration |
| `buoy plugins` | List installed and suggested plugins |

## Configuration

Config lives in `buoy.config.mjs` (ESM). Schema defined in `apps/cli/src/config/schema.ts`.

## Adding Features

### New Drift Detection Type
1. Add to `DriftTypeSchema` in `packages/core/src/models/drift.ts`
2. Implement detection in `packages/core/src/analysis/semantic-diff.ts`

### New Framework Scanner
1. Create scanner in `packages/scanners/src/git/`
2. Export from `packages/scanners/src/git/index.ts`
3. Add detection in `apps/cli/src/detect/project-detector.ts`
4. Wire into scan/status commands

### New Plugin
1. Create `packages/plugin-<name>/` with `BuoyPlugin` export
2. Auto-discovered when installed in target project

## Testing

```bash
# Run all tests
pnpm test

# Use test-fixture/ directory for manual CLI testing
node apps/cli/dist/bin.js status
```

## Output Modes

All commands support `--json` for machine-readable output. The `setJsonMode()` function in `apps/cli/src/output/reporters.ts` suppresses decorative output when enabled.
