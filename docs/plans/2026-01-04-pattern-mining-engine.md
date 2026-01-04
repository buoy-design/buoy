# Pattern Mining Engine Design

> Transform the scanner from a detection tool into a design system intelligence engine that understands, explains, and tracks design systems without AI assistance.

**Date:** 2026-01-04
**Status:** Draft
**Scope:** Core scanner architecture enhancement

---

## Executive Summary

The Pattern Mining Engine is a multi-pass inference system that transforms raw codebase signals into a complete, self-documenting model of any design system. It produces both machine-queryable data and human-readable explanations.

**Key differentiators:**
- **Three-layer knowledge system**: Built-in industry knowledge + User configuration + Self-learned patterns
- **Confidence scoring**: Every detected pattern has explainable confidence with evidence
- **Full-stack detection**: Value-level → Component-level → System-level patterns
- **No AI required**: The engine itself can explain the design system completely

---

## Architecture Overview

### Multi-Pass Inference Pipeline

```
Pass 1: Signal Extraction
    ↓
Pass 2: Pattern Clustering
    ↓
Pass 3: Knowledge Layer Scoring
    ↓
Pass 4: Conflict Resolution & Model Building
    ↓
Pass 5: Explanation Generation
    ↓
DesignSystemIntelligence (output)
```

Each pass has a single responsibility. Knowledge layers are consulted in Pass 3, and self-learning happens by promoting high-confidence discoveries back into the learned layer.

### Why This Architecture

- **Clear separation of concerns** - Each pass is testable and debuggable in isolation
- **Explicit knowledge layer ordering** - Decisions are explainable ("config overrode builtin because...")
- **Self-learning is discrete** - Not magic, but a well-defined promotion mechanism
- **Incremental execution** - Can run passes independently for fast re-scans

---

## Pass 1: Signal Extraction

**Purpose:** Extract every atomic signal from the codebase into a normalized format. No interpretation yet—just raw facts.

### Signal Schema

```typescript
interface RawSignal {
  id: string
  type: SignalType
  value: unknown
  location: SourceLocation
  context: SignalContext
  metadata: Record<string, unknown>
}

type SignalType =
  | 'color-value'      // #fff, rgb(), hsl(), named
  | 'spacing-value'    // 8px, 1rem, 0.5em
  | 'font-size'        // 14px, 1.25rem
  | 'font-family'      // "Inter", sans-serif
  | 'font-weight'      // 400, 600, bold
  | 'radius-value'     // 4px, 0.5rem
  | 'shadow-value'     // box-shadow definitions
  | 'breakpoint'       // @media queries, responsive modifiers
  | 'token-definition' // --color-primary: #000
  | 'token-usage'      // var(--color-primary)
  | 'component-def'    // function Button()
  | 'component-usage'  // <Button size="lg" />
  | 'prop-pattern'     // size="lg" appears 47 times
  | 'class-pattern'    // "flex items-center" appears together

interface SignalContext {
  fileType: 'tsx' | 'css' | 'config' | 'json' | 'scss'
  framework: 'react' | 'vue' | 'tailwind' | 'vanilla' | null
  scope: 'global' | 'component' | 'inline'
  isTokenized: boolean  // uses var() or token reference
}

interface SourceLocation {
  path: string
  line: number
  column?: number
  snippet?: string
}
```

### Key Insight

Signals carry context. A `#fff` in a CSS variable definition is different from `#fff` inline in a component. The context determines how it's scored later.

### Integration with Existing Scanners

Existing scanners become signal emitters:
- **ReactScanner** → emits `component-def`, `component-usage`, `color-value` (from hardcoded detection)
- **TailwindScanner** → emits `class-pattern`, `spacing-value`, `breakpoint`
- **CssScanner** → emits `color-value`, `spacing-value`, `token-definition`
- **TokenScanner** → emits `token-definition`, `token-usage`

---

## Pass 2: Pattern Clustering

**Purpose:** Group signals into candidate patterns using statistical analysis. No scoring yet—just "here's what clusters together."

### Candidate Pattern Schema

