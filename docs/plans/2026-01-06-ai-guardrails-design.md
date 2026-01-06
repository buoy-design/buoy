# AI Guardrails for Design System Compliance

> **Date:** 2026-01-06
> **Status:** Design Specification
> **Goal:** Make Buoy an AI agent's best friend for design system compliance

---

## Executive Summary

This document defines a comprehensive feature set for keeping AI agents on track with design systems. The core insight: **AI needs guardrails, not just detection.** We provide guardrails through multiple channels:

1. **Skills** - Teach AI HOW to use the design system (progressive disclosure)
2. **MCP Server** - Provide runtime access to tokens, components, patterns
3. **CLAUDE.md Generation** - Embed design system rules in project context
4. **Sub Agents** - Specialized agents for design system tasks
5. **Tokens as Context** - Rich token format optimized for AI understanding
6. **Deterministic CI** - Exit codes that enforce compliance

---

## Feature Matrix

| Feature | Type | Status | AI Benefit |
|---------|------|--------|------------|
| `buoy skill export` | CLI | New | Generates portable design system skill |
| `buoy context` | CLI | New | Generates CLAUDE.md section for design system |
| MCP Server | Package | Planned | Real-time token/component queries |
| Token Context Format | Core | New | W3C-compatible tokens with intent |
| `buoy ci` exit codes | CLI | Exists | Deterministic CI validation |
| `buoy check` | CLI | Exists | Pre-commit hook validation |
| Sub Agents | Integration | New | Specialized design system agents |

---

## 1. Design System Skill (`buoy skill export`)

### Purpose

Generate a portable skill that teaches AI agents how to use the design system. Skills use **progressive disclosure** - loading context only when needed.

### Command

```bash
# Export skill to local project
buoy skill export --output .claude/skills/design-system/

# Export with specific sections
buoy skill export --sections tokens,components,patterns

# Export to global skills directory
buoy skill export --global
```

### Generated Structure

```
.claude/skills/design-system/
├── SKILL.md                    # Entry point, skill metadata
├── tokens/
│   ├── colors.md               # Color tokens with usage guidance
│   ├── spacing.md              # Spacing scale
│   ├── typography.md           # Font stacks, sizes, weights
│   └── _index.md               # Quick reference, when to dive deeper
├── components/
│   ├── _inventory.md           # All components, brief descriptions
│   ├── Button.md               # Deep dive: props, variants, examples
│   ├── Card.md
│   └── ...
├── patterns/
│   ├── _common.md              # Most-used patterns
│   ├── forms.md                # Form patterns
│   ├── navigation.md           # Nav patterns
│   └── danger-zone.md          # Destructive action patterns
├── anti-patterns/
│   ├── _avoid.md               # Things to never do
│   └── accessibility.md        # A11y violations to avoid
└── philosophy/
    └── principles.md           # The WHY behind decisions
```

### SKILL.md Template

```markdown
---
name: design-system
description: Use when building UI components, styling, or layouts
triggers:
  - building UI
  - styling components
  - adding colors
  - creating layouts
  - form design
---

# {Project Name} Design System

This skill provides design system context for AI code generation.

## Quick Start

1. **Before generating UI code**, check `components/_inventory.md`
2. **For styling**, use tokens from `tokens/_index.md`
3. **For patterns**, see `patterns/_common.md`

## Rules

1. NEVER hardcode colors - use tokens from `tokens/colors.md`
2. NEVER use arbitrary spacing - use scale from `tokens/spacing.md`
3. NEVER create new components without checking inventory first
4. ALWAYS follow accessibility patterns in `anti-patterns/accessibility.md`

## Progressive Loading

- Start with `_index.md` files for quick reference
- Load specific files when you need details
- The `_avoid.md` file lists what NEVER to do

## Feedback Loop

If you create something not in the design system:
1. Check if a similar component exists
2. If truly new, flag for design system team review
3. Use closest existing pattern as base

## Validation

Run `buoy check` before committing to validate compliance.
```

### Token File Format (tokens/colors.md)

