# Options Ladder — Complete ChatGPT Project Context

**Snapshot date:** 2 August 2026
**Purpose:** Upload this file to a normal ChatGPT conversation or ChatGPT Project so it can discuss Options Ladder with the full product, design, architecture, history, and current-state context.

---

## Instructions for ChatGPT

Treat this document as the project briefing and current source of truth. When discussing the product:

1. Separate **committed**, **built but uncommitted**, **approved but not live-verified**, and **future** work.
2. Think at product and architecture level first. User is a creative founder, not a programmer. Explain what each system does, why it exists, and how parts connect. Avoid code-level recipes unless explicitly requested.
3. Never describe NIFTY-specific behavior as universal product architecture. NIFTY is current connector and test case only.
4. Never propose order placement. Broker integrations remain read-only.
5. Never invent option values, timestamps, axis positions, open interest, P&L, charges, or missing candles.
6. Preserve explicit-manual-refresh boundary. No automatic quote-refresh loops.
7. Ask for visual confirmation before major UI implementation.
8. When screenshots and this document disagree, use newest screenshot plus user correction. When old README wording and current-state section disagree, use current-state section.
9. User decides product direction; assistant handles mechanics.

### Recommended opening prompt in normal ChatGPT

> Read attached Options Ladder context pack fully. Use it as ongoing project memory. Start by giving me a short product-state briefing: what product is, what is already built, what is currently uncommitted, and what decision is next. Do not propose code unless I ask.

---

## 1. Product identity

**Product name:** Options Ladder
**Current test market:** NIFTY options
**Long-term scope:** Any supported optionable index, instrument, or pair worldwide
**Primary surface:** TradingView chart
**Current delivery form:** Chrome Manifest V3 extension plus local Node.js data bridge

### North-star goal

Make option-selling decisions understandable directly on TradingView through:

- live Call and Put premiums at exact strike coordinates;
- manual what-if positions;
- break-even and P&L evidence;
- premium history synchronized to TradingView time;
- open-interest context;
- read-only seller-risk evidence.

Product should reduce mental travel between chart, option chain, strategy builder, and broker data. User should understand a position from chart itself.

### Product philosophy

- **Chart first:** decision evidence belongs on TradingView, not in detached dashboards.
- **Exact evidence:** native TradingView price/time axes control placement.
- **Fail closed:** if axis evidence is unsafe, hide output instead of guessing.
- **Manual data boundary:** numbers refresh only after explicit user action.
- **Visual meaning:** position and color should explain what data represents.
- **Read-only brokers:** no order placement, modification, cancellation, conversion, or exit.
- **Universal core:** provider and instrument details stay outside core membership and geometry rules.

---

## 2. Current authoritative code location

Repository contains multiple generations and three Git worktrees. Do not assume repository root contains newest product code.

### Active product worktree

```text
/Users/reddyshyamshankar/Documents/Code/Options Indicator/.worktrees/timeframe-axis-ladder
```

**Active branch:** `codex/arbdesk-theme-system`
**Current committed HEAD:** `198b5c5 feat: ship premium skyline and direct option actions`

### Active extension directory

```text
.worktrees/timeframe-axis-ladder/extension-axis-ladder
```

This is directory loaded as unpacked Chrome extension.

### Other worktrees

- Repository root: branch `codex/timeframe-axis-ladder-base`. Older baseline plus project memory and visual files.
- `.worktrees/plan-rail-first-click`: separate earlier feature worktree.

### Important warning

Root README still describes original Pine-driven five-strike product. It is historical, not current architecture. Active worktree code, current Git history, and this document outrank that README.

---

## 3. System architecture

```text
Upstox read-only market data
  ├─ option-chain premiums
  ├─ Call/Put open interest
  └─ exact option premium history
           ↓
Local Node.js bridge
  ├─ validates and normalizes provider data
  ├─ keeps provider limits outside chart code
  ├─ exposes read-only localhost endpoints
  └─ never retries user-triggered failures automatically
           ↓
Chrome extension background service worker
  ├─ owns bridge requests
  ├─ validates TradingView callers
  ├─ serializes strategy mutations across tabs
  └─ persists settings and strategy evidence locally
           ↓
TradingView content layer
  ├─ observes stable native price axis
  ├─ observes stable native time axis only when needed
  ├─ renders exact-axis ladder rows
  ├─ renders break-even/risk rails
  ├─ renders Premium Skyline
  └─ leaves TradingView pan, zoom, and Auto-fit under user control
           ↓
Popup + side panel
  ├─ explicit ladder refresh
  ├─ expiry/theme controls
  ├─ read-only seller-safety workflow
  └─ strategy/version controls
```