```typescript
interface CandidatePattern {
  id: string
  type: PatternType
  level: 'value' | 'component' | 'system'
  signals: RawSignal[]           // the signals that formed this pattern
  statistics: PatternStats
  hypothesis: PatternHypothesis  // what we THINK this pattern means
}

type PatternType =
  // Value-level
  | 'color-palette'        // cluster of related colors
  | 'spacing-scale'        // recurring spacing values
  | 'type-scale'           // font size progression
  | 'radius-scale'         // border radius values
  // Component-level
  | 'component-composition'  // A always contains B
  | 'prop-vocabulary'        // these prop values always appear together
  | 'class-bundle'           // these classes always appear together
  // System-level
  | 'grid-system'           // detected base unit + multipliers
  | 'color-system'          // HSL ramps, semantic naming
  | 'responsive-system'     // breakpoint patterns
  | 'naming-convention'     // BEM, atomic, etc.

interface PatternStats {
  occurrences: number
  coverage: number          // % of codebase using this pattern
  variance: number          // how consistent are the values
  distribution: number[]    // frequency histogram
  outliers: RawSignal[]     // signals that almost fit but don't
}

interface PatternHypothesis {
  description: string       // "8px base grid with 2x scaling"
  formula?: string          // "n * 8 where n ∈ [1,2,3,4,6,8,12]"
  relatedTo?: string[]      // other pattern IDs this might connect to
}
```

### Clustering Algorithms by Pattern Type

| Pattern Type | Algorithm |
|---|---|
| `spacing-scale` | K-means on px values, detect multiplier relationships |
| `color-palette` | HSL clustering (group by hue, detect lightness ramps) |
| `type-scale` | Ratio detection (1.25, 1.333, 1.5 scales are common) |
| `component-composition` | Co-occurrence matrix, association rules |
| `class-bundle` | Frequent itemset mining (Apriori-style) |
| `grid-system` | GCD detection + multiplier validation |

---

## Pass 3: Knowledge Layer Scoring

**Purpose:** Score each candidate pattern against three knowledge layers. Each layer votes, producing a confidence score with an explanation trail.

### Scored Pattern Schema

```typescript
interface ScoredPattern extends CandidatePattern {
  scores: LayerScores
  confidence: number           // 0-100, weighted aggregate
  explanation: ScoreExplanation
}

interface LayerScores {
  builtin: LayerScore    // Industry knowledge
  config: LayerScore     // User overrides
  learned: LayerScore    // Self-discovered from this codebase
}

interface LayerScore {
  score: number          // 0-100
  weight: number         // how much this layer matters for this pattern
  matchedRules: string[] // which rules fired
  conflicts: string[]    // rules that contradict
}

interface ScoreExplanation {
  summary: string        // "High confidence 8px grid system"
  reasoning: string[]    // ["Matches Material Design convention", "94% of values are multiples", "User config confirms 8px base"]
  dissent: string[]      // ["3 outlier values don't fit: 17px, 23px, 5px"]
}
```

### The Three Knowledge Layers

#### Layer 1: Built-in Industry Knowledge

Ships with the engine. Contains definitions for major design systems:

```typescript
const BUILTIN_SYSTEMS: DesignSystemDefinition[] = [
  {
    id: 'tailwind',
    name: 'Tailwind CSS',
    source: 'https://tailwindcss.com',
    grid: {
      base: 4,
      scale: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96],
      tolerance: 0
    },
    colors: {
      type: 'hsl-ramps',
      rampSteps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
    },
    typography: {
      scaleType: 'fixed',
      sizes: [12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96, 128]
    },
    signatures: [
      { type: 'class-pattern', pattern: /^(sm|md|lg|xl|2xl):/, weight: 0.9 },
      { type: 'spacing', pattern: [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96], weight: 0.8 },
      { type: 'file-structure', pattern: /tailwind\.config\.(js|ts|cjs|mjs)$/, weight: 1.0 },
    ]
  },
  {
    id: 'material',
    name: 'Material Design 3',
    source: 'https://m3.material.io',
    grid: { base: 8, scale: [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16], tolerance: 0 },
    colors: { type: 'hsl-ramps', rampSteps: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100] },
    // ...
  },
  // carbon, primer, chakra, radix, ant, spectrum, polaris, etc.
]
```

#### Layer 2: User Configuration

User overrides from `buoy.config.js`:

```typescript
interface UserKnowledge {
  source: 'buoy.config.js' | 'buoy.config.json' | '.buoyrc'

  system?: string | null        // 'tailwind' | 'custom' | null (auto-detect)

  grid?: {
    base: number
    tolerance?: number
    scale?: number[]
  }

  colors?: {
    primitives?: Record<string, string>
    semanticMapping?: Record<string, string>
    rampPattern?: number[]
  }

  typography?: {
    scale?: number[] | { ratio: number, base: number }
    families?: Record<string, string[]>
  }

  spacing?: {
    base?: number
    scale?: number[]
    aliases?: Record<string, number>
  }

  naming?: {
    tokens?: RegExp | string
    components?: RegExp | string
    files?: Record<string, RegExp>
  }

  rules?: CustomRule[]

  ignore?: {
    files?: string[]
    patterns?: string[]
    tokens?: string[]
  }
}
```

