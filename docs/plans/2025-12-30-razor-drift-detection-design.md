# Razor Drift Detection Design

## Overview

Enable Buoy to extract hardcoded design values from ASP.NET Razor templates, generate design tokens from existing patterns, and detect drift when new code diverges from established tokens.

**Target Project**: Lambgoat.Web (ASP.NET Razor with ~250 .cshtml files)

## Phase 1: Extraction

### Sources to Scan

1. **CSS Files**
   - `wwwroot/css/site.css` (primary stylesheet)
   - Any additional CSS files in wwwroot

2. **Razor Templates**
   - `Views/**/*.cshtml`
   - `Areas/**/*.cshtml`
   - `Pages/**/*.cshtml` (if present)
   - `Shared/**/*.cshtml`

### Values to Extract

| Category | Patterns | Examples |
|----------|----------|----------|
| Colors | `#rgb`, `#rrggbb`, `rgb()`, `rgba()`, `hsl()`, named colors | `#69c`, `#0077cc`, `rgb(255,191,0)` |
| Spacing | `px`, `rem`, `em` values in margin/padding/gap | `16px`, `1rem`, `24px` |
| Font Sizes | `font-size` declarations | `14px`, `0.875rem` |
| Border Radius | `border-radius` values | `12px`, `0.5rem` |
| Font Families | `font-family` declarations | `"Helvetica Neue", sans-serif` |

### Extraction Approach

```typescript
interface ExtractedValue {
  value: string;           // Raw value: "#69c"
  property: string;        // CSS property: "color"
  location: {
    file: string;          // "Views/Home/Index.cshtml"
    line: number;          // 42
    context: 'inline' | 'css' | 'style-block';
  };
  occurrences: number;     // How many times this exact value appears
}
```

**Inline Style Regex** (for Razor):
```regex
style\s*=\s*["']([^"']+)["']
```

**CSS Property Extraction**:
```regex
(color|background(?:-color)?|border(?:-color)?|fill|stroke):\s*([^;}\n]+)
(margin|padding|gap|top|right|bottom|left|width|height):\s*([^;}\n]+)
font-size:\s*([^;}\n]+)
border-radius:\s*([^;}\n]+)
```

## Phase 2: Tokenization

### Token Structure

Following design-system-skills conventions (OKLCH colors, t-shirt spacing):

```css
:root {
  /* Colors - 11-step scale (50-950) */
  --color-primary-500: oklch(55% 0.12 230);   /* base #69c */
  --color-primary-700: oklch(37% 0.10 230);   /* hover #0077cc */
  --color-neutral-50: oklch(97% 0 0);         /* light bg #f7f7f7 */
  --color-neutral-900: oklch(20% 0 0);        /* text #333 */
  --color-accent-500: oklch(80% 0.15 85);     /* gold #FFBF00 */

  /* Spacing - t-shirt sizes */
  --spacing-xs: 4px;    /* 0.25rem */
  --spacing-sm: 8px;    /* 0.5rem */
  --spacing-md: 16px;   /* 1rem */
  --spacing-lg: 24px;   /* 1.5rem */
  --spacing-xl: 40px;   /* 2.5rem */
  --spacing-2xl: 64px;  /* 4rem */

  /* Typography */
  --font-size-xs: 10px;
  --font-size-sm: 13px;
  --font-size-base: 14px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 12px;
  --radius-lg: 24px;
  --radius-full: 9999px;

  /* Semantic Aliases */
  --color-link: var(--color-primary-500);
  --color-link-hover: var(--color-primary-700);
  --color-text: var(--color-neutral-900);
  --color-bg: var(--color-neutral-50);
}
```

### Clustering Algorithm

1. **Group by property type** (colors, spacing, font-size, etc.)
2. **Cluster similar values**:
   - Colors: Delta E < 5 in OKLCH space
   - Spacing: Within 2px of each other
3. **Pick representative value** (most common in cluster)
4. **Assign token name** based on scale position

### Output

Generate `design-tokens.css` with extracted tokens:
```bash
buoy tokenize --output wwwroot/css/design-tokens.css
```

