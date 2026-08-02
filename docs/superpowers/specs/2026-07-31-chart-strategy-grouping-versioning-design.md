# Chart Strategy Grouping and Versioning — Design

Date: 2026-07-31  
Status: design approved; written-spec review pending

> **Universal product rule:** This system must work from instrument metadata, selected expiry, and TradingView axis evidence for any supported optionable pair, instrument, or index worldwide. NIFTY is only current test case. No core strategy, chart, or membership rule may be NIFTY-specific.

## Goal

Let user manage many real or manual option trades as named strategies directly from TradingView. User can inspect each strategy, temporarily combine any strategies to preview their joint economics, then choose whether to save that combination as a permanent version.

Chart remains decision surface. Side panel handles permanent grouping, version history, archive, and restore. Extension remains read-only and never places, modifies, or exits broker orders.

## Superseded behavior

This design supersedes one-active-manual-plan-per-expiry behavior from `2026-07-29-manual-chart-strategy-builder-design.md`.

Existing ladder behavior remains:

- double-click ladder row opens exact-leg editor;
- saved leg keeps immutable entry premium, time, lots, direction, option type, strike, instrument, and expiry;
- live premiums change only after explicit refresh;
- TradingView axis remains source of chart coordinates;
- broker access remains read-only.

`PLAN BE` becomes strategy-specific `T1 BE`, `T2 BE`, and later strategy labels. Clicking strategy break-even label now opens that strategy's positions and P&L; it no longer cycles one anonymous plan position.

## Scope

This phase adds:

- multiple strategies for same selected instrument and expiry;
- explicit strategy ownership when adding every new leg;
- chart-native strategy selection through break-even labels and adjacent square controls;
- temporary combined-strategy preview;
- permanent create, merge, split, archive, restore, and immutable version history;
- charge-aware strategy payoff and break-even calculations;
- off-screen and overlapping break-even label handling;
- automatic ledger-history movement after expiry;
- local persistence and last-selected-strategy restore.

This phase does not add:

- automatic order placement or broker write calls;
- strategy recommendations;
- automatic grouping based on strike, time, or contract identity;
- automatic option-number refresh;
- cloud sync;
- 50% seller-premium increase alerts.

Premium alerts are next connected phase. They require background quote monitoring and Chrome notification permission and will consume saved strategy legs from this phase.

## Core terminology

### Leg

One unique trade entry with its own stable ID, instrument, expiry, strike, Call/Put type, Buy/Sell direction, lots, entry premium, entry timestamp, and known charges.

Two legs may use same contract and strike. Example: user sells one 24,000 Put today, then sells another 24,000 Put ten days later. They remain separate legs because entry time, premium, lots, and strategy ownership differ.

One unique leg belongs to exactly one active strategy. Product never shares same leg identity between strategies.

### Strategy

User-owned collection of legs for one instrument and one exact expiry. Strategy may be straddle, naked Call, naked Put, spread, hedge, or any other valid leg combination. Product never assumes structure from strategy name.

### Temporary preview

Unsaved combination of two or more selected strategies. Preview changes chart economics only. It does not move legs, archive strategies, or create history.

### Version

Immutable structural snapshot of one strategy. Adding, removing, moving, merging, splitting, or editing a leg creates new version. Live premium ticks and P&L updates do not create versions.

### Ledger History

Read-only history of archived, merged-source, expired, and completed strategies. History preserves all versions and remains inspectable.

## Chosen chart-selection UX

Three approaches were considered:

1. Permanent strategy chips across chart top — fast but consumes chart space.
2. Break-even labels with adjacent selection controls — chosen because it stays chart-native and keeps strategy identity at its financial boundary.
3. Expandable strategy tray — clean when closed but adds open/close action and lowers discoverability.

Chosen approach uses two independent hit targets:

- click `T1 BE 24,874` label to open T1 positions and live P&L;
- click adjacent square to include or exclude T1 from combined preview.

No double-click exists on strategy label or square. Existing ladder-row double-click remains reserved for leg editor.

Square states use existing Markup project tokens:

- unselected: empty square;
- selected: filled square using existing Markup green;
- no circular dot;
- no new semantic color.

When one strategy has multiple break-even rails, each rail shows same strategy square. Clicking any one toggles whole strategy. Every square for that strategy synchronizes immediately.

## Temporary combined preview

One selected strategy shows selection state but does not calculate a new combined map. Selecting two or more strategies calculates temporary combined payoff, charges, P&L, and every exact break-even.