#### Layer 3: Learned Knowledge

Self-discovered from the codebase:

```typescript
interface LearnedKnowledge {
  learnedAt: Date
  codebaseHash: string          // detect if codebase changed

  confirmedPatterns: ConfirmedPattern[]
  derivedRules: DerivedRule[]

  conventions: {
    naming: LearnedNamingConvention
    fileStructure: LearnedFileStructure
    componentPatterns: LearnedComponentPattern[]
  }

  systemAffinity: {
    system: string              // 'tailwind' | 'material' | 'custom'
    confidence: number
    divergences: Divergence[]   // where it differs
  }
}
```

### Scoring Logic

```typescript
function scorePattern(pattern: CandidatePattern, layers: KnowledgeLayers): ScoredPattern {
  const builtin = scoreAgainstBuiltin(pattern, layers.builtin)
  const config = scoreAgainstConfig(pattern, layers.config)
  const learned = scoreAgainstLearned(pattern, layers.learned)

  // Config overrides builtin when present
  // Learned confirms or challenges both
  const weights = {
    builtin: config.score > 0 ? 0.2 : 0.4,  // diminish if user configured
    config: config.score > 0 ? 0.5 : 0,      // high weight when present
    learned: 0.3,                             // always contributes
  }

  const confidence =
    (builtin.score * weights.builtin) +
    (config.score * weights.config) +
    (learned.score * weights.learned)

  return {
    ...pattern,
    scores: { builtin, config, learned },
    confidence,
    explanation: buildExplanation(builtin, config, learned, confidence)
  }
}
```

### Key Insight

The layers don't just add—they can *conflict*. If builtin says "8px grid" but learned says "your codebase actually uses 6px," the explanation captures that: "Detected 6px grid (diverges from Material Design convention)."

---

## Pass 4: Conflict Resolution & Model Building

**Purpose:** Resolve competing patterns, eliminate duplicates, establish relationships, and build the unified design system model.

### Conflict Types

```typescript
type ConflictType =
  | 'value-overlap'        // two scales claim the same values
  | 'hierarchy-ambiguity'  // is this primitive or semantic?
  | 'naming-collision'     // same name, different values
  | 'scope-conflict'       // global vs component-scoped
  | 'inheritance-unclear'  // which pattern is parent?
```

### Resolution Strategies

```typescript
type ResolutionStrategy =
  | 'confidence-wins'      // higher confidence score wins
  | 'specificity-wins'     // more specific pattern wins
  | 'coverage-wins'        // more widely used pattern wins
  | 'recency-wins'         // more recently modified wins
  | 'merge'                // combine into unified pattern
  | 'hierarchy'            // one becomes child of other
  | 'flag-for-review'      // can't decide, mark as ambiguous
```

### Resolution Rules

```typescript
const RESOLUTION_RULES: ResolutionRule[] = [
  {
    conflict: 'value-overlap',
    resolve: (a, b) => {
      // If one is subset of other, establish hierarchy
      if (isSubset(a.signals, b.signals)) return { strategy: 'hierarchy', parent: b, child: a }
      if (isSubset(b.signals, a.signals)) return { strategy: 'hierarchy', parent: a, child: b }
      // Otherwise, higher coverage wins
      return a.statistics.coverage > b.statistics.coverage
        ? { strategy: 'coverage-wins', winner: a }
        : { strategy: 'coverage-wins', winner: b }
    }
  },
  {
    conflict: 'hierarchy-ambiguity',
    resolve: (a, b) => {
      const aLevel = inferTokenLevel(a)  // primitive | semantic | component
      const bLevel = inferTokenLevel(b)
      if (aLevel !== bLevel) return { strategy: 'hierarchy', parent: lowerLevel, child: higherLevel }
      return { strategy: 'flag-for-review', reasoning: 'Cannot determine token hierarchy' }
    }
  },
  {
    conflict: 'naming-collision',
    resolve: (a, b) => {
      if (a.context.scope === 'global' && b.context.scope !== 'global')
        return { strategy: 'specificity-wins', winner: a }
      return { strategy: 'flag-for-review', reasoning: 'Same name in same scope with different values' }
    }
  }
]
```

### Model Assembly

The model isn't just a bag of patterns—it establishes **relationships**:

```typescript
interface DesignSystemModel {
  foundations: {
    grid: GridSystem | null
    color: ColorSystem | null
    typography: TypographySystem | null
    spacing: SpacingSystem | null
    radius: RadiusSystem | null
    shadow: ShadowSystem | null
    motion: MotionSystem | null
  }

  tokens: {
    primitives: Token[]
    semantic: Token[]
    component: Token[]
    relationships: TokenRelationship[]  // primitive -> semantic -> component
  }

  components: {
    inventory: Component[]
    compositions: CompositionPattern[]
    propVocabulary: PropPattern[]
  }

  conventions: {
    naming: NamingConvention
    fileStructure: FilePattern[]
    responsive: ResponsiveSystem | null
  }

  anomalies: Anomaly[]

  metadata: {
    filesAnalyzed: number
    signalsExtracted: number
    patternsDetected: number
    conflictsResolved: number
    reviewNeeded: Resolution[]
  }
}
```

---

## Pass 5: Explanation Generation

**Purpose:** Transform the structured model into natural language explanations at multiple levels of detail. The engine should be able to *teach* someone the design system.

### Explanation Output Schema

```typescript
interface SystemExplanation {
  executive: ExecutiveSummary        // 2-3 paragraphs, high-level
  sections: SectionExplanation[]     // deep-dive per foundation
  glossary: GlossaryEntry[]          // every term defined
  warnings: AnnotatedWarning[]       // issues with context
  queries: QueryableExplanation      // on-demand explanations
}
```

### Executive Summary Generation

Template-driven with slot filling:

```typescript
const EXECUTIVE_TEMPLATES = {
  overview: `This design system {{gridConfidence > 80 ? "follows" : "partially follows"}} a {{grid.base}}px grid system.
    The color palette uses {{colorSystem.type}} with {{colorSystem.ramps.length}} color ramps.
    Typography is based on {{typeScale.name || "a custom"}} scale with {{typeScale.sizes.length}} sizes.`,

  strengths: [
    { condition: (m) => m.foundations.grid?.confidence > 90,
      template: "Highly consistent {{grid.base}}px grid ({{grid.confidence}}% of spacing values conform)" },
    { condition: (m) => m.tokens.relationships.length > 0,
      template: "Clear token hierarchy with {{tokens.relationships.length}} defined relationships" },
  ],

  concerns: [
    { condition: (m) => m.anomalies.length > 10,
      template: "{{anomalies.length}} values don't fit detected patterns and may indicate drift" },
  ]
}
```

### Section Explanations

```typescript
interface SectionExplanation {
  foundation: string          // "Color System", "Spacing", etc.
  confidence: number
  summary: string             // 1-2 sentences
  details: DetailBlock[]      // expandable sections
  evidence: EvidenceBlock[]   // "here's proof"
  suggestions: string[]       // "consider also..."
}

interface EvidenceBlock {
  claim: string              // "Your grid uses 8px base"
  proof: string              // "Found 847 spacing values, 794 are multiples of 8"
  sources: SourceLocation[]  // where we found this
  counterevidence?: string   // "However, 53 values break this pattern"
}
```

### Example Generated Output