```markdown
# Color Tokens

## Primary Colors

| Token | Value | Usage | Avoid |
|-------|-------|-------|-------|
| `color-primary` | #2563EB | Primary CTAs, submit buttons | Decorative use, backgrounds |
| `color-primary-hover` | #1D4ED8 | Hover state for primary elements | Non-interactive elements |

## Semantic Colors

| Token | Value | Intent | Usage |
|-------|-------|--------|-------|
| `color-success` | #059669 | Positive outcome | Confirmation, success messages |
| `color-error` | #DC2626 | Error, destructive | Errors, delete actions |
| `color-warning` | #D97706 | Caution needed | Warnings, pending states |

## When to Use What

- **Primary actions**: `color-primary` (one per section)
- **Confirmations**: `color-success` (not for CTAs)
- **Destructive**: `color-error` (always with confirmation pattern)

## Common Mistakes

❌ Using hex values directly: `style={{ color: '#2563EB' }}`
✅ Using token: `className="text-primary"` or `color={tokens.primary}`
```

---

## 2. CLAUDE.md Generation (`buoy context`)

### Purpose

Generate a design system section for the project's CLAUDE.md file. This embeds design system rules directly in the project context that Claude automatically reads.

### Command

```bash
# Generate CLAUDE.md section
buoy context --output stdout >> CLAUDE.md

# Generate and append automatically
buoy context --append

# Generate with specific detail level
buoy context --detail minimal|standard|comprehensive
```

### Generated Content

```markdown
## Design System Rules

This project uses the Acme Design System. Follow these rules:

### Component Usage

Use components from `@acme/ui`. Check before creating:
- Button, Card, Modal, Input, Select, Table, Tabs
- See full inventory: `buoy status --components`

### Token Requirements

**NEVER hardcode these values:**
- Colors: Use `tokens.color.*` or `text-*`/`bg-*` classes
- Spacing: Use `tokens.space.*` or spacing classes (p-4, gap-8)
- Typography: Use `tokens.font.*` or text classes

**Quick Reference:**
- Primary: `color-primary` (#2563EB)
- Error: `color-error` (#DC2626)
- Spacing scale: 0, 1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64

### Validation

Run before committing:
```bash
buoy check          # Quick validation
buoy drift check    # Detailed drift analysis
```

### Anti-Patterns

AVOID:
- `<div onClick>` - Use `<Button>` or `<button>`
- Inline styles for colors/spacing
- Creating component variants that exist
- Arbitrary Tailwind values (`p-[13px]`)
```

---

## 3. MCP Server (`@buoy-design/mcp`)

*(Detailed in AI Context Layer design, summarized here for completeness)*

### Purpose

Provide real-time design system context to AI tools via Model Context Protocol.

### Resources

| Resource | Description |
|----------|-------------|
| `tokens://all` | All design tokens with intent |
| `tokens://{category}` | Tokens by category |
| `components://inventory` | Component catalog |
| `components://{name}` | Component details |
| `patterns://all` | Pattern library |
| `antipatterns://all` | Things to avoid |

### Tools

| Tool | Purpose |
|------|---------|
| `find_component` | Find best component for use case |
| `validate_code` | Check code against design system |
| `resolve_token` | Find token for hardcoded value |
| `suggest_fix` | Get fix suggestion for drift |

### Claude Code Integration

```json
// .claude/settings.json
{
  "mcpServers": {
    "buoy": {
      "command": "npx",
      "args": ["@buoy-design/mcp", "serve"]
    }
  }
}
```

---

## 4. Token Context Format

### Purpose

Export tokens in a format optimized for AI understanding, following W3C DTCG standards with extended intent metadata.

### Command

```bash
# Export for AI consumption
buoy tokens export --format ai-context --output tokens.json

# Export as skill-compatible markdown
buoy tokens export --format skill-md --output ./tokens/
```

### AI Context Format

