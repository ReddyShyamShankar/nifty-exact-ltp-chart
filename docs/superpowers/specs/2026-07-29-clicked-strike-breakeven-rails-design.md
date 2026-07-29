# Clicked-Strike Break-Even Rails — Design

Date: 2026-07-29  
Status: approved for implementation

## Goal

Let user click one visible NIFTY ladder row and read that strike's single-leg Call and Put expiry break-evens directly against TradingView price axis. Preserve existing thirteen-row ladder density. Show nothing until explicit strike click.

## Scope

This P0 adds:

- two chart-native break-even rails for clicked strike;
- one selected-row state;
- outside-click dismissal;
- bounded off-screen markers;
- missing-price feedback;
- full-color styling for TradingView's native `LIVE` status badge.

This P0 does not add strategy payoff, combined short-straddle break-evens, safe-zone shading, order placement, automatic selection, or persisted selection.

## Financial meaning

For selected row with strike `K`, Call premium `C`, and Put premium `P`:

- Call break-even at expiry: `K + C`
- Put break-even at expiry: `K - P`

Display both prices rounded to nearest whole NIFTY point. Example for strike `24,300`, Call `219.20`, Put `402.00`:

- `CALL BE 24,519 · SELL BELOW ↓`
- `PUT BE 23,898 · SELL ABOVE ↑`

Labels describe independent single-leg expiry break-evens. They must not imply combined-strategy break-evens. Short Call is profitable below its independent break-even at expiry; short Put is profitable above its independent break-even at expiry.

## Chart interaction

Default state contains no break-even rail, marker, or selection.

1. Clicking one ladder row selects its exact strike.
2. Selected non-ATM row keeps existing size and dark fill, adding mint outline.
3. Selected ATM row keeps existing solid mint fill and adds a visible outer selection ring.
4. Clicking another row replaces selection and recalculates both rails from that row.
5. Clicking anywhere outside ladder rows clears selection, both rails, off-screen markers, and missing-price feedback.
6. Manual option-number refresh also clears selection. User must click a strike again after refresh.
7. Timeframe, zoom, pan, resize, and valid axis remapping move visible rails but never create a selection.

Only row elements accept pointer input. Full-screen ladder overlay remains pointer-transparent so chart interactions continue normally outside rows.

## Rail presentation

Each valid break-even uses current TradingView native linear price map, same map that anchors ladder strikes.

- Call rail: thin blue dashed horizontal line.
- Put rail: thin amber dashed horizontal line.
- Labels use dark ladder surface, white text, tabular monospaced numbers, and matching blue or amber edge.
- Labels sit inside chart plot, immediately left of ladder's lane-zero edge, avoiding TradingView price scale.
- Rails do not change ladder row width, height, lane, or strike position.
- No area between rails is shaded.

If break-even falls outside current plot rectangle, renderer replaces rail with compact marker at corresponding top or bottom plot edge. Marker keeps type, rounded value, and directional arrow. Marker never pretends off-screen value equals edge price.

## Selection data flow

`clicked row -> exact row snapshot -> break-even calculator -> native price-to-y map -> rails or edge markers`

Selection stores exact strike plus Call and Put premiums from row clicked. Renderer derives view each time axis map changes. Manual refresh clears selection before row values update, preventing old selection from silently adopting new premiums.

Break-even calculator remains pure and separate from DOM renderer. It accepts numeric strike and premiums, returns rounded Call and Put break-evens, or returns invalid result when either premium is unavailable.

## Missing or invalid prices

If either Call or Put premium is missing, non-numeric, or negative:

- render no break-even rail or edge marker;
- keep clicked row selected long enough to explain response;
- show compact `OPTION PRICE UNAVAILABLE` status;
- outside click clears status and selection.

No zero, guessed, neighboring-strike, or cached substitute may be used.

If native axis map is temporarily unavailable after valid selection, conceal rails and reuse existing bounded axis-retry behavior. Restore rails only when same selected snapshot can be mapped by validated axis data. Do not calculate screen coordinates from guesses.

## TradingView LIVE badge

Screenshot target is TradingView's native compact `LIVE` badge attached to Publish control, not extension-owned status.

- Observed `LIVE` state: full green background with white text.
- Observed `OFFLINE` or disconnected state: full red background with white text.
- Restyle compact status badge only; do not recolor entire Publish control.
- Preserve badge text, dimensions, click behavior, and TradingView ownership.
- Reapply styling after TradingView rerenders top bar.
- If exact badge cannot be identified safely, leave TradingView unchanged. Never style another button by positional guess.

This styling is cosmetic and brittle because TradingView owns DOM. Ladder rendering, refresh, and break-even behavior must not depend on badge detection or styling success.

## Components

### Break-even calculator

Validates selected row and calculates two independent rounded expiry break-evens.

### Selection controller

Owns one ephemeral selected-row snapshot. Handles row click, row replacement, outside click, manual refresh, and invalid-price status.

### Rail renderer

Uses validated native price map and plot bounds to render exact horizontal rails or truthful off-screen markers.

### LIVE badge decorator

Finds TradingView's native status badge by constrained semantic evidence, applies state color, and observes bounded top-bar rerenders. It has no data or control relationship with option ladder.

## Accessibility

- Clickable ladder rows expose button semantics and selected state.
- Keyboard `Enter` or `Space` performs same row selection as pointer click.
- `Escape` counts as outside dismissal and clears selection.
- Rail labels include full textual type, value, and seller direction; color is not sole meaning.

## Verification

### Unit tests

- `24,300 + 219.20` displays `24,519`.
- `24,300 - 402.00` displays `23,898`.
- Nearest-whole-point rounding is deterministic.
- Missing, non-numeric, or negative premium returns invalid result.
- Row click creates one selection containing exact clicked snapshot.
- Different row click replaces selection.
- Outside click, `Escape`, and manual refresh clear selection.
- Timeframe, zoom, pan, and resize never create selection.
- Off-screen projection reports correct top or bottom edge without changing price.
- Combined premiums never enter single-leg calculator.

### DOM tests

- Non-ATM selected row receives mint outline without size change.
- ATM selected row preserves solid mint fill and gains outer ring.
- Only selected strike produces two rails.
- Rail labels use rounded values and seller directions.
- Outside chart click removes all selection artifacts.
- Missing price shows status and no rails.
- `LIVE` fixture receives green background and white text.
- `OFFLINE` fixture receives red background and white text.
- Unrelated TradingView controls remain unchanged when badge is absent or ambiguous.

### Browser checks

- Click visible row on NIFTY chart: exact Call and Put rails appear at correct axis coordinates.
- Click another row: old rails disappear and new rails replace them.
- Click chart candle area: rails disappear immediately and chart click still works.
- Change zoom and timeframe after selection: rails follow validated axis map; no new selection appears.
- Put one or both break-evens outside viewport: correct edge markers appear.
- Press manual refresh: rails disappear and remain absent until next strike click.
- Verify TradingView top-bar `LIVE` badge is full green with white text; simulated offline state is full red.

## Acceptance criteria

P0 succeeds when nothing appears until user clicks exact ladder row; click produces two accurate, rounded, single-leg expiry break-even levels; another row replaces them; any outside click or manual refresh removes them; axis changes preserve exact mapping without creating selection; invalid premiums fail closed; ladder rows never expand; no safe-zone shading appears; and native TradingView status badge receives safe full-color state styling without affecting extension function.
