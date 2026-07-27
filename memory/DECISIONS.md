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
