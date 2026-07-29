# Manual Chart Strategy Builder — Design

Date: 2026-07-29  
Status: design approved; written-spec review pending

## Goal

Let user build and test a manual NIFTY options position directly on TradingView. User should be able to double-click an exact ladder strike, add a Call or Put Buy/Sell leg with lots and entry premium, then see combined expiry break-evens move on chart immediately.

This is a chart-first learning and planning tool. It is not a broker position importer and never places an order.

## Scope

This phase adds:

- one active manual plan for each exact NIFTY expiry;
- an inline editor at the exact double-clicked ladder row;
- Call/Put and Buy/Sell selection;
- lot and entry-premium editing;
- persistent manual entries and entry-time Call/Put snapshots;
- count dots on strikes containing saved entries;
- live-to-entry row flipping;
- combined expiry payoff and exact break-even rails;
- live preview while a draft leg is being changed;
- editing and removing saved manual entries.

This phase does not add:

- Zerodha live-position import;
- tradebook ownership or allocation;
- broker order placement or modification;
- automatic option-number refresh;
- a bottom tray;
- a full option-chain table;
- win-rate, probability, margin, Greeks, or strategy recommendations.

## Financial meaning

Every manual leg contains exact expiry, strike, option type, direction, lots, and entry premium. At expiry price `S`:

- Buy Call payoff per lot: `max(S - strike, 0) - premium`
- Sell Call payoff per lot: `premium - max(S - strike, 0)`
- Buy Put payoff per lot: `max(strike - S, 0) - premium`
- Sell Put payoff per lot: `premium - max(strike - S, 0)`

Each payoff is multiplied by entered lots. Every leg in one manual plan must use same NIFTY expiry. NIFTY lot-size multiplier is common to all legs for that expiry, so it changes rupee P&L but not zero-crossing prices.

Combined expiry payoff is sum of all saved legs. Break-evens are every exact underlying price where combined payoff crosses zero. Calculator must solve piecewise-linear payoff exactly, not sample a chart and guess.

Common seller positions usually produce lower and upper break-evens. If a valid position produces more than two zero crossings, renderer shows every crossing. It must never hide extra crossings or falsely label only outer values as complete safe boundaries.

Reference calculations from approved examples:

- Sell 1 lot 24,100 Call at 358 plus Sell 3 lots 24,000 Put at 183: break-evens `23,698` and `25,007`.
- Changing 24,100 Call from 1 lot to 2 lots while keeping 3 Put lots: break-evens `23,578` and `24,733`.

## Default ladder state

Live ladder keeps current three-part structure:

`C <live Call premium> | P <live Put premium> | <strike>`

Live premiums continue changing only after explicit manual refresh, following existing product rule. A saved entry never overwrites or silently updates its captured entry snapshot.

Rows use exact markup-project tokens:

- live row surface: existing black `#111315`;
- ATM live row: orange `#ff9f0a`;
- Buy entry face: green `#34d399`;
- Sell entry face: red `#f87171`.

No new semantic color is introduced. Existing transient selected/editor yellow may remain because it already belongs to current product selection system. ATM changes from current mint fill to exact markup orange.

## Inline editor

Double-clicking any visible ladder row opens one compact editor at same y-coordinate. Editor replaces that row visually and expands left into chart. No bottom tray or detached modal appears.

Editor contains one compact row:

- `CALL ▾` control with `Buy Call` and `Sell Call` choices;
- `PUT ▾` control with `Buy Put` and `Sell Put` choices;
- lot stepper;
- narrow editable entry-premium field;
- `ADD` for a new entry or `SAVE` for an existing entry;
- close `×`;
- neutral `REMOVE` action only while editing a saved entry.

Strike is not repeated inside editor because editor remains anchored to exact strike level and right price-axis position. Entry-premium field auto-fills from corresponding displayed Call or Put premium after user chooses action. User may replace it with actual paid or collected premium.

Selecting Call does not show Put actions. Selecting Put does not show Call actions. This staged two-choice menu replaces four permanently visible Buy/Sell buttons.

Editor rules:

- lots must be a positive whole number;
- premium must be finite and non-negative;
- close, `Escape`, or outside click cancels unsaved draft;
- invalid draft renders no preview and preserves current saved plan;
- `REMOVE` affects only selected saved entry and never another entry at same strike;
- manual refresh closes editor but does not modify saved entries.

