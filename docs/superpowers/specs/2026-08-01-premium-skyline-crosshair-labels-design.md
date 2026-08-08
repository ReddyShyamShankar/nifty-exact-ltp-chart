# Premium Skyline Spatial Crosshair Labels

**Date:** 2026-08-01
**Status:** APPROVED — OPTION A
**Scope:** Replace Premium Skyline paragraph tooltip with chart-positioned timestamp, Call, Put, and strike labels.

## Goal

Crosshair must answer four questions without paragraph reading:

1. Which TradingView candle time is active?
2. What was exact Call premium at that time?
3. What was exact Put premium at that time?
4. Which exact strike and expiry history is selected?

Meaning comes from label position. Call belongs above selected-strike baseline. Put belongs below. Strike stays on baseline. Timestamp stays at top of crosshair.

## Locked layout

- Remove wide two-line paragraph tooltip completely.
- Keep existing vertical shared crosshair.
- Place compact date/time chip at top of crosshair.
- Place `CALL <premium> ↑` chip immediately above matching Call Skyline point.
- Place `PUT <premium> ↓` chip immediately below matching Put Skyline point.
- Keep exactly one chip per option side. Do not add a separate `CALL` or `PUT` badge/button.
- Place selected strike chip at crosshair and strike-baseline intersection.
- Keep exact-expiry identity in Skyline's persistent top-left label; do not repeat expiry inside every moving chip.
- Keep Call solid, Put dashed, and selected-strike baseline unchanged.

## Data contract

- Every chip reads one exact joined timestamp selected by existing synchronized TradingView crosshair.
- Call chip appears only when same timestamp contains real Call premium.
- Put chip appears only when same timestamp contains real Put premium.
- Missing side never borrows nearest premium, forward-fills, interpolates, or shows zero.
- When both sides are missing, show one compact `NO PREMIUM CANDLE` chip beside strike chip. Do not restore paragraph tooltip.
- Strike chip always uses selected real contract strike, never live underlying price.

## Collision behavior

- Chips stay inside TradingView plot rectangle.
- Date chip clamps horizontally while remaining at plot top.
- Call chip prefers above Call point. Near top boundary, it flips below point.
- Put chip prefers below Put point. Near bottom boundary, it flips above point.
- Call and Put chips keep minimum 6-pixel distance from point marker.
- Strike chip centers on baseline unless chart edge requires horizontal clamping.
- When labels would overlap, Call/Put chips shift horizontally away from crosshair by smallest safe distance; thin point marker preserves exact sample location.
- Label collision handling changes only label position. Data point and crosshair never move.

## Visual tokens

- Use existing ARB Desk tokens only.
- Call value chip uses existing ARB Desk green accent token.
- Put value chip uses existing ARB Desk orange warning token.
- Light mode uses white chip text; dark mode uses contrast ink for readable contrast.
- Timestamp remains theme-neutral; strike chip keeps existing warning treatment.
- Geist Mono remains sole typeface.
- No new color literal, gradient, shadow, radius family, or profit/loss semantic color.

## Selected-strike guide refinement

- Keep selected ladder-row highlight and horizontal selected-strike guide.
- Remove square candle-touch dots from guide. They add noise without helping premium comparison.

## Interaction and performance

- Canvas remains `pointer-events: none`; TradingView keeps pointer ownership.
- Pointer movement updates at most once per animation frame.
- Reuse existing canvas. No DOM node per chip or candle.
- Crosshair movement makes no network request, storage write, broker action, or strategy mutation.
- Repeated identical pointer state causes no repaint.
- Closing history, changing expiry/instrument, navigation, or extension disable clears all four chips.

## Accessibility

- Visual labels use readable contrast in both themes.
- Canvas remains supplemental. Existing selected-row accessible name retains exact strike and premium values.
- Missing premium state stays explicit; absence is never visually mistaken for zero.

## Acceptance

1. Wide paragraph tooltip never appears.
2. Timestamp appears above crosshair.
3. Call label appears at Call point; Put label appears at Put point; strike label appears on baseline.
4. One missing side hides only that side's chip.
5. Both missing sides show compact `NO PREMIUM CANDLE` state.
6. Labels remain inside plot at left, right, top, and bottom edges.
7. Shared crosshair time and premium values remain exact.
8. Light and dark themes use existing tokens only.
9. TradingView chart interactions remain unblocked.
10. Full extension suite and live Chrome UAT pass without Page Unresponsive regression.

## Exclusions

- No persistent tooltip panel.
- No right-axis premium tags.
- No split-left/right crosshair layout.
- No changes to Skyline geometry, premium history requests, strategy trades, ladder membership, or broker permissions.