### Why each piece exists

- **Upstox:** live option-chain and historical option data.
- **Zerodha:** optional read-only positions/trades evidence for seller-safety workflow.
- **Local bridge:** keeps broker/provider credentials and API constraints outside browser chart code.
- **Background service worker:** single writer for stored strategies, preventing open tabs from overwriting one another.
- **TradingView observers:** use chart's real displayed coordinates instead of reverse-engineering or guessing scales.
- **Canvas Skyline:** draws passive premium history without taking pointer ownership from TradingView.

---

## 4. Current ladder membership and snapping

### Current universal rule

Visible rows come from intersection of:

1. real strikes returned for selected instrument and exact expiry; and
2. TradingView's stable visible right-price-axis grid.

There is no fixed row count, no thirteen-row window, no ATM-centered membership, and no timeframe-specific 50/100/250/500 strike-spacing rule.

### ATM exception

One real nearest-available ATM strike remains visible when its exact strike price lies inside visible chart range, even when it falls between printed TradingView grid labels.

ATM:

- never controls range;
- never controls density;
- never changes non-ATM membership;
- remains a visual reference only.

### Native-axis behavior

- Pan and zoom remap cached rows using fresh TradingView axis evidence.
- Pan and zoom make no option-chain request.
- Extension never changes TradingView Auto-fit.
- Extension does not drag or double-click TradingView price scale.
- Extension requests no Chrome debugger permission.
- If native axis is incomplete, nonlinear, ambiguous, or unsafe, ladder hides instead of estimating.
- If live-price marker covers expected printed slot, stable neighboring cadence can restore rounded grid value; e.g. `24,296.60` can resolve hidden `24,300` slot.

### Row format

```text
C <Call premium> | P <Put premium> | <strike>
```

All visible rows stay in one right-edge column at exact chart price coordinates.

---

## 5. Ladder interactions

### Live row

- Clicking ordinary row shows independent Call and Put single-leg expiry break-evens.
- Call break-even = strike + displayed Call premium.
- Put break-even = strike - displayed Put premium.
- These are independent examples, not combined short-straddle economics.
- Clicking elsewhere clears transient rails and premium view.

### Manual option entry

Latest committed direct-action behavior:

- Double-click Call premium area: show two clear actions, **Buy Call** and **Sell Call**.
- Double-click Put premium area: show two clear actions, **Buy Put** and **Sell Put**.
- No generic `Choose Leg` dropdown for this path.
- Lot-size stepper, editable premium, Add/Save, Remove, and Close remain.
- Positive whole-number lots required.
- Selected side must have valid non-negative premium.
- Unsaved close, outside click, or Escape cancels draft.

### Premium history trigger

Current committed implementation opens premium history by clicking only rightmost strike number. Clicking rest of row retains quick break-even behavior; double-clicking Call/Put regions retains manual editor behavior.

Historical discussion also requested double-clicking strike to open premium history. Current code and active README use single-click on strike number. Treat exact gesture as a product-confirmation item if user revisits it.

### Saved-entry badges

- `C2` means two saved Call lots at that strike.
- `P3` means three saved Put lots at that strike.
- Call and Put remain separate because lots can differ.
- Badge opens exact saved entry for editing.

---

## 6. Manual strategies and versioned evidence

Manual what-if planning was built before live-position automation because user wants to understand each strike, premium, lot, and break-even first.

### Strategy ownership

- New leg must explicitly create new strategy or join chosen compatible strategy.
- Product never auto-groups by strike, time, or proximity.
- Same contract may appear in multiple separate entries with distinct premiums, timestamps, lots, and ownership.

### Stored evidence

- Strategies keyed by instrument and exact expiry.
- Entry premium and Call/Put snapshots remain frozen.
- Manual refresh changes live quotes only.
- Reload, pan, zoom, timeframe, side-panel use, and quote refresh do not rewrite saved snapshots.
- Missing opposite-side snapshot remains `—`; never backfilled silently.

### Break-even and P&L rails

- Strategy rails span full chart width at exact financial levels.
- Each strategy has labels such as `T1 BE`, `T2 BE`.
- Label opens that strategy's positions and P&L.
- Small adjacent square selects whole strategy for temporary combined preview.
- Two or more compatible strategies show combined break-even rails.
- Compare restores original individual rails.
- Off-screen roots become truthful `↑` or `↓` edge markers.
- Labels may stack for readability; underlying financial rails never move.

