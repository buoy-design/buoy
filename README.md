# Buoy

**Design drift detection for the AI era.**

AI tools like Copilot and Claude generate code fast—but they don't know your design system. Buoy scans your codebase and catches design drift before it ships.

```
$ buoy ci

Buoy CI Report
==============
Scanned: 15 components
Drift signals: 3 (1 critical, 2 warning)

CRITICAL
  Button: Hardcoded color #3b82f6 (src/Button.tsx:42)

WARNING
  Card: Uses deprecated 'size' prop (src/Card.tsx:18)
  Modal: Naming inconsistency (src/Modal.tsx:1)

Exit code: 1 (critical issues found)
```

## What It Detects

- **Hardcoded values** — `#ff0000` instead of `var(--primary)`
- **Naming inconsistencies** — Detects outliers based on YOUR project's patterns
- **Duplicate components** — `ButtonNew`, `ButtonV2`, `ButtonOld`
- **Prop type mismatches** — `onClick: Function` vs `onClick: () => void`
- **Framework sprawl** — Multiple UI frameworks in one codebase
- **Accessibility gaps** — Missing aria-labels on interactive components
- **Deprecated patterns** — Components marked `@deprecated` still in use

## Quick Start

```bash
# Install
npm install -g @buoy/cli

# Initialize in your project (auto-detects frameworks)
buoy init

# Check for drift
buoy drift check

# Run in CI (exits non-zero on critical issues)
buoy ci
```

## Supported Frameworks

**Component Scanning:**
- React / Next.js / Remix / Gatsby
- Vue / Nuxt
- Svelte / SvelteKit
- Angular
- Web Components (Lit, Stencil)
- Server templates (Blade, ERB, Twig, Jinja)

**Token Sources:**
- CSS variables
- SCSS variables
- Tailwind config
- JSON design tokens
- Style Dictionary
- Tokens Studio

**Design Systems Detected:**
Chakra UI, MUI, Ant Design, Radix, shadcn/ui, Mantine, Bootstrap, Tailwind, and more.

## Commands

| Command | Description |
|---------|-------------|
| `buoy init` | Auto-detect project and generate config |
| `buoy scan` | Scan components and tokens |
| `buoy status` | Visual coverage grid |
| `buoy drift check` | Detailed drift signals |
| `buoy ci` | CI-optimized output with exit codes |
| `buoy plugins` | List installed and suggested plugins |
| `buoy build` | Generate design tokens with AI |

## Configuration

After `buoy init`, customize `buoy.config.mjs`:

```js
export default {
  project: {
    name: 'my-app',
  },
  sources: {
    react: {
      enabled: true,
      include: ['src/components/**/*.tsx'],
      exclude: ['**/*.test.*', '**/*.stories.*'],
    },
    tokens: {
      enabled: true,
      files: ['src/styles/tokens.json'],
    },
  },
};
```

## CI Integration

Run Buoy in your CI pipeline to catch drift before it merges:

```bash
# Basic CI check (exits 1 on critical issues)
buoy ci

# JSON output for custom processing
buoy ci --json

# Strict mode (exits 1 on any warning)
buoy ci --strict

# GitHub PR comments (coming soon)
buoy ci --github-token $TOKEN --github-repo owner/repo --github-pr 123
```

**Exit Codes:**
- `0` — No critical issues
- `1` — Critical issues found (or warnings in strict mode)

**GitHub Actions Example:**

```yaml
# .github/workflows/buoy.yml
name: Design Drift Check
on: [pull_request]

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx buoy ci
```

## Plugin System

Buoy uses plugins for scanning and reporting. Plugins are auto-discovered based on your project.

```bash
# See installed and suggested plugins
buoy plugins

# Install a plugin
npm install @buoy/plugin-react
```

**Available Plugins:**
- `@buoy/plugin-react` — React/JSX component scanning
- `@buoy/plugin-vue` — Vue SFC scanning (coming soon)
- `@buoy/plugin-github` — GitHub PR comments (coming soon)

## Output Formats

```bash
# Default table output
buoy drift check

# JSON for CI/scripts
buoy drift check --json

# Markdown for docs/reports
buoy drift check --markdown

# Filter by severity
buoy drift check --severity critical
```

## Documentation

- [Features](./FEATURES.md) — All detection features
- [Integrations](./docs/INTEGRATIONS.md) — Framework & tool support
- [Roadmap](./docs/ROADMAP.md) — Planned features

## Why "Buoy"?

Like a buoy in the water, Buoy signals when something is drifting off course. It helps design systems stay anchored while teams move fast.

## License

MIT