Default preview chart shows combined break-even rails only. Original strategy rails hide to reduce clutter. `Compare` toggle reveals original strategy rails alongside combined rails.

Preview supports any number of compatible strategies, not only T1 and T2. All selected strategies must use same instrument and exact expiry. Incompatible selection fails closed and explains mismatch.

Preview disappears on refresh, chart reload, expiry change, instrument change, or explicit cancel. Saved strategies remain unchanged.

## Break-even label edge handling

### Off-screen break-even

When real strategy break-even lies outside visible TradingView price range, product pins compact marker to corresponding chart edge:

- `T1 BE 25,420 ↑` at top means real break-even is above visible range;
- `T1 BE 22,900 ↓` at bottom means real break-even is below visible range.

Edge marker preserves same two hit targets: label opens strategy positions/P&L; adjacent square controls preview membership. Marker never implies edge price equals real break-even.

### Overlapping break-even labels

Financial rails never move. When two or more label cards would overlap:

- keep every rail at exact break-even coordinate;
- stack label cards vertically with minimum safe spacing;
- draw short connector from each moved card back to its exact rail;
- keep each label and square as separate usable hit targets;
- preserve displayed exact break-even price.

This matches existing ladder collision principle: visual card may move for legibility; financial coordinate never moves.

## New-leg ownership

Every saved new leg asks user on chart:

- add to one existing compatible strategy; or
- create next strategy.

Product never guesses ownership from strike, contract, timing, or similar legs. Manual and broker-derived legs never silently merge.

## Permanent save and merge

Temporary preview remains unsaved until explicit `Save`.

Save always asks:

- create new strategy from selected strategies; or
- merge selected strategies into one chosen existing strategy.

Chart preview bar exposes `Save`, `Compare`, and `Clear`. `Save` opens chart-native
destination choices; choosing one is explicit permanent confirmation. Side panel
retains same versioned save operation for management use.

Create-new produces next strategy identity, such as T3 from T1 + T2. Merge-into-existing creates new version of selected destination strategy.

After successful permanent merge:

- source strategies move to Ledger History;
- source strategies are never deleted;
- merged strategy owns new resulting leg membership;
- operation either completes fully or changes nothing.

User can later split merged strategy. Split creates new immutable version and explicit destination ownership for separated legs.

Restore never rewrites history. Restoring old version creates new current version whose content matches selected historical version.

## Charges and financial calculations

Known brokerage, taxes, exchange fees, and other available transaction costs affect strategy payoff, P&L, and break-even calculations.

Missing charge evidence is never guessed. Result displays `EXCLUDING UNKNOWN CHARGES` when required data is unavailable.

Expiry payoff engine remains piecewise-linear and returns every exact zero crossing. It does not assume two break-evens, hide extra roots, or sample approximate chart points.

## Lifecycle and history

- Chart reopens last selected active strategy after reload.
- User may archive any active strategy manually.
- Successful permanent merge archives source strategies automatically.
- Exact-expiry completion automatically moves strategy to Ledger History.
- History remains fully viewable with all versions, legs, entry evidence, charges, and final economics.
- Archived or expired strategy cannot silently become active. Restore creates new active version.

## Data model

### Leg record

- stable leg ID;
- source: manual or read-only broker evidence;
- instrument identity;
- exact expiry;
- strike;
- option type;
- direction;
- lots and lot-size evidence;
- entry premium;
- entry timestamp;
- captured Call/Put snapshot when available;
- known charge records;
- created and updated timestamps.

### Strategy record

- stable strategy ID;
- display sequence such as T1;
- instrument identity;
- exact expiry;
- active, archived, or expired status;
- current version ID;
- created and updated timestamps.

### Strategy version

- stable version ID;
- parent version ID when present;
- ordered unique leg IDs;
- operation type: create, add, edit, remove, merge, split, restore;
- source strategy IDs for merge;
- user-confirmed destination decision;
- timestamp.

### Preview session

- selected strategy IDs;
- computed combined payoff and break-evens;
- Compare toggle state;
- creation timestamp;
- no persisted ownership mutation.

## Components

### Chart strategy interaction controller

Separates label click from square click, synchronizes same-strategy squares, owns temporary selection, and preserves ladder-row double-click behavior.

### Strategy payoff engine

Combines unique legs and known charges, calculates current P&L and exact expiry break-evens, and reports incomplete evidence without guessing.

### Break-even rail renderer

Projects exact rails through validated TradingView axis map, creates off-screen edge markers, stacks colliding label cards, and draws truthful connectors.

