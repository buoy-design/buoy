// packages/core/src/graph/queries.test.ts
import { describe, it, expect } from 'vitest';
import {
  createGraph,
  addNode,
  addEdge,
  type DesignSystemGraph,
} from './builder.js';
import {
  findTokenUsages,
  findUnusedTokens,
  findDriftingTokens,
  findComponentRenderers,
  findUntestedComponents,
  findUndocumentedComponents,
  analyzeImpact,
  findOwnership,
  findDriftAuthor,
  findRepeatOffenders,
  findDeprecatedUsages,
  findDriftInPR,
  findFilesChangedInPR,
  calculateCoverage,
} from './queries.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestGraph(): DesignSystemGraph {
  const graph = createGraph();

  // Add tokens
  addNode(graph, 'Token', 'primary', { name: 'colors.primary' });
  addNode(graph, 'Token', 'secondary', { name: 'colors.secondary' });
  addNode(graph, 'Token', 'spacing-md', { name: 'spacing.md' });
  addNode(graph, 'Token', 'deprecated-old', { name: 'colors.deprecated-old' });

  // Add components
  addNode(graph, 'Component', 'Button', { name: 'Button' });
  addNode(graph, 'Component', 'Card', { name: 'Card' });
  addNode(graph, 'Component', 'Modal', { name: 'Modal' });

  // Add files
  addNode(graph, 'File', 'Button.tsx', { name: 'src/components/Button.tsx' });
  addNode(graph, 'File', 'Card.tsx', { name: 'src/components/Card.tsx' });
  addNode(graph, 'File', 'Modal.tsx', { name: 'src/components/Modal.tsx' });

  // Add developers
  addNode(graph, 'Developer', 'alice', { name: 'Alice' });
  addNode(graph, 'Developer', 'bob', { name: 'Bob' });

  // Add commits
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  addNode(graph, 'Commit', 'abc123', {
    name: 'abc123',
    author: 'Alice',
    timestamp: yesterday,
  });
  addNode(graph, 'Commit', 'def456', {
    name: 'def456',
    author: 'Bob',
    timestamp: now,
  });

  // Add tests
  addNode(graph, 'Test', 'Button.test', { name: 'Button.test.tsx' });
  addNode(graph, 'Test', 'Card.test', { name: 'Card.test.tsx' });

  // Add stories
  addNode(graph, 'Story', 'Button.stories', { name: 'Button.stories.tsx' });

  // Token usages: primary used in Button and Card, secondary unused
  addEdge(graph, 'USES', 'file:Button.tsx', 'token:primary', {
    createdAt: now,
  });
  addEdge(graph, 'USES', 'file:Card.tsx', 'token:primary', {
    createdAt: now,
  });
  addEdge(graph, 'USES', 'file:Button.tsx', 'token:spacing-md', {
    createdAt: now,
  });

  // Deprecated token usage
  addEdge(graph, 'USES', 'file:Modal.tsx', 'token:deprecated-old', {
    createdAt: now,
  });

  // Component relationships: Modal renders Button
  addEdge(graph, 'RENDERS', 'component:Modal', 'component:Button', {
    createdAt: now,
  });

  // Test coverage: Button and Card tested, Modal untested
  addEdge(graph, 'TESTED_BY', 'component:Button', 'test:Button.test', {
    createdAt: now,
  });
  addEdge(graph, 'TESTED_BY', 'component:Card', 'test:Card.test', {
    createdAt: now,
  });

  // Story coverage: Only Button documented
  addEdge(graph, 'DOCUMENTED_BY', 'component:Button', 'story:Button.stories', {
    createdAt: now,
  });

  // Git history: Alice authored commit abc123
  addEdge(graph, 'AUTHORED', 'developer:alice', 'commit:abc123', {
    createdAt: yesterday,
  });
  addEdge(graph, 'CHANGED', 'commit:abc123', 'file:Button.tsx', {
    createdAt: yesterday,
  });

  // Bob authored commit def456
  addEdge(graph, 'AUTHORED', 'developer:bob', 'commit:def456', {
    createdAt: now,
  });
  addEdge(graph, 'CHANGED', 'commit:def456', 'file:Card.tsx', {
    createdAt: now,
  });

  return graph;
}

