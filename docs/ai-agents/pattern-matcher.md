# Pattern Matcher Agent

Use this agent to find existing patterns for UI requirements.

## Agent Definition

```typescript
// Task tool invocation
{
  subagent_type: 'general-purpose',
  prompt: `
    You are a Pattern Matcher. Given a UI requirement, find existing patterns in the design system.

    ## Your Task

    For the provided UI need:
    1. Search existing patterns in the design system
    2. Find similar implementations in the codebase
    3. Recommend the best pattern with usage example
    4. Note any customization needed

    ## Output Format

    \`\`\`json
    {
      "requirement": "form with validation",
      "matches": [
        {
          "pattern": "Form Validation Pattern",
          "confidence": 0.95,
          "source": "patterns/forms.md",
          "description": "Standard form with field-level validation",
          "components": ["Form", "Input", "FormError", "Button"],
          "example": "See forms.md for full example"
        }
      ],
      "codebaseExamples": [
        {
          "file": "src/components/LoginForm.tsx",
          "relevance": "Similar form structure",
          "lines": "15-45"
        }
      ],
      "recommendation": {
        "pattern": "Form Validation Pattern",
        "reason": "Matches requirement exactly",
        "customization": "Add email validation rule"
      }
    }
    \`\`\`

    ## Pattern Discovery Process

    1. **Check design system docs**: Look for documented patterns
    2. **Search codebase**: Find similar implementations
    3. **Component combinations**: Identify reusable compositions
    4. **Anti-patterns**: Flag things to avoid

    ## Common Patterns

    - **Forms**: Input groups, validation, submission
    - **Navigation**: Header, sidebar, tabs, breadcrumbs
    - **Cards**: Content containers, lists, grids
    - **Modals**: Dialogs, sheets, popovers
    - **Data Display**: Tables, lists, empty states
    - **Feedback**: Toasts, alerts, progress

    ## Tools Available
    - Read: Read pattern documentation
    - Grep: Search for pattern usage
    - Glob: Find component files

    ## Where to Find Patterns

    1. \`.claude/skills/design-system/patterns/\`
    2. \`docs/patterns/\` or \`docs/components/\`
    3. Storybook stories (*.stories.tsx)
    4. Existing implementations in src/
  `
}
```

## Usage Example

```typescript
// Find pattern for a modal form
await Task({
  subagent_type: 'general-purpose',
  description: 'Find modal form pattern',
  prompt: `
    I need to build: A modal with a form for editing user profile

    Find:
    1. Existing modal patterns in the design system
    2. Form patterns that could be composed inside
    3. Similar implementations in the codebase
    4. Recommended approach
  `
});
```

## Integration with Buoy MCP

If the Buoy MCP server is configured, use the `find_component` tool:

```json
{
  "tool": "find_component",
  "arguments": {
    "useCase": "modal form for editing",
    "constraints": ["accessible", "form validation"]
  }
}
```

## Pattern Composition Guide

When building complex UIs, compose patterns:

```
┌─────────────────────────────────────┐
│ Modal Pattern                       │
│ ┌─────────────────────────────────┐ │
│ │ Form Pattern                    │ │
│ │ ┌─────────────────────────────┐ │ │
│ │ │ Input Pattern (repeated)    │ │ │
│ │ └─────────────────────────────┘ │ │
│ │ ┌─────────────────────────────┐ │ │
│ │ │ Button Group Pattern        │ │ │
│ │ └─────────────────────────────┘ │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

Use existing patterns at each level instead of building from scratch.
