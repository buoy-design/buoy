# Buoy

**Design drift detection for the AI era.**

AI tools like Copilot and Claude generate code fast—but they don't know your design system. Buoy scans your codebase and catches design drift before it ships.

```
$ buoy status

Component Alignment

⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛀ ⛀ ⛀   47/62 components · 76% aligned
⛀ ⛀ ⛀ ⛀ ⛀ ⛀ ⛶ ⛶ ⛶ ⛶
⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ Aligned: 47 (76%)
⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛀ Drifting: 10 (16%)
                          ⛶ Untracked: 5 (8%)
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

# Initialize in your project
buoy init

# See coverage at a glance
buoy status

# Get detailed drift signals
buoy drift check
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

## Output Formats

```bash
# Default table output
buoy drift check

# JSON for CI/scripts
buoy drift check --json

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