### Version lifecycle

- Background service worker serializes add/edit/remove/merge/split/archive/restore commands.
- Duplicate command IDs are idempotent.
- Merge creates new version before archiving sources.
- Split is explicit.
- Restore creates new current version; history remains immutable.
- Expired strategies move to Ledger History.
- Malformed stored records enter recovery quarantine instead of contaminating valid strategies.

---

## 7. Premium Skyline

Premium Skyline is sole production premium-history visualization.

### Meaning

Selected strike becomes baseline:

- Call close premium plots above strike.
- Put close premium plots below strike.
- Example: strike `24,200`, Call premium `200` maps to chart coordinate `24,400`; Put premium `100` maps to `24,100`.

This communicates premium magnitude in points. It does **not** predict future underlying price.

### Time synchronization

- TradingView visible time axis is master.
- Skyline uses same plot bounds, dates, and crosshair x-coordinate.
- Crosshair reads premium from exact joined candle timestamp only.
- Missing option candle shows `NO PREMIUM CANDLE`.
- Empty future chart space receives no invented time or borrowed premium.
- Missing premium candles split line into real gaps.

### Approved spatial labels

Wide paragraph tooltip was rejected. Approved Option A uses:

- timestamp chip above crosshair;
- Call value chip at Call sample;
- Put value chip at Put sample;
- strike chip at baseline;
- edge-safe collision handling;
- compact missing-premium state.

### Visual semantics

- Call line: solid.
- Put line: dashed.
- Call value chip: green.
- Put value chip: red in latest uncommitted correction.
- Strike chip: orange warning color.
- Date chip: neutral.
- White text on colored value chips.
- Strike-touch dots were removed.

### Lifecycle

- One passive reusable canvas.
- Canvas does not capture TradingView pointer events.
- Pan, zoom, and crosshair reuse cached history.
- Time observer runs only while premium history is open.
- Close, expiry/instrument change, navigation, or extension disable clears transient premium state.

---

## 8. Open interest feature

### Financial meaning

Open interest (OI) is number of option contracts still active. Every contract has one buyer and one seller, so OI does not identify which side has more interest or who is stronger.

Call OI and Put OI are separate for each strike.

OI is not volume:

- **OI:** contracts still open.
- **Volume:** contracts traded during period/session.

An OI value like `61L` means 61 lakh active contracts, not premium and not volume.

### Current ranking rule

- Bridge retains Upstox `market_data.oi` separately as `callOi` and `putOi`.
- All real strikes for selected expiry are ranked, not only visible rows.
- Call and Put rankings are independent.
- Dense ranking is descending.
- UI displays only rank #1 and #2 for each side when those strikes are visible.

### Approved sticker design

OI badges must look attached to exact row, not placed in gap between rows.

- Badge overlaps bottom edge of its own strike card like sticker.
- Call badge sits under Call column.
- Put badge sits under Put column.
- Call OI: green.
- Put OI: red.
- Badge is absolute and non-interactive.
- Badge must not increase row width or height.
- Badge moves with row during pan and zoom.
- Preserving row geometry protects snapping.

Example:

```text
┌───────────────────────────────────┐
│ C 415.00 | P 173.90 | 24,200      │
└─[ C #1 · 61L ]─[ P #1 · 82.4L ]──┘
      green             red
```

### Built-but-uncommitted OI state

Current active worktree contains:

- validated Call/Put OI in bridge payload;
- full-expiry independent ranking;
- compact `K`, `L`, and `Cr` formatting;
- display of top two ranks only;
- exact-row sticker placement;
- green Call and red Put badges;
- white badge text;
- tests covering payload, ranking, labels, placement contract, and colors.

---

## 9. Themes and color meanings

Product uses ARB Desk theme system across popup, side panel, and chart overlay.

- Dark theme is default.
- One saved toggle updates all extension surfaces.
- Geist Sans and Geist Mono are bundled locally.
- Original Options Ladder logo remains unchanged.

### Semantic colors

- Green/accent: Call, positive/live accents, Call OI.
- Red/danger: Sell, offline/disconnected, Put OI, latest Put premium chip.
- Orange/warning: ATM, selected strike, strike baseline chip.
- Blue/accent variant: Buy snapshots.
- White text: colored Call/Put/OI chips.
- Black text: orange warning surfaces where contrast requires it.