Also output JSON for tooling:
```json
{
  "colors": {
    "primary-500": { "value": "#69c", "oklch": "oklch(55% 0.12 230)", "occurrences": 47 }
  },
  "spacing": {
    "md": { "value": "16px", "occurrences": 123 }
  }
}
```

## Phase 3: Enforcement

### Drift Detection Rules

| Drift Type | Trigger | Severity |
|------------|---------|----------|
| `hardcoded-color` | Color value that matches a token | warning |
| `hardcoded-spacing` | Spacing value that matches a token | warning |
| `hardcoded-font-size` | Font size that matches a token | info |
| `unknown-value` | Value doesn't match any token | info |
| `deprecated-pattern` | Using old class/pattern | warning |

### Drift Signal Format

```typescript
interface DriftSignal {
  type: 'hardcoded-color' | 'hardcoded-spacing' | 'unknown-value' | ...;
  severity: 'info' | 'warning' | 'critical';
  location: {
    file: string;
    line: number;
    column: number;
  };
  found: string;           // "color: #0077cc"
  suggested?: string;      // "var(--color-primary-700)"
  message: string;
}
```

### CLI Output

```
$ buoy drift check

DRIFT REPORT - Lambgoat.Web
═══════════════════════════════════════════════════════════════

Views/Home/Index.cshtml:42
  ⚠ hardcoded-color: color: #0077cc
    → Use var(--color-primary-700)

Views/Shared/_Layout.cshtml:118
  ℹ unknown-spacing: margin: 17px
    → No matching token. Consider --spacing-md (16px) or --spacing-lg (24px)

wwwroot/css/site.css:256
  ⚠ hardcoded-spacing: padding: 16px
    → Use var(--spacing-md)

───────────────────────────────────────────────────────────────
Summary: 2 warnings, 1 info
```

### Enforcement Modes

Configure in `buoy.config.mjs`:

```javascript
export default {
  project: { name: 'Lambgoat.Web' },
  drift: {
    mode: 'warn',  // 'audit' | 'warn' | 'strict'
    severity: {
      'hardcoded-color': 'warning',
      'hardcoded-spacing': 'warning',
      'unknown-value': 'info',
    },
    ignore: [
      { type: 'hardcoded-color', pattern: '**/vendor/**' },
    ],
  },
};
```

| Mode | Behavior |
|------|----------|
| `audit` | Report all drift, exit 0 |
| `warn` | Report + exit 1 on critical |
| `strict` | Exit 1 on any warning or critical |

### CI Integration

```bash
# In GitHub Actions
- run: buoy ci --fail-on warning
```

GitHub PR comment (via `--github-comment`):
```markdown
## Buoy Drift Report

| File | Issue | Suggestion |
|------|-------|------------|
| Views/Home/Index.cshtml:42 | hardcoded-color `#0077cc` | `var(--color-primary-700)` |
```

## Implementation Plan

### Step 1: CSS Value Extractor
- Create `packages/scanners/src/css/value-extractor.ts`
- Parse CSS files and extract color/spacing/font values
- Return `ExtractedValue[]` with occurrence counts

### Step 2: Razor Inline Style Extractor
- Add `extractInlineStyles()` to template scanner
- Parse `style="..."` attributes in .cshtml files
- Merge with CSS extractions

### Step 3: Token Generator
- Create `packages/core/src/tokenization/generator.ts`
- Cluster similar values
- Output CSS custom properties and JSON

### Step 4: Drift Detector
- Extend `SemanticDiffEngine` to compare values against tokens
- Generate `DriftSignal` for hardcoded values with token matches

### Step 5: CLI Commands
- `buoy extract` - Show all hardcoded values found
- `buoy tokenize` - Generate tokens from extractions
- `buoy drift check` - Compare against established tokens

## Success Criteria

1. Running `buoy extract` on Lambgoat shows all inline styles and CSS values
2. Running `buoy tokenize` generates a valid `design-tokens.css`
3. Running `buoy drift check` reports hardcoded values that should use tokens
4. CI can block PRs with `buoy ci --fail-on warning`
