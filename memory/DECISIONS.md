> **FIRST RULE — UNIVERSAL PRODUCT:** Options Ladder must work from instrument metadata and TradingView axis evidence for any optionable pair, instrument, or index worldwide. NIFTY is only current test case; no core membership rule may be NIFTY-specific.

# DECISIONS — append-only, numbered
## D1 — 2026-07-24

Use a controlled TradingView-style chart with TradingView Advanced Charts, not native TradingView Pine or a browser overlay.

## D2 — 2026-07-24

V1 is NIFTY only, 1-hour candles, next monthly expiry, automatic rollover, five ATM-adjacent strikes, and real LTP labels.

## D3 — 2026-07-24

Use Upstox as option and candle data source, after proving the account's live market-feed permissions.

## D4 — 2026-07-24T18:30:00+05:30
**Decision:** Preserve both local and GitHub repository states without rewriting history.
**Why:** All project content is published and local tree is clean; reconciling unrelated local and connector-generated GitHub histories adds risk with no product benefit now.
**Alternatives considered:**
- Force-push local root commit — rejected; overwrites GitHub history.
- Pull/rebase unrelated histories — deferred; requires deliberate reconciliation.
**Status:** ACTIVE

## D5 — 2026-07-25T23:40:00+05:30

**Decision:** Use existing TradingView Pine indicator plus same-window Chrome extension as V1.
**Why:** End-to-end proof filled all ten exact option symbols and displayed five live Call/Put labels without a separate browser profile or controlled chart.
**Supersedes:** D1 for V1.
**Status:** ACTIVE

## D6 — 2026-07-26

**Decision:** Run local Upstox bridge through macOS LaunchAgent with token stored in macOS Keychain, and synchronize TradingView expiries from exact `aria-selected` state.
**Why:** Removes daily terminal/token work, distinguishes visible expiry options from current selection, and makes one-button Pine synchronization reliable across every offered expiry.
**Status:** ACTIVE

## D7 — 2026-07-26

**Decision:** Keep five visible strike rows but use 100-point spacing, with center calculated from live NIFTY spot during sync.
**Why:** Covers same 400-point range as nine 50-point rows while retaining ten-contract automation time and removing manual center entry.
**Status:** ACTIVE

## D8 — 2026-07-26

**Decision:** Omit strike number from each Pine label and show only `C <LTP> | P <LTP>`.
**Why:** Strike remains unambiguous from label's exact vertical price coordinate and chart price scale, while shorter text keeps right-edge ladder cleaner.
**Status:** ACTIVE

## D9 — 2026-07-26

**Decision:** Preserve five real 100-point contracts on every timeframe, but separate visually overlapping labels around the exact ATM anchor and connect displaced rows back to their true strike coordinates.
**Why:** TradingView compresses pixels-per-price on Weekly and Monthly charts; changing real strike spacing by timeframe would show different contracts and break semantic accuracy.
**Status:** ACTIVE

## D10 — 2026-07-27

**Decision:** Evaluate a second, independent Axis Ladder extension while keeping the original Pine-sync extension v0.14.0 disabled and untouched as backup.
**Why:** User wants direct right-axis anchoring and thirteen rows without risking the already working five-row Pine workflow before choosing which product to keep.
**Status:** ACTIVE

## D11 — 2026-07-27

**Decision:** Axis Ladder uses thirteen exact option contracts—six below ATM, ATM, and six above—and locks every row to TradingView's native price-coordinate transform.
**Why:** Rows must stay beside their exact right-axis prices through timeframe changes, zoom, and inverse scale while preserving the same contract membership.
**Status:** ACTIVE

## D12 — 2026-07-27

**Decision:** Native-axis capture must fail closed and retry bounded auto-fit rather than guess coordinates from invalid or incomplete TradingView marker clusters.
**Why:** Wrong price anchoring is worse than a temporary loading state; current capture logic now rejects moving markers, accepts sparse valid axes, and selects the latest complete canvas paint burst.
**Status:** ACTIVE

## D13 — 2026-07-30T11:09:53+05:30
**Decision:** Use a light TradingView-only Chrome side panel named Options Ladder while preserving chart-native ladder rows.
**Why:** Popup scrolling slowed the main refresh action; a full-height side panel keeps controls accessible without leaving the chart.
**Alternatives considered:**
- Large extension popup — rejected because repeated scrolling made core actions slow.
- Separate dashboard — rejected because user's strongest decision surface is the TradingView chart.
**Status:** ACTIVE

## D14 — 2026-07-30T11:09:53+05:30
**Decision:** Finish manual what-if planning before connecting live broker positions to chart risk lines.
**Why:** User wants to understand every strike, lot, premium, and break-even visually before trusting live-position automation.
**Alternatives considered:**
- Import live positions immediately — deferred to a later phase.
- Keep using external strategy builder — rejected as primary workflow because it is too detached from chart reading.
**Status:** ACTIVE

## D15 — 2026-07-30T11:09:53+05:30
**Decision:** Manual positions open by double-click at the selected strike and preserve separate Call and Put entries with aggregated side-specific lot badges.
**Why:** In-place editing minimizes eye travel, allows both sides at one strike, and makes existing exposure visible at a glance without growing every ladder row.
**Alternatives considered:**
- Persistent bottom tray — rejected.
- One combined count badge — rejected because Call and Put lots can differ.
**Status:** ACTIVE

## D16 — 2026-07-30T11:09:53+05:30
**Decision:** Manual plan break-even rails span the full plot and each rail flips through individual position P&L for its own option side.
**Why:** Full-width levels read naturally on charts, while individual P&L answers which saved position is winning or losing without hiding differences inside one combined number.
**Alternatives considered:**
- Right-only rails — superseded after chart review.
- Combined plan P&L on both rails — rejected as misleading for position-level inspection.
**Status:** ACTIVE

## D17 — 2026-07-30
**Decision:** Build visible ladder membership from real strikes available for selected instrument and expiry, intersected with TradingView's stable visible price-axis grid. Remove fixed row counts, 13-strike windows, ATM-centered membership, and timeframe-specific strike-spacing rules. ATM remains a visual highlight only. When TradingView's live-price marker covers an expected grid label, infer that rounded grid value from surrounding stable axis cadence; for example, `24,296.60` covering its slot resolves to `24,300`.
**Why:** Same system must work on any optionable pair, instrument, or index worldwide. Instrument metadata defines which strikes truly exist; TradingView axis defines which density is readable at current zoom. NIFTY is current test case, not product architecture.
**Supersedes:** D2 market-scope and membership limits, D7, D9, D10 thirteen-row intent, D11, and D12 auto-fit behavior.
**Status:** ACTIVE

## D18 — 2026-07-30

**Decision:** Keep one real nearest-available ATM strike visible when its exact strike price lies inside TradingView's visible chart range, even when that strike does not intersect the printed axis grid. All non-ATM rows remain real-strike intersections with TradingView's stable visible grid. ATM does not control range, density, or spacing. Light mode uses ARB Desk brown warning styling; dark mode uses ARB Desk orange warning styling.
**Why:** ATM is a primary trading reference and must remain recognizable through coarse zoom, but forcing an ATM-centered window would undo universal axis-driven density.
**Supersedes:** D17 statement that ATM changes styling only and never membership; all other D17 rules remain active.
**Status:** ACTIVE