Brown appeared because Put labels reused warning token. Latest uncommitted fix switches Put-specific labels to danger-red while strike remains warning-orange.

---

## 10. Read-only seller-safety workflow

Seller-safety remains separate from manual strategy-builder storage.

- Zerodha positions and trades are read-only.
- Tradebook CSV can be staged as evidence.
- Same-expiry strategy allocation requires operator review.
- Weekly contracts retain exact expiry identity and never merge with monthly contracts.
- Daily checkpoints advance confirmed coverage bounds.
- Missing checkpoint produces `HISTORY GAP`.
- Failed refresh immediately hides chart risk while preserving last accepted side-panel evidence.
- Current-risk boundaries use solid lines.
- Whole-trade boundaries use dashed lines.
- Profit/loss bands describe factual payoff regions.
- Unknown charges are disclosed, never guessed.
- Stale data remains reviewable in side panel but is withheld from chart until successful refresh.

No broker write capability exists anywhere in product.

---

## 11. Refresh, caching, and failure boundaries

### Explicit refresh contract

- User presses Refresh ladder to update live option numbers.
- No automatic quote retry storm.
- Pan and zoom reuse cached chain data.
- Premium history opens through explicit strike action.
- Identical historical requests deduplicate and cache.
- Provider minute/hour range limits are chunked inside one explicit load.
- Failed history load is evicted so a later explicit user retry can work.

### Fail-closed cases

- unsupported TradingView timeframe;
- incomplete or unsafe native price axis;
- nonlinear scale;
- missing exact strikes;
- missing/stale quotes for combined economics;
- invalid historical time-axis evidence;
- malformed strategy evidence;
- mismatched broker expiry identity;
- invalid extension/browser caller.

Existing valid data is preserved when refresh fails. Failure never substitutes zero or guessed values.

---

## 12. Current Git and test state

### Latest committed checkpoint

```text
198b5c5 feat: ship premium skyline and direct option actions
```

Important preceding commits:

- `54d1493 docs: lock spatial premium crosshair labels`
- `9747c65 fix: calibrate premium history on month axes`
- `e45ceda fix: prevent time-axis observer page freezes`
- `935cde3 feat: integrate premium history pane`
- `a7cea7d feat: expose read-only option history`
- `7e15413 fix: keep chart strategies synchronized`
- `98d22a4 docs: checkpoint Options Ladder v0.6.0`

### Current uncommitted files in active worktree

```text
data-bridge/server.js
data-bridge/server.test.js
extension-axis-ladder/content-contract.test.cjs
extension-axis-ladder/content.js
extension-axis-ladder/manual-ui.js
extension-axis-ladder/manual-ui.test.cjs
extension-axis-ladder/overlay.css
```

These changes add OI feature plus red Put color correction.

### Verification

Latest full local suite:

```text
701 tests
701 passed
0 failed
```

`git diff --check` passes.

Browser live verification still needs unpacked extension reload and explicit ladder refresh after latest uncommitted CSS/color changes.

---

## 13. What has been rejected or superseded

Do not revive these without new user decision:

- Original Pine-only five-row ladder as primary architecture.
- Fixed five-row, nine-row, or thirteen-row membership.
- ATM-centered strike window.
- Timeframe-specific strike spacing.
- Changing TradingView Auto-fit.
- Chrome debugger dependency for current axis ladder.
- Bottom manual-position tray.
- One combined Call/Put lot badge.
- Generic `Choose Leg` dropdown after side-specific double-click.
- Wide premium paragraph tooltip.
- Lower premium-history pane as production view.
- RANGE/OHLC premium stems.
- Independent premium axis.
- Candle-touch dots.
- Full option-chain table on chart.
- Greeks, probability, margin, recommendation engine, or automated trade advice in current scope.
- Automatic broker order actions.
- Automatic strategy ownership guessing.

---

## 14. Current unresolved items

1. Live Chrome UAT for OI sticker placement and red Put color after extension reload.
2. Confirm whether premium history should stay single-click on strike number or change to double-click, because historical user wording and current committed gesture differ.
3. Test Premium Skyline spatial labels at chart edges in light and dark themes.
4. Confirm final OI product decision beyond showing highest ranks: what trading decision should OI help user make?
5. Decide when to commit current OI/red-Put changes.
6. Decide when `codex/arbdesk-theme-system` should merge into primary branch.
7. Update stale active README wording that still describes orange Put chip and staged Call/Put dropdowns.
8. Update project memory seed after live verification and commit.