```markdown
## Color System

**Confidence: 91%**

Your color system uses HSL-based color ramps with 11 steps per hue.
This matches the Tailwind CSS convention (50-950 scale).

### Detected Palette

| Hue     | Range          | Usage Count | Primary Use |
|---------|----------------|-------------|-------------|
| Blue    | #EFF6FF → #1E3A8A | 234      | Primary actions, links |
| Gray    | #F9FAFB → #111827 | 892      | Text, backgrounds |
| Red     | #FEF2F2 → #7F1D1D | 67       | Errors, destructive |

### Token Hierarchy

```
Primitives          →  Semantic           →  Component
blue-500 (#3B82F6)  →  primary            →  button-primary-bg
gray-900 (#111827)  →  foreground         →  text-default
red-500 (#EF4444)   →  destructive        →  button-danger-bg
```

### Evidence

We detected this pattern because:
- 94% of color values map to one of 6 hue families
- Lightness values cluster at 11 consistent steps
- Naming follows `{hue}-{lightness}` convention in 89% of tokens

### Concerns

- 12 hardcoded colors in `/src/legacy/` don't use tokens
- `accent` color (#8B5CF6) appears 23 times but isn't in the formal palette
```

### Queryable Explanations

```typescript
interface QueryableExplanation {
  explainToken(tokenId: string): TokenExplanation
  explainComponent(componentId: string): ComponentExplanation
  explainAnomaly(anomalyId: string): AnomalyExplanation
  explainRelationship(from: string, to: string): RelationshipExplanation
  compareToSystem(systemName: string): ComparisonExplanation

  // Natural language queries (rule-based, no AI)
  query(question: string): QueryResponse
  // "Why is this color not tokenized?" → looks up anomaly, explains
  // "What uses the primary token?" → traces usage graph
  // "How does our grid compare to Material?" → runs comparison
}
```

### Key Insight

Explanations aren't post-hoc descriptions—they're *traceable*. Every claim links back to evidence. "Your grid is 8px" isn't an opinion; it's "794 of 847 values are multiples of 8, here are the files."

---

## Knowledge Base Schema

### Layer 1: Built-in Industry Knowledge

```typescript
interface BuiltinKnowledge {
  version: string
  systems: DesignSystemDefinition[]
  rules: UniversalRule[]
  vocabulary: DesignVocabulary
}

interface DesignSystemDefinition {
  id: string                    // 'tailwind' | 'material' | 'carbon' | etc.
  name: string
  source: string                // URL to official docs

  grid: {
    base: number
    scale: number[]
    tolerance: number
  }

  colors: {
    type: 'hsl-ramps' | 'rgb-palette' | 'semantic-only'
    rampSteps?: number[]
    hues?: string[]
    semanticNames?: string[]
  }

  typography: {
    scaleType: 'ratio' | 'fixed' | 'fluid'
    ratio?: number
    sizes?: number[]
    weights?: number[]
    lineHeights?: number[]
  }

  spacing: {
    base: number
    scale: number[]
    namedSteps?: Record<string, number>
  }

  radius: {
    scale: number[]
    namedSteps?: Record<string, number>
  }

  breakpoints: {
    values: Record<string, number>
    approach: 'mobile-first' | 'desktop-first'
  }

  naming: {
    tokens: 'kebab-case' | 'camelCase' | 'dot-notation'
    components: 'PascalCase'
    variants: RegExp
  }

  signatures: PatternSignature[]  // unique identifiers for this system
}

interface PatternSignature {
  type: 'spacing' | 'color' | 'class-pattern' | 'file-structure'
  pattern: RegExp | number[] | string[]
  weight: number                 // how indicative is this?
}
```

### Universal Rules

Apply regardless of detected system:

```typescript
const UNIVERSAL_RULES: UniversalRule[] = [
  {
    id: 'spacing-divisibility',
    description: 'Spacing values should be divisible by a consistent base',
    applies: (s) => s.type === 'spacing-value',
    score: (s, ctx) => {
      const value = parseFloat(s.value)
      const bases = [4, 8, 6, 5, 10]
      for (const base of bases) {
        if (value % base === 0) return { score: 100, matchedBase: base }
      }
      return { score: 20, reason: 'Not divisible by common bases' }
    }
  },
  {
    id: 'color-contrast-accessibility',
    description: 'Foreground/background pairs should meet WCAG contrast',
    applies: (s) => s.type === 'color-value' && s.context.scope === 'component',
    score: (s, ctx) => {
      // Check contrast ratios against WCAG AA (4.5:1) or AAA (7:1)
    }
  },
  {
    id: 'type-scale-ratio',
    description: 'Font sizes should follow a mathematical ratio',
    applies: (s) => s.type === 'font-size',
    score: (s, ctx) => {
      // Check if size fits common ratios (1.125, 1.2, 1.25, 1.333, 1.5, 1.618)
    }
  },
  {
    id: 'token-naming-semantic',
    description: 'Token names should describe purpose, not value',
    applies: (s) => s.type === 'token-definition',
    score: (s, ctx) => {
      // "blue-500" = low score (describes value)
      // "primary" = high score (describes purpose)
      // "button-primary-bg" = highest score (purpose + context)
    }
  }
]
```

### Design Vocabulary

Canonical terms and their aliases:

```typescript
const VOCABULARY: DesignVocabulary = {
  terms: {
    'primary': {
      canonical: 'primary',
      aliases: ['brand', 'main', 'accent', 'action'],
      category: 'color',
      description: 'The main brand or action color'
    },
    'foreground': {
      canonical: 'foreground',
      aliases: ['fg', 'text', 'on-surface', 'content'],
      category: 'color',
      description: 'Text and icon color on a surface'
    },
    'muted': {
      canonical: 'muted',
      aliases: ['subtle', 'secondary', 'quiet', 'subdued'],
      category: 'color',
      description: 'De-emphasized content'
    },
    // ... 50+ terms
  }
}
```

### Layer 2: User Configuration

From `buoy.config.js`:

```typescript
interface UserKnowledge {
  source: 'buoy.config.js' | 'buoy.config.json' | '.buoyrc'

  system?: string | null

  grid?: {
    base: number
    tolerance?: number
    scale?: number[]
  }

  colors?: {
    primitives?: Record<string, string>
    semanticMapping?: Record<string, string>
    rampPattern?: number[]
  }

  typography?: {
    scale?: number[] | { ratio: number, base: number }
    families?: Record<string, string[]>
  }

  spacing?: {
    base?: number
    scale?: number[]
    aliases?: Record<string, number>
  }

  naming?: {
    tokens?: RegExp | string
    components?: RegExp | string
    files?: Record<string, RegExp>
  }

  rules?: CustomRule[]

  ignore?: {
    files?: string[]
    patterns?: string[]
    tokens?: string[]
  }
}
```

### Layer 3: Learned Knowledge

Self-discovered from the codebase:

```typescript
interface LearnedKnowledge {
  learnedAt: Date
  codebaseHash: string

  confirmedPatterns: ConfirmedPattern[]
  derivedRules: DerivedRule[]

  conventions: {
    naming: LearnedNamingConvention
    fileStructure: LearnedFileStructure
    componentPatterns: LearnedComponentPattern[]
  }

  systemAffinity: {
    system: string
    confidence: number
    divergences: Divergence[]
  }
}

interface ConfirmedPattern {
  pattern: ScoredPattern
  confirmedAt: Date
  confirmationSource: 'high-confidence' | 'user-approved' | 'repeated-detection'
  usageCount: number
}

interface DerivedRule {
  id: string
  description: string           // auto-generated
  derivedFrom: string[]         // pattern IDs that led to this
  confidence: number
  predicate: (signal: RawSignal) => boolean
  expectedValue: unknown
}

// Example derived rule:
// If 90% of Button components use 'rounded-md', derive:
// { description: "Buttons should use rounded-md", predicate: isButton, expectedValue: 'rounded-md' }
```

### Knowledge Merge Strategy

```typescript
function mergeKnowledge(
  builtin: BuiltinKnowledge,
  config: UserKnowledge,
  learned: LearnedKnowledge
): MergedKnowledge {

  // Precedence: config > learned > builtin
  // But learned can WARN if it conflicts with config

  const merged: MergedKnowledge = {
    grid: config.grid
      ?? learned.confirmedPatterns.find(p => p.pattern.type === 'grid-system')?.pattern
      ?? detectFromBuiltin(builtin, 'grid'),
    conflicts: []
  }

  // Detect conflicts between layers
  if (config.grid && learned.systemAffinity.system) {
    const builtinSystem = builtin.systems.find(s => s.id === learned.systemAffinity.system)
    if (builtinSystem && config.grid.base !== builtinSystem.grid.base) {
      merged.conflicts.push({
        type: 'config-vs-detected',
        description: `Config specifies ${config.grid.base}px grid but codebase resembles ${builtinSystem.name} (${builtinSystem.grid.base}px)`,
        recommendation: 'Verify intentional divergence or update config'
      })
    }
  }

  return merged
}
```

### Key Insight

The knowledge base isn't static—it *grows*. Each scan can promote high-confidence discoveries into `LearnedKnowledge`, making subsequent scans faster and more accurate. The engine gets smarter the more it runs.

---

## Output Model Schema

### Complete Output Interface

```typescript
interface DesignSystemIntelligence {
  // Metadata
  meta: IntelligenceMeta

  // Machine-readable model
  model: DesignSystemModel

  // Human-readable explanations
  documentation: SystemDocumentation

  // Queryable interface
  queries: QueryEngine

  // Serialization
  toJSON(): string
  toMarkdown(): string
  toHTML(): string
  diff(other: DesignSystemIntelligence): IntelligenceDiff
}
```

### Meta Block

```typescript
interface IntelligenceMeta {
  version: string
  generatedAt: Date
  generatedBy: string

  source: {
    path: string
    gitCommit?: string
    gitBranch?: string
  }

  stats: {
    filesScanned: number
    signalsExtracted: number
    patternsDetected: number
    patternsConfirmed: number
    conflictsResolved: number
    anomaliesFound: number
    duration: number
  }

  confidence: {
    overall: number
    byFoundation: Record<string, number>
    lowConfidenceAreas: string[]
  }

  systemAffinity: {
    primary: string
    confidence: number
    secondaryInfluences: Array<{ system: string; confidence: number }>
    divergences: Divergence[]
  }
}
```

### Foundations Schema

```typescript
interface Foundations {
  grid: GridFoundation | null
  color: ColorFoundation | null
  typography: TypographyFoundation | null
  spacing: SpacingFoundation | null
  radius: RadiusFoundation | null
  shadow: ShadowFoundation | null
  motion: MotionFoundation | null
  breakpoints: BreakpointFoundation | null
}

interface GridFoundation {
  confidence: number
  base: number
  unit: 'px' | 'rem'
  scale: number[]
  formula?: string
  adherence: number
  violations: Violation[]
  evidence: Evidence[]
}

interface ColorFoundation {
  confidence: number
  type: 'hsl-ramps' | 'rgb-palette' | 'oklch' | 'mixed'

  primitives: ColorPrimitive[]
  ramps: ColorRamp[]
  semantics: SemanticColor[]

  characteristics: {
    hueCount: number
    stepsPerRamp: number
    lightnessRange: [number, number]
    saturationPattern: 'consistent' | 'varied' | 'desaturated-edges'
  }

  accessibility: {
    wcagAACompliant: number
    wcagAAACompliant: number
    issues: AccessibilityIssue[]
  }

  evidence: Evidence[]
}

interface TypographyFoundation {
  confidence: number

  scale: {
    type: 'ratio' | 'custom'
    ratio?: number
    ratioName?: string
    sizes: TypeSize[]
  }

  families: FontFamily[]
  weights: number[]
  lineHeights: number[]
  letterSpacing: number[]
  textStyles: TextStyle[]

  evidence: Evidence[]
}

interface SpacingFoundation {
  confidence: number
  base: number
  unit: 'px' | 'rem'

  scale: SpacingStep[]

  usage: {
    padding: Record<string, number>
    margin: Record<string, number>
    gap: Record<string, number>
  }

  evidence: Evidence[]
}
```

### Token System Schema

```typescript
interface TokenSystem {
  primitives: Token[]
  semantic: Token[]
  component: Token[]

  relationships: TokenRelationship[]
  graph: TokenGraph

  coverage: {
    total: number
    used: number
    orphaned: Token[]
    missing: MissingToken[]
  }
}

interface Token {
  id: string
  name: string
  category: 'color' | 'spacing' | 'typography' | 'radius' | 'shadow' | 'motion' | 'other'
  level: 'primitive' | 'semantic' | 'component'

  value: {
    raw: string
    resolved: string
    references?: string[]
  }

  source: SourceLocation

  usage: {
    count: number
    locations: SourceLocation[]
    usedBy: string[]
  }

  metadata: {
    deprecated?: boolean
    documentation?: string
    tags?: string[]
  }
}

interface TokenRelationship {
  from: string
  to: string
  type: 'references' | 'derives' | 'overrides' | 'aliases'
}

interface TokenGraph {
  nodes: Token[]
  edges: TokenRelationship[]

  roots: Token[]
  leaves: Token[]
  clusters: TokenCluster[]

  getAncestors(tokenId: string): Token[]
  getDescendants(tokenId: string): Token[]
  getRelated(tokenId: string): Token[]
}
```

### Component System Schema

```typescript
interface ComponentSystem {
  inventory: Component[]
  compositions: CompositionPattern[]
  propVocabulary: PropVocabulary
  variants: VariantSystem
}

interface Component {
  id: string
  name: string

  source: {
    type: 'react' | 'vue' | 'svelte' | 'angular' | 'web-component'
    path: string
    line: number
    exportName: string
  }

  props: ComponentProp[]

  tokens: {
    uses: string[]
    hardcoded: HardcodedValue[]
  }

  dependencies: {
    components: string[]
    external: string[]
  }

  variants: ComponentVariant[]

  usage: {
    count: number
    locations: SourceLocation[]
    usagePatterns: UsagePattern[]
  }

  metadata: {
    deprecated?: boolean
    documentation?: string
    figmaNodeId?: string
    storybookId?: string
  }
}

interface CompositionPattern {
  id: string
  name: string
  confidence: number

  components: Array<{
    componentId: string
    role: 'container' | 'child' | 'optional'
    position?: 'first' | 'last' | 'any'
  }>

  rules: string[]
  occurrences: number
  examples: SourceLocation[]
}
```

### Query Engine

```typescript
interface QueryEngine {
  // Token queries
  getToken(id: string): Token | null
  findTokens(filter: TokenFilter): Token[]
  getTokenUsage(id: string): UsageReport
  getTokenAncestry(id: string): Token[]

  // Component queries
  getComponent(id: string): Component | null
  findComponents(filter: ComponentFilter): Component[]
  getComponentTokens(id: string): Token[]
  getComponentDependencies(id: string): DependencyTree

  // Pattern queries
  getPattern(id: string): Pattern
  findPatterns(type: PatternType): Pattern[]
  explainPattern(id: string): PatternExplanation

  // Cross-cutting queries
  findUsagesOf(value: string): SourceLocation[]
  findViolationsOf(rule: string): Violation[]
  findSimilarTo(value: unknown): Array<{ value: unknown; similarity: number }>

  // Natural language (rule-based, no AI)
  ask(question: string): QueryResponse
}

interface QueryResponse {
  question: string
  answer: string
  confidence: number
  sources: SourceLocation[]
  relatedQueries: string[]
}
```

### Diff Support

```typescript
interface IntelligenceDiff {
  from: IntelligenceMeta
  to: IntelligenceMeta

  summary: {
    tokensAdded: number
    tokensRemoved: number
    tokensModified: number
    componentsAdded: number
    componentsRemoved: number
    patternsChanged: number
    anomaliesNew: number
    anomaliesResolved: number
  }

  changes: Change[]

  impact: {
    breakingChanges: Change[]
    driftTrend: 'improving' | 'stable' | 'degrading'
    coverageChange: number
  }
}
```

---

## Usage Examples

### Basic Scan

```typescript
const intelligence = await scanner.analyze('/path/to/codebase')

// Check overall confidence
console.log(intelligence.meta.confidence.overall)  // 87

// Get the detected grid system
const grid = intelligence.model.foundations.grid
console.log(`${grid.base}px grid, ${grid.adherence}% adherence`)

// Find all anomalies
intelligence.model.anomalies.forEach(a => {
  console.log(`${a.severity}: ${a.description}`)
})
```

### Token Queries

```typescript
// Get a specific token
const primary = intelligence.queries.getToken('primary')
console.log(primary.value.resolved)  // "#3B82F6"

// Trace ancestry
const ancestry = intelligence.queries.getTokenAncestry('button-primary-bg')
// → [blue-500, primary, button-primary-bg]

// Find unused tokens
const orphaned = intelligence.model.tokens.coverage.orphaned
```

### Documentation Generation

```typescript
// Generate full markdown documentation
const docs = intelligence.toMarkdown()
fs.writeFileSync('DESIGN_SYSTEM.md', docs)

// Or get specific sections
console.log(intelligence.documentation.executive.overview)
console.log(intelligence.documentation.sections.find(s => s.foundation === 'Color System'))
```

### Tracking Drift Over Time

```typescript
const lastWeek = await loadIntelligence('scan-2026-01-01.json')
const today = await scanner.analyze('/path/to/codebase')

const diff = today.diff(lastWeek)

console.log(`Drift trend: ${diff.impact.driftTrend}`)  // "improving"
console.log(`Coverage change: ${diff.impact.coverageChange}%`)  // "+2.3"
console.log(`New anomalies: ${diff.summary.anomaliesNew}`)
console.log(`Resolved anomalies: ${diff.summary.anomaliesResolved}`)
```

---

## Implementation Phases

### Phase 1: Signal Extraction
- Refactor existing scanners to emit `RawSignal[]`
- Implement `SignalContext` detection
- Create signal aggregation pipeline

### Phase 2: Pattern Clustering
- Implement clustering algorithms per pattern type
- Create `CandidatePattern` generation
- Add statistical analysis (variance, coverage, outliers)

### Phase 3: Knowledge Base
- Build `BuiltinKnowledge` with 10-15 major design systems
- Implement `UserKnowledge` config loading
- Create `LearnedKnowledge` storage and retrieval

### Phase 4: Scoring & Resolution
- Implement three-layer scoring logic
- Build conflict detection and resolution
- Create `DesignSystemModel` assembly

### Phase 5: Explanation Generation
- Build template engine for natural language
- Implement `QueryEngine` with rule-based NL parsing
- Create serialization (JSON, Markdown, HTML)

### Phase 6: Diff & Tracking
- Implement `IntelligenceDiff` computation
- Add trend detection
- Create historical storage

---

## Success Criteria

1. **Accuracy**: Detected patterns match manual analysis in 90%+ of cases
2. **Explainability**: Every detection has traceable evidence
3. **Coverage**: Detects value, component, and system-level patterns
4. **Self-learning**: Subsequent scans are faster and more accurate
5. **No AI dependency**: All explanations generated deterministically
6. **Diffable**: Can track drift over time with meaningful metrics

---

## Open Questions

1. **Storage format for learned knowledge**: JSON file? SQLite? Where does it live?
2. **Incremental scanning**: How to efficiently re-scan only changed files?
3. **Figma integration**: How does Figma data merge with code-detected patterns?
4. **Multi-repo support**: How to handle monorepos vs polyrepos?