```json
{
  "$schema": "https://buoy.design/schemas/ai-context-tokens.json",
  "version": "1.0",
  "tokens": {
    "color": {
      "primary": {
        "$value": "#2563EB",
        "$type": "color",
        "$intent": {
          "hierarchy": "primary-action",
          "emotion": ["trust", "confidence"],
          "constraint": "one-per-screen"
        },
        "$usage": "Primary CTAs, submit buttons, links",
        "$avoid": "Decorative elements, backgrounds, text",
        "$examples": [
          "<Button variant=\"primary\">Submit</Button>",
          "className=\"text-primary\""
        ],
        "$substitutes": ["color-action", "color-brand"],
        "$deprecated": false
      }
    },
    "spacing": {
      "4": {
        "$value": "16px",
        "$type": "dimension",
        "$intent": {
          "relationship": "related-elements",
          "density": "standard"
        },
        "$usage": "Between related form fields, card padding",
        "$scale-position": 5,
        "$common-pairs": ["spacing-2", "spacing-8"]
      }
    }
  },
  "philosophy": {
    "principles": [
      {
        "name": "Clarity over cleverness",
        "meaning": "Prefer explicit patterns over abstractions",
        "implication": "Use semantic tokens, not arbitrary values"
      }
    ]
  }
}
```

---

## 5. Sub Agents

### Purpose

Specialized agents for design system tasks, invoked via Task tool.

### Agent Definitions

#### Design Validator Agent

```typescript
// Task: subagent_type = 'design-validator'
{
  description: "Validates code against design system",
  tools: ["Read", "Grep", "Glob", "Bash"],
  prompt: `
    Analyze the given code for design system compliance:
    1. Check for hardcoded color values (not tokens)
    2. Check for arbitrary spacing values
    3. Verify component usage matches inventory
    4. Flag accessibility anti-patterns

    Return structured findings with:
    - Issue location (file:line)
    - Issue type (token-violation, component-mismatch, etc.)
    - Suggested fix with design system alternative
  `
}
```

#### Token Advisor Agent

```typescript
// Task: subagent_type = 'token-advisor'
{
  description: "Suggests tokens for hardcoded values",
  tools: ["Read", "Grep"],
  prompt: `
    Given a hardcoded value, find the best matching token:
    1. Exact match in token catalog
    2. Closest match with similarity score
    3. Alternative tokens if no exact match
    4. Explanation of token intent
  `
}
```

#### Pattern Matcher Agent

```typescript
// Task: subagent_type = 'pattern-matcher'
{
  description: "Finds existing patterns for UI needs",
  tools: ["Read", "Grep", "Glob"],
  prompt: `
    Given a UI requirement:
    1. Search existing patterns in design system
    2. Find similar implementations in codebase
    3. Recommend pattern with usage example
    4. Note any customization needed
  `
}
```

---

## 6. Deterministic CI Checks

### Existing Features (Enhanced)

```bash
# CI command with strict exit codes
buoy ci --fail-on-new-drift

# Exit codes:
# 0 = No drift
# 1 = New drift detected
# 2 = Configuration error
```

### New CI Features

```bash
# Threshold-based failure
buoy ci --max-drift 10 --max-critical 0

# Format for CI parsing
buoy ci --format github-annotations

# Integration with PR comments
buoy ci --github-comment --github-token $TOKEN
```

### GitHub Action

