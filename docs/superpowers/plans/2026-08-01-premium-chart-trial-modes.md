# Premium Skyline Finalization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Skyline as sole production premium-history projection while preserving selected-strike and square-marker UI.

**Architecture:** Pure Skyline geometry feeds one reusable passive canvas in `content.js`. Premium-history controller loads exact contract data but mounts no lower DOM pane. TradingView time and price mappings remain validated inputs.

**Tech Stack:** Chrome Manifest V3, vanilla JavaScript, Canvas 2D, Node.js built-in test runner.

## Global Constraints

- Any optionable instrument must work from selected strike, contract history, and TradingView axis evidence; NIFTY-specific geometry is forbidden.
- Skyline is fixed; no on-chart mode selector or persisted mode exists.
- Lower history pane is not mounted in production. Strike rail and square markers remain.
- Missing values remain gaps; no premium interpolation.
- ARB Desk tokens only; no new colors, shadows, or fonts.
- Overlay uses one passive canvas and bounded visible samples.

---

### Task 1: Pure premium-chart geometry

**Files:**
- Create: `extension-axis-ladder/premium-chart-trials.js`
- Create: `extension-axis-ladder/premium-chart-trials.test.cjs`

**Interfaces:**
- Consumes: premium points `{ time, call?, put? }`, selected strike, synchronized time axis, validated `toY(price)`, plot dimensions.
- Produces: `TRIAL_MODES`, `visiblePremiumSamples`, `skylineGeometry`, and `skylineSegments`.

- [x] **Step 1: Write failing tests** for exact upward Call/downward Put mapping, missing-side gaps, visible clipping, and pixel-bin bounds.
- [x] **Step 2: Run** focused geometry tests and confirm expected failure.
- [x] **Step 3: Implement pure Skyline geometry** with finite-number validation and no browser dependencies.
- [x] **Step 4: Run focused tests** and confirm pass.

### Task 2: Remove obsolete mode state and selector

**Files:**
- Modify: `extension-axis-ladder/premium-history-pane.js`
- Modify: `extension-axis-ladder/premium-history-pane.test.cjs`
- Modify: `extension-axis-ladder/overlay.css`

**Interfaces:**
- Consumes: no on-chart mode clicks.
- Produces: no production lower pane and no chart-mode selector.

- [x] **Step 1: Write failing tests** proving mode state and selector are absent while existing controls remain.
- [x] **Step 2: Run focused pane tests** and confirm failure.
- [x] **Step 3: Remove controller mode state and selector.**
- [x] **Step 4: Run focused tests** and confirm pass.

### Task 3: Passive chart renderer integration

**Files:**
- Modify: `extension-axis-ladder/manifest.json`
- Modify: `extension-axis-ladder/content.js`
- Modify: `extension-axis-ladder/overlay.css`
- Modify: `extension-axis-ladder/scaffold.test.cjs`
- Modify: `extension-axis-ladder/content-contract.test.cjs`

**Interfaces:**
- Consumes: `OptionsPremiumChartTrials`, pane state, current `toY`, TradingView plot rectangle and time axis.
- Produces: one `#options-premium-chart-trials` canvas that renders Skyline and clears safely.

- [x] **Step 1: Write failing contract tests** for dependency order, one passive canvas, lifecycle clearing, and preserved strike-map rendering.
- [x] **Step 2: Run focused contract tests** and confirm failure.
- [x] **Step 3: Keep Skyline renderer only; preserve existing square canvas.**
- [x] **Step 4: Wire validated placement mapping** and all lifecycle clears.
- [x] **Step 5: Run focused tests** and confirm pass.

### Task 4: Documentation and full verification

**Files:**
- Modify: `extension-axis-ladder/README.md`
- Modify: `docs/superpowers/specs/2026-08-01-premium-history-pane-design.md`

**Interfaces:**
- Consumes: finished behavior.
- Produces: user-facing trial-mode rules and preservation contract.

- [x] **Step 1: Document exact Skyline arithmetic, shared crosshair, lower-pane retirement, and absence of selector.**
- [ ] **Step 2: Run** `node --test extension-axis-ladder/*.test.cjs`.
- [ ] **Step 3: Run** `git diff --check`.
- [ ] **Step 4: Reload extension and visually verify Skyline, including gaps, crosshair, square-marker preservation, and light/dark tokens.
