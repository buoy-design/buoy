# @buoy-design/core

Core domain models and drift detection engine for Buoy.

## Installation

```bash
npm install @buoy-design/core
```

## Usage

```typescript
import { SemanticDiffEngine } from '@buoy-design/core/analysis';
import { generateFixes } from '@buoy-design/core';
import type { Component, DriftSignal, Fix } from '@buoy-design/core';

// Analyze components for drift
const engine = new SemanticDiffEngine();
const result = engine.analyzeComponents(components, {
  checkDeprecated: true,
  checkNaming: true,
});

console.log(result.drifts); // DriftSignal[]

// Generate fixes for drift signals
const fixes = generateFixes(drifts, tokens);
console.log(fixes); // Fix[]
```

## Models

- **Component** - UI components from any framework
- **DesignToken** - Color, spacing, typography values
- **DriftSignal** - Detected inconsistencies
- **Fix** - Proposed fix with confidence score

## Confidence Levels

Fix suggestions include a confidence level:

| Level | Score | Meaning |
|-------|-------|---------|
| `exact` | 100% | Value exactly matches a design token |
| `high` | 95-99% | Very close match, safe to auto-apply |
| `medium` | 70-94% | Close match, review recommended |
| `low` | <70% | Ambiguous, manual review required |

## Links

- [Buoy CLI](https://www.npmjs.com/package/@buoy-design/cli)
- [Documentation](https://buoy.design/docs)