function createGraphWithDrift(): DesignSystemGraph {
  const graph = createTestGraph();

  // Add drift signals
  addNode(graph, 'DriftSignal', 'drift1', {
    name: 'hardcoded-value',
    severity: 'warning',
  });
  addNode(graph, 'DriftSignal', 'drift2', {
    name: 'hardcoded-value',
    severity: 'warning',
  });
  addNode(graph, 'DriftSignal', 'drift3', {
    name: 'hardcoded-value',
    severity: 'warning',
  });

  // drift1 and drift2 affect Button.tsx, drift3 affects Card.tsx
  addEdge(graph, 'AFFECTS', 'driftsignal:drift1', 'file:Button.tsx', {
    createdAt: new Date(),
  });
  addEdge(graph, 'AFFECTS', 'driftsignal:drift2', 'file:Button.tsx', {
    createdAt: new Date(),
  });
  addEdge(graph, 'AFFECTS', 'driftsignal:drift3', 'file:Card.tsx', {
    createdAt: new Date(),
  });

  // Add token drift
  addNode(graph, 'Token', 'drifting-token', { name: 'colors.primary-drift' });
  addEdge(graph, 'DRIFTS_FROM', 'token:drifting-token', 'token:primary', {
    createdAt: new Date(),
    expectedValue: '#3b82f6',
    actualValue: '#4f46e5',
  });

  return graph;
}

function createGraphWithPR(): DesignSystemGraph {
  const graph = createGraphWithDrift();

  // Add PR
  addNode(graph, 'PR', '123', { name: 'PR #123', title: 'Add new feature' });

  // PR includes commits
  addEdge(graph, 'INCLUDES', 'pr:123', 'commit:abc123', {
    createdAt: new Date(),
  });
  addEdge(graph, 'INCLUDES', 'pr:123', 'commit:def456', {
    createdAt: new Date(),
  });

  // Drift flagged in PR
  addEdge(graph, 'FLAGGED_IN', 'driftsignal:drift1', 'pr:123', {
    createdAt: new Date(),
  });
  addEdge(graph, 'FLAGGED_IN', 'driftsignal:drift2', 'pr:123', {
    createdAt: new Date(),
  });

  return graph;
}

// ============================================================================
// Token Queries
// ============================================================================

describe('findTokenUsages', () => {
  it('finds all usages of a token', () => {
    const graph = createTestGraph();
    const result = findTokenUsages(graph, 'primary');

    expect(result.usageCount).toBe(2);
    expect(result.usedIn).toHaveLength(2);
    expect(result.usedIn.map((u) => u.file)).toContain('src/components/Button.tsx');
    expect(result.usedIn.map((u) => u.file)).toContain('src/components/Card.tsx');
  });

  it('returns zero usages for unused token', () => {
    const graph = createTestGraph();
    const result = findTokenUsages(graph, 'secondary');

    expect(result.usageCount).toBe(0);
    expect(result.usedIn).toHaveLength(0);
  });

  it('returns zero usages for non-existent token', () => {
    const graph = createTestGraph();
    const result = findTokenUsages(graph, 'non-existent');

    expect(result.usageCount).toBe(0);
    expect(result.usedIn).toHaveLength(0);
  });

  it('accepts token IDs with or without prefix', () => {
    const graph = createTestGraph();
    const result1 = findTokenUsages(graph, 'primary');
    const result2 = findTokenUsages(graph, 'token:primary');

    expect(result1.usageCount).toBe(result2.usageCount);
  });
});

describe('findUnusedTokens', () => {
  it('finds tokens with no usages', () => {
    const graph = createTestGraph();
    const unused = findUnusedTokens(graph);

    expect(unused).toContain('token:secondary');
    expect(unused).not.toContain('token:primary');
  });

  it('returns empty array when all tokens are used', () => {
    const graph = createGraph();
    addNode(graph, 'Token', 'used', { name: 'colors.used' });
    addNode(graph, 'File', 'App.tsx', { name: 'App.tsx' });
    addEdge(graph, 'USES', 'file:App.tsx', 'token:used', { createdAt: new Date() });

    const unused = findUnusedTokens(graph);
    expect(unused).toHaveLength(0);
  });

  it('returns empty array when no tokens exist', () => {
    const graph = createGraph();
    const unused = findUnusedTokens(graph);

    expect(unused).toHaveLength(0);
  });
});

