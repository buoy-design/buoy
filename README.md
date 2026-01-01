# Buoy

**ESLint tells you a color is hardcoded. Buoy tells you which token it should be.**

Buoy is a design drift detection tool. It catches when developers (or AI tools like Copilot/Claude) use hardcoded values instead of your design system tokens—and tells you exactly which token to use.

```
src/Button.tsx:24
  #3b82f6 → Use var(--color-primary) instead (92% match)
```

## What is "Drift"?

**Drift** is when code diverges from your design system. Examples:

| What You Wrote | What You Should Write | Drift Type |
|----------------|----------------------|------------|
| `color: #3b82f6` | `color: var(--color-primary)` | Hardcoded value |
| `padding: 17px` | `padding: var(--spacing-md)` | Arbitrary spacing |
| `<ButtonNew>` | `<Button>` | Naming inconsistency |
| `className="p-[13px]"` | `className="p-4"` | Tailwind arbitrary value |

**Aligned** means your code uses design system tokens. **Drifting** means it doesn't.

## Quick Start (2 minutes)

```bash
# Install nothing. Just run it.
npx @buoy-design/cli status
```

That's it. Buoy auto-detects your framework and shows your alignment score.

## Tutorial: From Drift to Aligned

### Step 1: You have a component with hardcoded values

```tsx
// src/components/Button.tsx
export function Button({ children }) {
  return (
    <button style={{
      backgroundColor: '#3b82f6',  // Hardcoded color
      padding: '8px 16px',         // Hardcoded spacing
      borderRadius: '4px'          // Hardcoded radius
    }}>
      {children}
    </button>
  );
}
```

### Step 2: Run `buoy status` to see the overview

```bash
$ npx @buoy-design/cli status

Component Alignment
                                        47/52 components · 90% aligned
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛀ ⛁ ⛁
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛀
...

✓ Good alignment. Minor drift to review.
```

### Step 3: Run `buoy drift check` to see specific issues

```bash
$ npx @buoy-design/cli drift check

━━━ WARNING (3) ━━━

! Hardcoded Value
  Component:  Button
  Location:   src/components/Button.tsx:5
  Issue:      Using hardcoded color #3b82f6
  Suggestion: Use var(--color-primary) (92% match)

! Hardcoded Value
  Component:  Button
  Location:   src/components/Button.tsx:6
  Issue:      Using hardcoded spacing 8px 16px
  Suggestion: Use var(--spacing-sm) var(--spacing-md)

! Hardcoded Value
  Component:  Button
  Location:   src/components/Button.tsx:7
  Issue:      Using hardcoded radius 4px
  Suggestion: Use var(--radius-sm) (100% match)
```

### Step 4: Don't have tokens? Generate them from your code

```bash
$ npx @buoy-design/cli tokens

Token Generation
────────────────
Files scanned: 47
Values found: 156
Tokens generated: 42

✓ Created design-tokens.css
```

This extracts all your hardcoded values and creates a token file:

```css
/* design-tokens.css */
:root {
  --color-primary: #3b82f6;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --radius-sm: 4px;
}
```

### Step 5: Update your component to use tokens

```tsx
// src/components/Button.tsx
export function Button({ children }) {
  return (
    <button style={{
      backgroundColor: 'var(--color-primary)',
      padding: 'var(--spacing-sm) var(--spacing-md)',
      borderRadius: 'var(--radius-sm)'
    }}>
      {children}
    </button>
  );
}
```

### Step 6: Run again — 100% aligned

```bash
$ npx @buoy-design/cli status

Component Alignment
                                        52/52 components · 100% aligned
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁
...

✓ Perfect alignment!
```

## Which Command Should I Use?

### Getting Started
| Command | When to Use |
|---------|-------------|
| `buoy status` | Quick health check — start here |
| `buoy init` | Save config so your team uses the same settings |

### Finding Issues
| Command | When to Use |
|---------|-------------|
| `buoy drift check` | Detailed report with fix suggestions (local dev) |
| `buoy ci` | CI pipelines — posts to GitHub PRs, returns exit codes |
| `buoy check` | Pre-commit hooks — fast, fails on critical only |

### Fixing Issues
| Command | When to Use |
|---------|-------------|
| `buoy tokens` | Generate design tokens from your existing code |
| `buoy baseline` | Accept current drift, only flag NEW issues going forward |

## What It Detects

| Drift Type | Example |
|------------|---------|
| **Hardcoded values** | `#ff0000` instead of `var(--color-primary)` |
| **Tailwind arbitrary values** | `p-[17px]` instead of `p-4` |
| **Naming inconsistencies** | `ButtonNew`, `ButtonV2`, `ButtonOld` in same codebase |
| **Value divergence** | Code says `#3b82f6`, Figma says `#2563eb` |
| **Framework sprawl** | React + Vue + jQuery mixed together |
| **Deprecated patterns** | Using components marked `@deprecated` |

## Zero-Config vs Saved Config

**Zero-config mode** works immediately — Buoy auto-detects your framework.

**Why save config with `buoy init`?**
- Team consistency — everyone scans the same paths
- Custom excludes — ignore test files, generated code
- Figma integration — connect to your design tool
- Faster CI — config is cached, no re-detection

```bash
# Works without config
npx @buoy-design/cli status

# Save config when ready
npx @buoy-design/cli init
```

## CI Integration

```bash
# Basic — exits 1 on critical issues only
buoy ci

# Strict — exits 1 on any warning
buoy ci --fail-on warning

# Post results to GitHub PR
buoy ci --github-token $TOKEN --github-repo owner/repo --github-pr $PR_NUMBER
```

**GitHub Actions:**

```yaml
name: Design Drift
on: [pull_request]

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx @buoy-design/cli ci
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Supported Frameworks

**Components:** React, Vue, Svelte, Angular, Lit, Stencil, Alpine, HTMX

**Templates:** Blade, ERB, Twig, Razor, Jinja, Handlebars, EJS, Pug

**Tokens:** CSS variables, SCSS, Tailwind config, JSON, Style Dictionary

**Design Tools:** Figma (optional, requires API key)

## Configuration

After running `buoy init`:

```js
// buoy.config.mjs
export default {
  project: { name: 'my-app' },
  sources: {
    react: {
      enabled: true,
      include: ['src/**/*.tsx'],
      exclude: ['**/*.test.*'],
    },
    tokens: {
      enabled: true,
      files: ['design-tokens.css'],
    },
  },
};
```

## Philosophy

**Buoy informs by default, blocks by choice.**

```bash
buoy status                  # Just show me (default)
buoy ci                      # Comment on PR, don't fail
buoy ci --fail-on critical   # Fail only on critical
buoy ci --fail-on warning    # Strict mode
```

Teams climb the enforcement ladder when they're ready.

## Documentation

- [CLAUDE.md](./CLAUDE.md) — Development guide
- [docs/ROADMAP.md](./docs/ROADMAP.md) — Planned features

## License

MIT
