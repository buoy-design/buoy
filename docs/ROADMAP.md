# Buoy Roadmap

> Planned features and future development
> Last updated: December 27, 2024

---

## Current Version

### Done
- CLI commands: `init`, `scan`, `status`, `drift check`
- Framework detection (30+ frameworks)
- Component scanners (React, Vue, Svelte, Angular, Web Components, Templates)
- Token detection (CSS, SCSS, JSON, Tailwind)
- Design system package detection
- Drift detection (naming, props, duplicates, hardcoded values, a11y)
- Visual coverage grid
- JSON output

---

## Near-Term (Next Up)

### 1. GitHub Action + CI Command
**URL:** `/integrations/github-action`
**Headline:** "Catch design drift in every PR"
**Pain:** Drift sneaks in through code review, no visibility until it's merged
**Value:** Automatic PR comments, status checks, zero-config setup
**Priority:** **Critical** — Primary distribution channel

**Deliverables:**
- [ ] `buoy ci` command with proper exit codes
- [ ] Diff-only mode (only report new drift in PR, not existing)
- [ ] Configurable thresholds (`--fail-on critical|warning|any`)
- [ ] PR comment formatting (markdown table of drift signals)
- [ ] GitHub Action wrapper (`buoy-dev/buoy-action`)
- [ ] Status check integration (pass/fail badge)
- [ ] JSON output mode for custom integrations

**CLI Usage:**
```bash
# Exit 1 if critical drift found
buoy ci --fail-on critical

# Only check files changed in this branch
buoy ci --diff origin/main

# Output JSON for custom processing
buoy ci --json
```

**GitHub Action:**
```yaml
- uses: buoy-dev/buoy-action@v1
  with:
    fail-on: critical
    comment: true
```

### 2. Figma Scanner
**URL:** `/integrations/figma`
**Headline:** "Connect Figma to your codebase"
**Pain:** Figma and code drift apart silently
**Value:** Cross-source comparison between Figma components and code
**Priority:** High

### 3. HTMX + Alpine.js Detection
**URL:** `/integrations/htmx`
**Headline:** "HTML-first framework support"
**Pain:** Server-side projects with modern JS need coverage too
**Value:** Detect HTMX attributes and Alpine directives
**Priority:** Medium

### 4. Qwik Scanner
**URL:** `/integrations/qwik`
**Headline:** "Qwik component scanning"
**Pain:** Emerging framework needs support
**Value:** Full component analysis for Qwik projects
**Priority:** Medium

---

## Mid-Term

### AI-Powered Explanations
**URL:** `/features/ai-explanations`
**Headline:** "Understand drift with Claude"
**Pain:** Drift signals need context to fix
**Value:** `buoy drift explain <id>` gives natural language analysis
**Priority:** Medium

### Intent Memory
**URL:** `/features/intent`
**Headline:** "Document intentional deviations"
**Pain:** Not all drift is bad - some is intentional
**Value:** Record why something differs, suppress false positives
**Priority:** Medium

### Database Persistence
**URL:** `/features/database`
**Headline:** "Track drift over time"
**Pain:** Each scan is ephemeral
**Value:** SQLite storage for history, trends, snapshots
**Priority:** Medium

### Storybook Integration
**URL:** `/integrations/storybook`
**Headline:** "Verify Storybook matches implementation"
**Pain:** Stories get out of sync with actual components
**Value:** Compare documented stories to real component APIs
**Priority:** Medium

---

## Long-Term

### MCP Server
**URL:** `/features/mcp-server`
**Headline:** "Design system context for AI agents"
**Pain:** AI assistants don't know your design system
**Value:** Expose design system as MCP tools for Claude, Cursor, etc.
**Priority:** Future

### Agent Skills
**URL:** `/features/agent-skills`
**Headline:** "Teachable design system behaviors"
**Pain:** Design system rules are tribal knowledge
**Value:** Define skills that AI agents can execute
**Priority:** Future

### VS Code Extension
**URL:** `/integrations/vscode`
**Headline:** "See drift warnings inline"
**Pain:** Have to run CLI to see issues
**Value:** Real-time drift warnings as you code
**Priority:** Future

### Slack Alerts
**URL:** `/integrations/slack`
**Headline:** "Get notified when drift is detected"
**Pain:** Drift accumulates silently
**Value:** Webhook alerts for new drift signals
**Priority:** Future

### Trend Analytics
**URL:** `/features/trends`
**Headline:** "Track adoption over time"
**Pain:** No way to measure design system ROI
**Value:** Historical charts showing alignment % improvement
**Priority:** Future

### Team Dashboard
**URL:** `/features/dashboard`
**Headline:** "Design system health for everyone"
**Pain:** CLI not accessible to designers, PMs
**Value:** Web UI with coverage rings, drift lists, intent recording
**Priority:** Future

---

## Native Mobile (Long-Term)

### SwiftUI
**URL:** `/integrations/swiftui`
**Headline:** "iOS native component detection"
**Keywords:** SwiftUI, iOS, Apple, native
**Priority:** Future

### Jetpack Compose
**URL:** `/integrations/jetpack-compose`
**Headline:** "Android native component detection"
**Keywords:** Jetpack Compose, Android, Kotlin, native
**Priority:** Future

### Kotlin Multiplatform
**URL:** `/integrations/kotlin-multiplatform`
**Headline:** "KMP project support"
**Keywords:** Kotlin Multiplatform, KMP, cross-platform
**Priority:** Future

### .NET MAUI
**URL:** `/integrations/maui`
**Headline:** ".NET MAUI project support"
**Keywords:** .NET MAUI, Xamarin, C#, cross-platform
**Priority:** Future

---

## Additional Design Systems (As Requested)

- Vuetify
- Semantic UI
- Fluent UI
- DaisyUI
- PrimeVue / PrimeNG
- Quasar
- Headless UI
- React Aria
- Arco Design
- Element Plus