describe('findDriftingTokens', () => {
  it('finds tokens that drift from expected values', () => {
    const graph = createGraphWithDrift();
    const drifting = findDriftingTokens(graph);

    expect(drifting).toHaveLength(1);
    expect(drifting[0]?.tokenId).toBe('token:drifting-token');
    expect(drifting[0]?.expectedValue).toBe('#3b82f6');
    expect(drifting[0]?.actualValue).toBe('#4f46e5');
  });

  it('returns empty array when no tokens drift', () => {
    const graph = createTestGraph();
    const drifting = findDriftingTokens(graph);

    expect(drifting).toHaveLength(0);
  });
});

// ============================================================================
// Component Queries
// ============================================================================

describe('findComponentRenderers', () => {
  it('finds components that render a given component', () => {
    const graph = createTestGraph();
    const renderers = findComponentRenderers(graph, 'Button');

    expect(renderers).toContain('component:Modal');
    expect(renderers).toHaveLength(1);
  });

  it('returns empty array for component with no renderers', () => {
    const graph = createTestGraph();
    const renderers = findComponentRenderers(graph, 'Card');

    expect(renderers).toHaveLength(0);
  });

  it('returns empty array for non-existent component', () => {
    const graph = createTestGraph();
    const renderers = findComponentRenderers(graph, 'NonExistent');

    expect(renderers).toHaveLength(0);
  });

  it('accepts component IDs with or without prefix', () => {
    const graph = createTestGraph();
    const result1 = findComponentRenderers(graph, 'Button');
    const result2 = findComponentRenderers(graph, 'component:Button');

    expect(result1).toEqual(result2);
  });
});

describe('findUntestedComponents', () => {
  it('finds components without test coverage', () => {
    const graph = createTestGraph();
    const untested = findUntestedComponents(graph);

    expect(untested).toContain('component:Modal');
    expect(untested).not.toContain('component:Button');
    expect(untested).not.toContain('component:Card');
  });

  it('returns empty array when all components are tested', () => {
    const graph = createGraph();
    addNode(graph, 'Component', 'Comp', { name: 'Comp' });
    addNode(graph, 'Test', 'Comp.test', { name: 'Comp.test.tsx' });
    addEdge(graph, 'TESTED_BY', 'component:Comp', 'test:Comp.test', {
      createdAt: new Date(),
    });

    const untested = findUntestedComponents(graph);
    expect(untested).toHaveLength(0);
  });
});

describe('findUndocumentedComponents', () => {
  it('finds components without Storybook documentation', () => {
    const graph = createTestGraph();
    const undocumented = findUndocumentedComponents(graph);

    expect(undocumented).toContain('component:Card');
    expect(undocumented).toContain('component:Modal');
    expect(undocumented).not.toContain('component:Button');
  });

  it('returns empty array when all components are documented', () => {
    const graph = createGraph();
    addNode(graph, 'Component', 'Comp', { name: 'Comp' });
    addNode(graph, 'Story', 'Comp.stories', { name: 'Comp.stories.tsx' });
    addEdge(graph, 'DOCUMENTED_BY', 'component:Comp', 'story:Comp.stories', {
      createdAt: new Date(),
    });

    const undocumented = findUndocumentedComponents(graph);
    expect(undocumented).toHaveLength(0);
  });
});

// ============================================================================
// Impact Analysis
// ============================================================================

describe('analyzeImpact', () => {
  it('analyzes direct and transitive dependents', () => {
    const graph = createTestGraph();
    const impact = analyzeImpact(graph, 'token:primary');

    expect(impact.directDependents).toContain('file:Button.tsx');
    expect(impact.directDependents).toContain('file:Card.tsx');
    expect(impact.affectedFiles).toContain('file:Button.tsx');
    expect(impact.affectedFiles).toContain('file:Card.tsx');
  });

  it('calculates risk level based on impact', () => {
    const graph = createTestGraph();
    const lowImpact = analyzeImpact(graph, 'token:secondary');
    expect(lowImpact.riskLevel).toBe('low');

    const mediumImpact = analyzeImpact(graph, 'token:primary');
    expect(mediumImpact.riskLevel).toBe('low'); // Only 2 dependents
  });

  it('returns low risk for non-existent entity', () => {
    const graph = createTestGraph();
    const impact = analyzeImpact(graph, 'non-existent');

    expect(impact.riskLevel).toBe('low');
    expect(impact.directDependents).toHaveLength(0);
    expect(impact.transitiveDependents).toHaveLength(0);
  });

  it('respects maxDepth parameter', () => {
    const graph = createTestGraph();
    const impact = analyzeImpact(graph, 'component:Button', 1);

    expect(impact.directDependents).toContain('component:Modal');
  });
});