---

## 15. Product timeline

### Phase 1 — Pine synchronization

- Built NIFTY Pine LTP ladder.
- Automated exact option-symbol entry into TradingView.
- Used five strikes around ATM.
- Preserved as backup, no longer current architecture.

### Phase 2 — Native axis ladder

- Replaced Pine label placement with direct TradingView overlay.
- Added fail-closed native-axis capture.
- Removed fixed strike membership.
- Added one in-range real ATM reference.

### Phase 3 — Manual planning

- Added row quick break-evens.
- Added double-click manual entries.
- Added Call/Put lot badges.
- Added full-width exact rails and position-level P&L.

### Phase 4 — Versioned strategies

- Added explicit ownership, combined previews, merge, split, archive, restore, and immutable history.
- Added serialized background mutations and recovery quarantine.

### Phase 5 — Premium history

- Added exact provider-neutral historical data.
- Added stable TradingView time-axis observation.
- Rejected lower pane and range renderers.
- Shipped Premium Skyline and spatial crosshair chips.

### Phase 6 — Open interest, current uncommitted work

- Retained Call/Put OI from Upstox.
- Ranked full selected expiry.
- Added top-two row stickers.
- Corrected Put semantic color from brown/orange to red.

---

## 16. Important source map

Inside active worktree:

- `extension-axis-ladder/content.js` — main chart orchestration, membership, placement, interactions, Skyline.
- `extension-axis-ladder/manual-ui.js` — row/editor view models, lot badges, OI labels.
- `extension-axis-ladder/overlay.css` — chart overlay geometry and theme styling.
- `extension-axis-ladder/timeframe-ladder.js` — real-strike/native-axis membership.
- `extension-axis-ladder/axis-observer.js` — TradingView price-axis evidence.
- `extension-axis-ladder/time-axis-observer.js` — TradingView time-axis evidence.
- `extension-axis-ladder/premium-chart-trials.js` — Skyline geometry, crosshair samples, spatial labels.
- `extension-axis-ladder/premium-history-*` — normalized history model, caching, and view state.
- `extension-axis-ladder/manual-plan.js` — manual position model.
- `extension-axis-ladder/strategy-store.js` — strategies and immutable version lifecycle.
- `extension-axis-ladder/strategy-chart.js` — chart strategy selection and comparison.
- `extension-axis-ladder/breakeven-rails.js` — exact rail calculations and layout.
- `extension-axis-ladder/risk-overlay.js` — seller-risk chart evidence.
- `extension-axis-ladder/background.js` — bridge proxy, strategy serialization, browser security boundaries.
- `data-bridge/server.js` — localhost read-only broker/data endpoints and provider normalization.
- `memory/CLAUDE.md` — project DNA and non-negotiables.
- `memory/PROGRESS.md` — chronological build log.
- `memory/DECISIONS.md` — decision record.

For code-level debugging in normal ChatGPT, upload this context pack first, then only relevant source files. Do not upload whole repository unless broad audit is needed.

---

## 17. Glossary

- **ATM:** nearest real available strike to current underlying spot price.
- **Break-even:** underlying expiry price where position payoff reaches zero before unknown costs.
- **Call premium:** current or captured price of Call option.
- **Dense rank:** descending rank where equal values share rank and next distinct value advances by one.
- **Exact expiry:** full contract expiry date, not merely month label.
- **Fail closed:** show nothing or blocked state when evidence is unsafe; never guess.
- **L / lakh:** 100,000.
- **Cr / crore:** 10,000,000.
- **Native axis evidence:** price or time coordinates read from TradingView's own rendered chart.
- **OI / open interest:** active contracts still open.
- **Premium Skyline:** Call-above/Put-below premium history centered on selected strike baseline.
- **Snapshot:** saved premium evidence at time manual leg was created or edited.
- **Volume:** contracts traded during period; different from OI.
- **Worktree:** separate checked-out Git branch directory. Active product lives in dedicated worktree, not root checkout.

---

## 18. Compact state summary

Options Ladder is working chart-native NIFTY prototype built on universal instrument-neutral rules. Core ladder, exact-axis snapping, manual strategies, immutable versions, read-only seller safety, and Premium Skyline are committed. OI ranking/stickers and red Put semantic correction are built and fully unit/integration tested but uncommitted. Next proof is live Chrome reload/UAT, then commit and memory/README refresh.
