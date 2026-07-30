# CLAUDE.md — Project Memory Anchor

> Auto-loaded by Claude Code on every session start. Read this first, then
> `LATEST_SEED.md`, then the last 5 entries of `PROGRESS.md`.

## PROJECT_DNA
- **Name:** Options Ladder
- **North star:** Make option-selling decisions understandable directly on TradingView for any supported optionable instrument; NIFTY is current fixture, never product boundary.
- **Non-negotiables:**
  1. Broker access stays read-only; extension never places orders.
  2. Option numbers refresh only after explicit user action; no automatic retry storms.
  3. Price levels use TradingView native axis evidence and fail closed when evidence is unsafe.
  4. Visual confirmation precedes major UI implementation.
  5. One universal chart rule: TradingView native right-axis labels control visible contract density; instrument option chain controls which prices are real strikes. No timeframe table or fixed row cap.
- **Working style:** Plain English, chart-first visual design, one user action per procedural step, feature branches until tested.
- **Locked stack:** Chrome Manifest V3, vanilla JavaScript/CSS, local Node.js bridge, TradingView chart overlay, read-only Upstox and Zerodha data.

## Auto-resume directive
On session start: silently read `memory/LATEST_SEED.md` and the last 5 entries of
`memory/PROGRESS.md`, then brief in 6 lines before accepting input.

## Foundational rules
(Append as the project evolves. Never delete — supersede with SUPERSEDED-BY: #id.)