// ============================================================================
// Ownership Queries
// ============================================================================

describe('findOwnership', () => {
  it('identifies file ownership from git history', () => {
    const graph = createTestGraph();
    const ownership = findOwnership(graph, 'file:Button.tsx');

    expect(ownership).not.toBeNull();
    expect(ownership?.primaryAuthor).toBe('Alice');
    expect(ownership?.totalCommits).toBe(1);
  });

  it('returns null for entity with no history', () => {
    const graph = createTestGraph();
    const ownership = findOwnership(graph, 'file:Modal.tsx');

    expect(ownership).toBeNull();
  });

  it('returns null for non-existent entity', () => {
    const graph = createTestGraph();
    const ownership = findOwnership(graph, 'non-existent');

    expect(ownership).toBeNull();
  });

  it('ranks contributors by commit count', () => {
    const graph = createGraph();
    const now = new Date();

    addNode(graph, 'File', 'App.tsx', { name: 'App.tsx' });
    addNode(graph, 'Developer', 'alice', { name: 'Alice' });
    addNode(graph, 'Developer', 'bob', { name: 'Bob' });

    // Alice has more commits
    addNode(graph, 'Commit', 'c1', { name: 'c1', author: 'Alice', timestamp: now });
    addNode(graph, 'Commit', 'c2', { name: 'c2', author: 'Alice', timestamp: now });
    addNode(graph, 'Commit', 'c3', { name: 'c3', author: 'Bob', timestamp: now });

    addEdge(graph, 'CHANGED', 'commit:c1', 'file:App.tsx', { createdAt: now });
    addEdge(graph, 'CHANGED', 'commit:c2', 'file:App.tsx', { createdAt: now });
    addEdge(graph, 'CHANGED', 'commit:c3', 'file:App.tsx', { createdAt: now });

    const ownership = findOwnership(graph, 'file:App.tsx');
    expect(ownership?.primaryAuthor).toBe('Alice');
    expect(ownership?.totalCommits).toBe(3);
  });
});

describe('findDriftAuthor', () => {
  it('identifies who introduced drift', () => {
    const graph = createGraphWithDrift();
    const author = findDriftAuthor(graph, 'drift1');

    expect(author).toBe('developer:alice');
  });

  it('returns null for drift with no author', () => {
    const graph = createGraph();
    addNode(graph, 'DriftSignal', 'orphan-drift', {
      name: 'orphan',
      severity: 'info',
    });

    const author = findDriftAuthor(graph, 'orphan-drift');
    expect(author).toBeNull();
  });

  it('returns null for non-existent drift', () => {
    const graph = createTestGraph();
    const author = findDriftAuthor(graph, 'non-existent');

    expect(author).toBeNull();
  });
});

// ============================================================================
// Pattern Detection
// ============================================================================

describe('findRepeatOffenders', () => {
  it('finds files with multiple drift signals', () => {
    const graph = createGraphWithDrift();
    const offenders = findRepeatOffenders(graph, 2);

    expect(offenders).toHaveLength(1);
    expect(offenders[0]?.file).toBe('file:Button.tsx');
    expect(offenders[0]?.driftCount).toBe(2);
  });

  it('respects threshold parameter', () => {
    const graph = createGraphWithDrift();
    const highThreshold = findRepeatOffenders(graph, 5);

    expect(highThreshold).toHaveLength(0);
  });

  it('sorts by drift count descending', () => {
    const graph = createGraphWithDrift();

    // Add more drift to Card
    addNode(graph, 'DriftSignal', 'drift4', {
      name: 'naming',
      severity: 'info',
    });
    addNode(graph, 'DriftSignal', 'drift5', {
      name: 'naming',
      severity: 'info',
    });
    addEdge(graph, 'AFFECTS', 'driftsignal:drift4', 'file:Card.tsx', {
      createdAt: new Date(),
    });
    addEdge(graph, 'AFFECTS', 'driftsignal:drift5', 'file:Card.tsx', {
      createdAt: new Date(),
    });

    const offenders = findRepeatOffenders(graph, 1);
    expect(offenders[0]?.file).toBe('file:Card.tsx');
    expect(offenders[0]?.driftCount).toBe(3);
  });
});