### Strategy version service

Creates atomic immutable versions for create, edit, merge, split, and restore. Prevents one leg identity from belonging to multiple active strategies.

### Side-panel strategy manager

Handles permanent save destination, history, archive, split, restore, charges, and strategy details. It never replaces chart-native temporary preview.

### Ledger History store

Preserves archived, merged-source, expired, and completed strategies and every immutable version.

### Persistence adapter

Uses `chrome.storage.local` now. Later cloud adapter may replace storage transport without changing strategy, version, or chart contracts.

## Data flow

1. User enters new leg from exact ladder row.
2. Product asks existing strategy or new strategy.
3. Unique leg and immutable entry snapshot save under chosen owner.
4. Explicit refresh updates live premium and P&L without changing entry snapshot or version.
5. User selects strategies through chart squares.
6. Engine combines selected legs and known charges into temporary preview.
7. Renderer shows combined break-even rails; Compare optionally restores original rails.
8. User cancels preview or saves permanently.
9. Save asks create-new or merge-into-existing.
10. Version service commits one atomic version and archives merge sources.
11. At expiry, strategy moves to Ledger History.

## Error handling

- Missing or stale premium: keep last verified number, mark `STALE`, and never invent P&L.
- Required preview leg missing valid data: show incomplete preview and no false break-even.
- Unsafe TradingView axis map: hide affected rails and edge markers; preserve strategy data.
- Invalid stored leg or version: exclude from calculation, preserve raw evidence, show review state.
- Storage failure: keep preview and current version unchanged; show `STRATEGY NOT SAVED`.
- Merge, split, or restore failure: operation changes nothing.
- Duplicate save event: idempotency key prevents duplicate version.
- Mixed instrument or expiry selection: reject preview/merge with explicit mismatch.
- Refresh remains manual with no retry storm.

## Accessibility

- Break-even label accessible name includes strategy ID, price, direction when off-screen, and action to open details.
- Square accessible name states include/exclude strategy and current selected state.
- Label and square remain separate keyboard-focus targets.
- `Enter` or `Space` activates focused target.
- Connector and color are not sole ownership indicators; visible strategy ID remains on every card.
- Stacked labels preserve logical focus order.

## Verification

### Unit tests

- same strike entered twice creates separate leg IDs and independent entry snapshots;
- one leg identity cannot belong to two active strategies;
- charges alter P&L and break-even correctly;
- every zero crossing returns exactly, including no-root and multi-root cases;
- preview never mutates persisted strategy;
- structural edit creates version; live quote tick does not;
- merge archives sources only after atomic destination save;
- restore creates new version without rewriting old version;
- expiry moves strategy into Ledger History.

### Interaction tests

- strategy label click opens positions/P&L and never toggles preview;
- square click toggles preview and never opens positions/P&L;
- no strategy control uses double-click;
- every square for same strategy synchronizes;
- two selected strategies show combined rails only by default;
- Compare reveals original rails;
- cancel and refresh discard preview only;
- off-screen break-even renders top or bottom edge marker with correct arrow;
- colliding label cards stack while rails retain exact coordinates;
- connector maps each moved label to correct rail;
- empty/filled square uses existing Markup tokens in light and dark modes.

### Chrome end-to-end checks

- create T1 through T5 using mixed Calls, Puts, Buys, and Sells;
- add same strike to different strategies on different dates as separate legs;
- select T1 and T2, preview combined economics, then cancel with no storage mutation;
- save selected strategies as new T3 and verify T1/T2 archive;
- merge into existing strategy and verify one new version;
- split merged strategy and restore historical version through new version;
- zoom break-even out of range and use edge label/square successfully;
- force label collision and verify both cards remain readable and clickable;
- reload chart and verify last active strategy restores;
- switch light/dark themes and verify token consistency;
- simulate stale quotes, axis loss, and storage failure;
- confirm expired strategy appears in Ledger History;
- inspect network/API surface and confirm zero broker write or order calls.

## Acceptance criteria

Feature succeeds when user can create multiple universal option strategies, inspect any strategy through its chart break-even label, select strategies independently through adjacent squares, preview combined charge-aware economics without mutation, save through explicit create-or-merge decision, preserve immutable versions and archived sources, restore through new versions, inspect expired strategies in Ledger History, and retain truthful chart placement through off-screen and collision states. No order placement, automatic grouping, automatic quote refresh, hidden data guess, circular selector, or NIFTY-specific core rule may exist.
