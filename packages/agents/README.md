# @buoy-design/agents

AI agents for code analysis, powered by Claude Code.

## Prerequisites

- Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- `ANTHROPIC_API_KEY` environment variable set

## Installation

```bash
pnpm add @buoy-design/agents
```

## Usage

### Programmatic (via Buoy CLI)

```typescript
import { analyzeCodebase, analyzeHistory, predictAcceptance } from '@buoy-design/agents';

// Analyze code patterns and quality
const result = await analyzeCodebase(['src/Button.tsx', 'src/Input.tsx']);
console.log(result.output);

// Understand git history
const history = await analyzeHistory(['src/Button.tsx'], {
  question: 'Why was this file not updated during the token migration?'
});

// Predict PR acceptance
const prediction = await predictAcceptance('/path/to/repo',
  'Migrate hardcoded colors to design tokens'
);
```

### Interactive (via Claude Code)

```
> Use the codebase-review agent to analyze src/components/

> Use the history-review agent to explain why Button.tsx still has hardcoded colors

> Use the acceptance agent to predict if my token migration PR will be accepted
```

## Agents

| Agent | Purpose |
|-------|---------|
| `codebase-review` | Analyze code patterns, quality, design system adherence |
| `history-review` | Understand git history, explain why code wasn't updated |
| `acceptance` | Predict PR acceptance, suggest submission approach |

Agent definitions live in `.claude/agents/` and work in both modes.

## API

### analyzeCodebase(files, options?)

Analyze files for design system patterns and quality.

```typescript
interface AnalysisOptions {
  workingDirectory?: string;  // Defaults to process.cwd()
  question?: string;          // Focus the analysis
}

interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
}
```

### analyzeHistory(files, options?)

Analyze git history to understand code evolution.

### predictAcceptance(repoPath, proposedChanges, options?)

Predict whether changes would be accepted as a PR.

## License

MIT