describe('findDeprecatedUsages', () => {
  it('finds deprecated tokens still in use', () => {
    const graph = createTestGraph();
    const deprecated = findDeprecatedUsages(graph);

    expect(deprecated).toHaveLength(1);
    expect(deprecated[0]?.token).toBe('token:deprecated-old');
    expect(deprecated[0]?.usageCount).toBe(1);
    expect(deprecated[0]?.usedIn).toContain('src/components/Modal.tsx');
  });

  it('returns empty array when no deprecated tokens are used', () => {
    const graph = createGraph();
    addNode(graph, 'Token', 'deprecated-unused', {
      name: 'colors.deprecated-unused',
    });

    const deprecated = findDeprecatedUsages(graph);
    expect(deprecated).toHaveLength(0);
  });

  it('detects deprecation from name patterns', () => {
    const graph = createGraph();
    addNode(graph, 'File', 'App.tsx', { name: 'App.tsx' });

    // Deprecated by name prefix
    addNode(graph, 'Token', '_old', { name: '_oldColor' });
    addEdge(graph, 'USES', 'file:App.tsx', 'token:_old', {
      createdAt: new Date(),
    });

    const deprecated = findDeprecatedUsages(graph);
    expect(deprecated).toHaveLength(1);
  });
});

// ============================================================================
// PR Analysis
// ============================================================================

describe('findDriftInPR', () => {
  it('finds drift signals flagged in a PR', () => {
    const graph = createGraphWithPR();
    const drift = findDriftInPR(graph, '123');

    expect(drift).toHaveLength(2);
    expect(drift).toContain('driftsignal:drift1');
    expect(drift).toContain('driftsignal:drift2');
  });

  it('returns empty array for PR with no drift', () => {
    const graph = createGraph();
    addNode(graph, 'PR', 'clean-pr', { name: 'PR #999', title: 'Clean PR' });

    const drift = findDriftInPR(graph, 'clean-pr');
    expect(drift).toHaveLength(0);
  });

  it('returns empty array for non-existent PR', () => {
    const graph = createTestGraph();
    const drift = findDriftInPR(graph, 'non-existent');

    expect(drift).toHaveLength(0);
  });

  it('accepts PR IDs with or without prefix', () => {
    const graph = createGraphWithPR();
    const result1 = findDriftInPR(graph, '123');
    const result2 = findDriftInPR(graph, 'pr:123');

    expect(result1).toEqual(result2);
  });
});

describe('findFilesChangedInPR', () => {
  it('finds files changed in a PR', () => {
    const graph = createGraphWithPR();
    const files = findFilesChangedInPR(graph, '123');

    expect(files).toContain('file:Button.tsx');
    expect(files).toContain('file:Card.tsx');
  });

  it('returns empty array for PR with no commits', () => {
    const graph = createGraph();
    addNode(graph, 'PR', 'empty-pr', { name: 'PR #999', title: 'Empty PR' });

    const files = findFilesChangedInPR(graph, 'empty-pr');
    expect(files).toHaveLength(0);
  });

  it('returns empty array for non-existent PR', () => {
    const graph = createTestGraph();
    const files = findFilesChangedInPR(graph, 'non-existent');

    expect(files).toHaveLength(0);
  });
});

// ============================================================================
// Coverage Queries
// ============================================================================

describe('calculateCoverage', () => {
  it('calculates token coverage', () => {
    const graph = createTestGraph();
    const coverage = calculateCoverage(graph);

    // primary, spacing-md, and deprecated-old used (3/4 = 0.75)
    // secondary unused
    expect(coverage.tokenCoverage).toBe(0.75);
  });

  it('calculates test coverage', () => {
    const graph = createTestGraph();
    const coverage = calculateCoverage(graph);

    // Button and Card tested, Modal untested (2/3 = 0.666...)
    expect(coverage.testCoverage).toBeCloseTo(2 / 3, 2);
  });

  it('calculates story coverage', () => {
    const graph = createTestGraph();
    const coverage = calculateCoverage(graph);

    // Only Button has stories (1/3 = 0.333...)
    expect(coverage.storyCoverage).toBeCloseTo(1 / 3, 2);
  });

  it('returns 1.0 when no tokens/components exist', () => {
    const graph = createGraph();
    const coverage = calculateCoverage(graph);

    expect(coverage.tokenCoverage).toBe(1);
    expect(coverage.componentCoverage).toBe(1);
    expect(coverage.testCoverage).toBe(1);
    expect(coverage.storyCoverage).toBe(1);
  });

  it('component coverage is always 1.0', () => {
    const graph = createTestGraph();
    const coverage = calculateCoverage(graph);

    expect(coverage.componentCoverage).toBe(1);
  });
});
