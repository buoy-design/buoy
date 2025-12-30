# @buoy-design/agents

AI agents for code analysis, git history review, and contribution assessment.

## Installation

```bash
pnpm add @buoy-design/agents
```

## Agents

### CodebaseReviewAgent

Analyzes code for patterns, quality, and whether drift signals are intentional divergences.

```typescript
import { CodebaseReviewAgent } from '@buoy-design/agents';

const agent = new CodebaseReviewAgent();
const result = await agent.execute({
  repo: { url: '...', name: 'repo', owner: 'org', defaultBranch: 'main', localPath: '/path' },
  files: [{ path: 'Button.tsx', content: '...', lineCount: 50 }],
  signals: driftSignals, // optional
});

console.log(result.patterns);
console.log(result.codeQuality);
console.log(result.intentionalDivergences);
```

### HistoryReviewAgent

Analyzes git history to understand why code evolved and whether files were intentionally left unchanged.

```typescript
import { HistoryReviewAgent } from '@buoy-design/agents';

const agent = new HistoryReviewAgent();
const result = await agent.execute({
  repo: { ... },
  files: [{ ... }],
  commits: [{ hash: '...', author: '...', date: new Date(), message: '...' }],
  blame: { 'Button.tsx': [...] }, // optional
  pullRequests: [...], // optional
});

console.log(result.narratives);
console.log(result.whyNotUpdated);
console.log(result.relatedPRs);
```

### AcceptanceAgent

Predicts PR acceptance likelihood and suggests optimal submission approach.

```typescript
import { AcceptanceAgent } from '@buoy-design/agents';

const agent = new AcceptanceAgent();
const result = await agent.execute({
  repo: { ... },
  files: [{ ... }],
  contributingGuide: '...',
  recentMergedPRs: [...],
});

console.log(result.prediction.likelihood); // 'high' | 'medium' | 'low' | 'unlikely'
console.log(result.prediction.suggestedApproach);
console.log(result.maintainerPreferences);
```

## Configuration

All agents accept optional configuration:

```typescript
const agent = new CodebaseReviewAgent({
  config: {
    model: 'claude-sonnet-4-20250514', // or 'claude-opus-4-20250514'
    maxTokens: 4096,
    temperature: 0.3,
    apiKey: 'sk-...', // or set ANTHROPIC_API_KEY env var
  },
});
```

## License

MIT
