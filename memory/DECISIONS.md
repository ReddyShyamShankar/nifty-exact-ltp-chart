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

## D19 — 2026-08-01T21:41:31+05:30
**Decision:** Use Premium Skyline as sole production premium-history visualization: Call close history renders above selected-strike baseline, Put close history renders below, and both share TradingView's exact visible time axis and crosshair. Do not mount lower history pane or restore RANGE stems.
**Why:** User understood premium expansion and contraction immediately when premium magnitude was spatially anchored around selected strike; lower pane and vertical ranges added confusion and page cost.
**Alternatives considered:**
- Lower LINES pane — rejected for production because it splits attention from TradingView.
- RANGE/OHLC stems — rejected because visual density obscured premium trend.
- Independent premium axis — rejected because goal is synchronized chart-native understanding.
**Status:** ACTIVE

## D20 — 2026-08-01T21:41:31+05:30
**Decision:** Replace wide crosshair paragraph tooltip with Option A spatial labels: timestamp above crosshair, Call chip at Call sample, Put chip at Put sample, and strike chip at baseline intersection.
**Why:** Label position explains meaning without paragraph reading and preserves exact values with lower visual obstruction.
**Alternatives considered:**
- Right-edge premium tags — rejected because eye travel disconnects values from samples.
- Split left/right crosshair labels — rejected because labels can cover more nearby candles.
- Keep paragraph tooltip — rejected as confusing and visually heavy.
**Status:** ACTIVE

## D21 — 2026-08-05T00:08:00+05:30
**Decision:** Treat every broker position as an individually selectable exact-strike chart control while retaining one combined broker strategy summary.
**Why:** User needs both portfolio-level break-even context and exact strike-level identity/P&L without broker legs disappearing inside one aggregate card.
**Alternatives considered:**
- Combined broker card only — rejected because individual strikes and directions become invisible.
- Individual controls only — rejected because portfolio-level strategy context disappears.
**Status:** ACTIVE

## D22 — 2026-08-05T00:08:00+05:30
**Decision:** Place Calls left of position spine, Puts in reserved right lane before ladder, and manual strategies in separate farther-left lane. Collapse same-side collisions into closed `+N`; opening group selects nothing.
**Why:** Three independent horizontal lanes preserve identity, prevent controls from covering ladder/OI data, and remove ambiguity about which trade is selected.
**Alternatives considered:**
- Stack all controls in one column — rejected as congested.
- Show every colliding token — rejected because controls and checkboxes overlap.
**Status:** SUPERSEDED-BY: D24

## D23 — 2026-08-05T00:08:00+05:30
**Decision:** Make live Chrome geometry verification mandatory after extension reload before declaring visual fixes complete.
**Why:** Unit and DOM-contract tests can pass while TradingView stacking contexts, cached content scripts, zoom, or neighboring rows still produce visible regressions.
**Alternatives considered:**
- Automated tests only — rejected after repeated live overlap regressions.
- Screenshot review only — rejected because computed rectangles and interaction state need deterministic checks.
**Status:** ACTIVE

## D24 — 2026-08-05T23:22:10+05:30
**Decision:** Use exactly two source-neutral position lanes: Calls on one side and Puts on other. Manual and broker entries share those lanes; same-side collisions collapse into closed `+N`, and opening group selects nothing until exact identity is chosen.
**Why:** Source is ownership metadata, not separate chart geography. User must read option side first without manual/broker columns multiplying or colliding.
**Alternatives considered:**
- Separate manual lane — rejected because user explicitly requires manual and broker positions clubbed by Call/Put side.
- One mixed lane — rejected because Call and Put identity becomes ambiguous.
**Status:** ACTIVE

## D25 — 2026-08-05T23:22:10+05:30
**Decision:** Repeated clicks on saved strike cycle exact saved faces and then return to live-selected face while quick Call/Put BE rails remain. Escape, outside click, refresh, or expiry change creates true neutral state and removes quick BE plus temporary T controls.
**Why:** Preserves agreed same-strike BE context while making selected versus neutral states explicit and testable.
**Alternatives considered:**
- Final face click clears selection — rejected because it breaks agreed “same-strike click keeps rails” behavior.
- Keep rails after Escape/outside — rejected because neutral state must contain no BE or temporary T identity.
**Status:** ACTIVE

## D26 — 2026-08-05T23:22:10+05:30
**Decision:** Manual badges open exact editable saved entry with SAVE/REMOVE; broker badges open exact read-only position details. Manual face exposes only owning T label, while broker face exposes no unrelated manual T.
**Why:** Same shared lane needs source-correct action and exact strategy ownership without inventing or leaking T identities.
**Alternatives considered:**
- One editor behavior for both sources — rejected because broker imports are read-only.
- Show every same-strike T — rejected because unrelated ownership misrepresents selected position.
**Status:** ACTIVE

## D27 — 2026-08-05T23:22:10+05:30
**Decision:** Gate each repair with targeted tests plus real Chrome workflow replay before moving to next repair, and separate tested-workflow evidence from whole-product claims.
**Why:** 986 green checks prove covered contracts, not all 202 real-browser journeys or external/destructive workflows.
**Alternatives considered:**
- Batch all fixes then inspect once — rejected because regression source becomes unclear.
- Declare project perfect from automated suite — rejected because prior green suites missed live failures.
**Status:** ACTIVE

## D28 — 2026-08-08T22:15:11+05:30
**Decision:** Native TradingView ticks define price bounds only. Every real selected-expiry strike inside those bounds stays eligible; when density exceeds safe row placement, render a non-overlapping real-strike sample that includes true ATM.
**Why:** User requires strike cards to remain visible through zoom-in and zoom-out. Coarse axis labels must not erase valid contracts between labels.
**Alternatives considered:**
- Filter to printed native ticks — rejected because it hid most real 50-point strikes.
- Conceal all rows when density is too high — rejected because it erased ladder entirely.
**Status:** ACTIVE

## D29 — 2026-08-08T22:15:11+05:30
**Decision:** Combined summary must move clear of combined BE chart evidence whenever their vertical geometry intersects.
**Why:** Combined BE must remain readable at its exact TradingView price rail; summary cannot cover it.
**Alternatives considered:**
- Raise combined label above summary — rejected because it still obscures summary evidence.
- Leave summary fixed at chart top — rejected after live collision.
**Status:** ACTIVE
