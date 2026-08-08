> **FIRST RULE — UNIVERSAL PRODUCT:** Options Ladder must work from instrument metadata and TradingView axis evidence for any optionable pair, instrument, or index worldwide. NIFTY is only current test case; no core membership rule may be NIFTY-specific.

# CLAUDE.md — Project Memory Anchor

> Auto-loaded by Claude Code on every session start. Read this first, then
> `LATEST_SEED.md`, then the last 5 entries of `PROGRESS.md`.

## PROJECT_DNA
- **Name:** Options Ladder
- **North star:** Make option-selling decisions understandable directly on TradingView for any supported optionable instrument through exact-axis live premiums, manual what-if positions, break-evens, and risk evidence. NIFTY is current test case only.
- **Non-negotiables:**
  1. Broker access stays read-only; extension never places orders.
  2. Option numbers refresh only after explicit user action; no automatic retry storms.
  3. Price levels use TradingView native axis evidence and fail closed when evidence is unsafe.
  4. Visual confirmation precedes major UI implementation.
  5. Visible membership equals real selected-contract strikes intersecting TradingView's stable visible price grid, plus one real ATM reference strike when its exact price lies inside visible chart range. ATM never controls density or range.
- **Working style:** Plain English, chart-first visual design, one user action per procedural step, feature branches until tested.
- **Locked stack:** Chrome Manifest V3, vanilla JavaScript/CSS, local Node.js bridge, TradingView chart overlay, read-only Upstox and Zerodha data.

## Auto-resume directive
On session start: silently read `memory/LATEST_SEED.md` and the last 5 entries of
`memory/PROGRESS.md`, then brief in 6 lines before accepting input.

## Foundational rules
(Append as the project evolves. Never delete — supersede with SUPERSEDED-BY: #id.)
- **R1** (2026-08-05): Never report chart UI work complete until latest unpacked extension revision is reloaded and live Chrome DOM geometry confirms it. **Why:** Automated contracts missed visible overlap and stacking regressions that only appeared in TradingView.
- **R2** (2026-08-05): C/P controls, checkboxes, break-even labels, OI stickers, and ladder rows must never overlap; saved position badges always own top visual layer. Crowded same-side positions collapse to closed `+N`, which selects nothing until an exact flyout row is chosen. **Why:** Position identity and selection must remain unambiguous at every zoom level.
- **R3** (2026-08-05): Repair one workflow at a time; run targeted automated checks, reload latest unpacked extension, and replay exact user workflow live in Chrome before starting next repair. Never use green unit tests alone to claim UI success or call whole project perfect before full workflow catalog is executed. **Why:** Repeated fixes passed lower-level tests while real click, double-click, layering, and lifecycle behavior remained broken.
- **R4** (2026-08-08): A visual defect discovered during live Chrome audit remains a blocker until its fix is committed, the unpacked extension is reloaded, and that exact visual state is replayed. **Why:** Combined BE evidence was still covered by summary panel despite earlier automated and live checks.