## Click and double-click behavior

Single and double click must not trigger each other.

- Single click on row without saved manual entries keeps existing independent Call/Put quick-break-even behavior.
- Single click on row with saved entries flips row from live face to saved entry face.
- Repeated single clicks cycle saved entry faces newest-first, then return to live face.
- Double-click on live face opens new-entry editor.
- Double-click on saved entry face opens same editor prefilled for that exact entry.
- Outside click, `Escape`, expiry change, timeframe transition, or row rebuild returns flipped rows to live faces without deleting saved entries.

Implementation must delay single-click action for normal double-click recognition window and cancel pending single click when second click arrives. Double-click must never flash quick break-even rails or flip row before editor opens.

Keyboard parity:

- `Enter` or `Space` performs single-click behavior;
- a documented keyboard action opens editor for focused row;
- `Escape` closes editor or returns entry face to live;
- focus remains at same strike after close, save, or remove.

## Count dot

Any live row containing saved entries shows one compact neutral count dot. Dot value is number of saved manual entries at that strike, not number of lots. This confirms position already exists without keeping expanded detail visible.

Count dot remains visible on entry faces. It uses existing black/white neutral tokens so it does not introduce another semantic state color.

## Entry face

Only one face exists at a time:

- black face shows current live premiums;
- green or red face shows one fixed entry snapshot.

Entry face uses same width, height, pointer, typography, and three-column order as live row:

`C <entry-time Call premium> | P <entry-time Put premium> | <same strike>`

No `BUY`, `SELL`, `CALL`, `PUT`, flip, refresh, or explanatory icon is added. Fill color carries Buy/Sell direction. Traded Call or Put cell appends compact `×<lots>` and receives stronger text weight, so option type and lots remain readable without writing `SELL C` or `BUY P`. Other option premium remains entry-time market snapshot.

Example Sell 2 Call lots at strike 24,450:

`C 358.00 ×2 | P 414.60 | 24,450`

If user edits traded premium before Add, edited premium becomes captured value for traded side. Opposite side keeps displayed market value captured at Add time. Later option refreshes change black live face only.

When multiple entries exist at same strike, repeated click cycles one colored entry face at a time. No two entry cards stack and no live and entry row display together.

## Combined break-even preview and saved view

Valid editor changes calculate a temporary plan:

`existing saved entries + current draft`

Chart immediately moves preview break-even rails while user changes option type, Buy/Sell direction, lots, or premium. Cancel removes preview and restores saved-plan rails. Add or Save commits draft and converts preview into saved plan.

Combined manual-plan rails use existing neutral chart tokens and explicit `PLAN BE` labels. They do not reuse blue/amber independent single-leg meaning. No colored profit zone is added in this phase.

Saved plan break-even rails persist through timeframe, zoom, pan, resize, and manual option-number refresh. Rails use same validated TradingView native price map and fail closed when axis capture is unavailable. Expiry switch displays only plan stored for newly selected exact expiry.

Existing clicked-strike quick rails remain independent single-leg calculations. They never enter manual-plan payoff calculation.

## Data model and persistence

Manual plans live in `chrome.storage.local`, keyed by exact NIFTY expiry identity.

Each saved entry stores:

- stable entry ID;
- underlying `NIFTY`;
- exact expiry;
- strike;
- option type `CALL` or `PUT`;
- direction `BUY` or `SELL`;
- positive whole-number lots;
- traded premium;
- captured Call premium;
- captured Put premium;
- created timestamp;
- updated timestamp.

Only explicit Add, Save, or Remove mutates stored plan. Live option refresh, timeframe change, zoom, pan, browser reload, or side-panel open never modifies manual entries.

Malformed stored entries fail closed, remain excluded from payoff calculation, and report compact `MANUAL ENTRY NEEDS REVIEW` status. No guessed strike, premium, direction, lots, or expiry may be substituted.

## Components

### Manual plan model

Validates, normalizes, stores, edits, and removes expiry-keyed manual entries. Pure data rules stay separate from DOM.

### Expiry payoff calculator

Builds combined piecewise-linear expiry payoff and returns every exact zero crossing. Pure module with no browser dependency.