```yaml
# .github/workflows/design-drift.yml
name: Design System Drift Check

on: [pull_request]

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: buoy-design/action@v1
        with:
          command: ci
          fail-on-new-drift: true
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

---

## 7. Feedback Loops

### Purpose

Enable AI to self-correct using Buoy validation.

### Pattern: Validate → Fix → Repeat

```typescript
// Skill instruction for AI
`
After generating UI code, validate with Buoy:

1. Run: buoy check path/to/file.tsx
2. If drift detected, read the suggestions
3. Apply fixes using design system tokens
4. Re-run: buoy check path/to/file.tsx
5. Repeat until no drift

Example:
$ buoy check src/Button.tsx
⚠ Hardcoded color #2563EB at line 15
  → Use token: color-primary

Fix: Change style={{ color: '#2563EB' }} to className="text-primary"
`
```

### AI-Friendly Output Mode

```bash
# Output optimized for AI parsing
buoy check --format ai-feedback
```

```json
{
  "file": "src/Button.tsx",
  "issues": [
    {
      "line": 15,
      "column": 10,
      "type": "hardcoded-color",
      "severity": "warning",
      "current": "#2563EB",
      "suggested": "color-primary",
      "fix": {
        "type": "replace",
        "old": "style={{ color: '#2563EB' }}",
        "new": "className=\"text-primary\""
      }
    }
  ],
  "summary": {
    "total": 1,
    "fixable": 1,
    "critical": 0
  }
}
```

---

## 8. Integration Touchpoints

### CLAUDE.md Auto-Update

```bash
# Hook to update CLAUDE.md when design system changes
buoy context --watch --append-to CLAUDE.md
```

### Pre-Commit Hook

```bash
# .husky/pre-commit
buoy check --staged --fail-on-critical
```

### IDE Integration

```json
// .vscode/settings.json
{
  "buoy.enableInlineHints": true,
  "buoy.showTokenSuggestions": true,
  "buoy.mcpServer.enabled": true
}
```

---

## Implementation Priority

### Phase 1: Foundation (Week 1-2)
1. `buoy skill export` - Generate portable skill
2. `buoy context` - Generate CLAUDE.md section
3. `buoy check --format ai-feedback` - AI-friendly output

### Phase 2: Context (Week 3-4)
4. Token context format with intent
5. Enhanced CI exit codes and thresholds
6. GitHub Action for PR comments

### Phase 3: Intelligence (Week 5-6)
7. MCP server basic resources
8. Sub agent definitions
9. Feedback loop documentation

### Phase 4: Polish (Week 7-8)
10. MCP server tools
11. IDE integrations
12. Watch mode and auto-update

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Drift Prevention Rate | 80% | Drift caught before commit vs after |
| AI Code Acceptance | 90% | % of AI code accepted first try |
| Token Usage | 95% | % of color/spacing using tokens |
| Skill Adoption | 50% | % of AI sessions using skill |

---

## Summary: The Guardrail Stack

```
┌─────────────────────────────────────────────────────────┐
│                    AI Agent Session                      │
├─────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │  Skill  │  │ CLAUDE  │  │   MCP   │  │   Sub   │    │
│  │ (Learn) │  │.md (See)│  │ (Query) │  │ Agents  │    │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘    │
│       │            │            │            │          │
│       └────────────┴─────┬──────┴────────────┘          │
│                          │                              │
│                    ┌─────▼─────┐                        │
│                    │ Generated │                        │
│                    │   Code    │                        │
│                    └─────┬─────┘                        │
│                          │                              │
│                    ┌─────▼─────┐                        │
│                    │buoy check │◄──── Feedback Loop     │
│                    └─────┬─────┘                        │
│                          │                              │
│              ┌───────────┼───────────┐                  │
│              │           │           │                  │
│         ┌────▼────┐ ┌────▼────┐ ┌────▼────┐            │
│         │  Pass   │ │  Fix &  │ │ Flag for│            │
│         │         │ │ Retry   │ │ Review  │            │
│         └─────────┘ └─────────┘ └─────────┘            │
├─────────────────────────────────────────────────────────┤
│                    CI/CD Pipeline                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │ buoy ci │──│ Exit    │──│ PR      │──│ Block   │    │
│  │         │  │ Codes   │  │ Comment │  │ Merge   │    │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## Appendix: Best Practices Summary

### For AI Agents

1. **Load the design system skill first** before generating UI
2. **Query MCP for components** before creating new ones
3. **Use tokens always** - never hardcode colors, spacing, typography
4. **Run validation** after generating code
5. **Self-correct** using Buoy feedback
6. **Flag unknowns** instead of inventing patterns

### For Design System Teams

1. **Keep CLAUDE.md updated** with `buoy context --append`
2. **Export skills** when design system changes
3. **Set CI thresholds** appropriate for team maturity
4. **Review flagged items** from AI submissions
5. **Document intent** not just values

### For Developers

1. **Install pre-commit hooks** for early feedback
2. **Use IDE integration** for inline hints
3. **Check before AI generates** that skill is loaded
4. **Review AI output** against design system
5. **Trust but verify** - AI + Buoy = confidence

---

*This specification defines Buoy's role as the AI agent's guardrail for design system compliance. Implementation should prioritize the skill and context generation features that provide immediate value with minimal infrastructure.*