### Draft preview controller

Owns one open add/edit draft. Produces temporary plan for live break-even preview and never mutates saved plan until Add or Save.

### Ladder interaction controller

Separates single click from double click, owns live/entry/editor face state, cycles multiple entries, and restores live rows during lifecycle changes.

### Inline editor renderer

Renders compact Call/Put menus, lot stepper, narrow premium field, Add/Save/Remove actions, focus handling, and validation feedback at exact strike location.

### Manual break-even renderer

Projects saved or preview break-evens through validated native axis map. Uses neutral labels and truthful off-screen markers.

Existing live option fetcher, seller ledger, broker side panel, and Zerodha read-only workflow remain independent.

## Error handling

- Missing selected-side live premium: editor opens with blank premium and requires manual valid value.
- Missing opposite-side premium: entry may save traded leg, but captured opposite side displays unavailable marker rather than zero.
- Invalid lots or premium: Add/Save disabled; no preview.
- Invalid stored entry: exclude from payoff, show review status, preserve raw storage for recovery.
- Temporary axis failure: conceal plan rails, preserve plan, restore after validated remap.
- Storage write failure: keep editor open, keep old saved plan, show `PLAN NOT SAVED`.
- Refresh failure: preserve saved entries and captured snapshots.
- Unsupported symbol or mixed expiry: reject draft; never merge it into active plan.

## Accessibility

- Live rows remain buttons with clear accessible names containing live Call, Put, strike, and saved-entry count.
- Entry faces announce Buy/Sell direction, traded option type, lots, captured Call/Put values, strike, and position within entry cycle.
- Count dot has text equivalent in row accessible name; color is not sole meaning for assistive technology.
- Menus, stepper, premium input, Add/Save/Remove, and close are keyboard reachable.
- Buy/Sell meaning is available in accessible text even though visible face uses only color and emphasized traded cell.

## Verification

### Unit tests

- Four leg payoff formulas return exact expiry values.
- One-lot and two-lot approved examples return `23,698 / 25,007` and `23,578 / 24,733`.
- Piecewise solver returns every zero crossing and never sampled approximations.
- Invalid lots, premium, strike, expiry, type, or direction fail closed.
- Captured snapshots remain immutable across live refreshes.
- Draft preview never mutates saved plan.
- Expiry-keyed plans never merge.

### DOM and interaction tests

- Double-click opens editor at same strike row and does not fire single-click behavior.
- Editor omits strike repetition and four-button action wall.
- Call and Put each open only Buy/Sell choices.
- Price auto-fills selected live premium and remains editable.
- Add creates count dot and one saved entry.
- Black row flips to one colored entry face; live and entry never show together.
- Multiple entries cycle newest-first and return to live.
- Entry face keeps exact `Call | Put | strike` column positions.
- Traded side shows `×lots`; no visible `SELL C`, `BUY P`, or flip icon appears.
- ATM live face uses `#ff9f0a`.
- Buy entry face uses `#34d399`.
- Sell entry face uses `#f87171`.
- Outside click closes draft or returns row to live without deleting plan.
- Save edits exact entry; Remove deletes exact entry only.
- Manual refresh changes live face but not captured snapshot.

### Browser checks

- Build two-leg manual seller position and confirm combined rails match independent strategy-builder reference.
- Change one leg from one lot to two lots and confirm rails move to new approved break-evens.
- Pan, zoom, switch timeframe, and return: rows and plan rails stay at exact native-axis coordinates.
- Refresh option numbers: black values change; green/red entry snapshot remains fixed.
- Add Call and Put entries at same strike: count dot increments and clicks cycle both snapshots.
- Reload TradingView: exact-expiry manual plan and count dots restore without broker requests.

## Acceptance criteria

Feature succeeds when user can build, preview, save, inspect, edit, and remove a manual same-expiry NIFTY options plan without leaving chart; combined expiry break-evens react correctly to strike, direction, premium, and lot changes; live premiums remain visually separate from immutable entry snapshots; count dots confirm saved entries; live, ATM, Buy, and Sell faces use exact existing color tokens; double-click editor stays at exact strike; no bottom tray, broker import, automatic refresh, order placement, or unnecessary label/icon appears.
