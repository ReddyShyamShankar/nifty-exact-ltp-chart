# Options Ladder — Manual Strategy Builder

Version 0.5.0 is a chart-first, manual NIFTY options planning candidate for TradingView. It builds same-expiry plans from explicit user entries and keeps entry snapshots separate from changing live option values.

## Manual strategy workflow

- Double-click any visible ladder row to add a manual Call or Put entry at that exact strike.
- Use `CALL ▾` or `PUT ▾`, then choose Buy or Sell from that staged menu.
- Set positive whole-number lots and an editable premium; the chosen live premium is only the starting value.
- The count dot reports saved entries at that strike, not lots.
- Live rows are black `#111315`, ATM live is orange `#ff9f0a`, Buy snapshots are green `#34d399`, and Sell snapshots are red `#f87171`.
- With saved entries, single-click cycles newest-first through one snapshot at a time, then returns to live.
- `PLAN BE` marks every exact price where the combined same-expiry payoff is zero after all saved Buy/Sell legs, premiums, strikes, and lots are combined. `PREVIEW BE` uses the valid unsaved draft before Add or Save.
- A manual refresh changes live values only; saved snapshots remain unchanged.
- Keyboard: `Shift+Enter` opens the focused row editor; `Enter` or `Space` keeps single-click behavior; `Escape` closes the editor or returns the row to live.
- The manual-only builder does not import broker positions or tradebooks and cannot place, modify, or cancel orders.

Add or Save writes the exact-expiry plan to local extension storage. Remove deletes only the selected entry. Close, outside click, or `Escape` cancels an unsaved draft. Reload, timeframe changes, zoom, and pan rebuild saved plan rails from local snapshots and TradingView's validated native price axis.

## Ladder and quick break-evens

The ladder shows 13 exact contracts: six below ATM, ATM, and six above. Row order stays `C <Call> | P <Put> | <strike>`, and every row stays anchored to its exact TradingView right-axis coordinate.

Click one ladder strike without saved entries to show independent single-leg expiry break-evens. CALL BE is strike plus displayed Call premium. PUT BE is strike minus displayed Put premium. Values are rounded to whole NIFTY points. An outside click removes both break-even rails. Manual refresh removes both break-even rails; click a strike again to calculate from refreshed numbers. These are independent single-leg expiry break-evens, not combined short-straddle break-evens.

## Data and failure boundaries

- Plans are NIFTY-only and keyed by one exact expiry.
- Live numbers change only after existing explicit manual refresh.
- Saved premiums and captured Call/Put snapshots never update from refresh, side-panel activity, timeframe changes, zoom, pan, or reload.
- Missing quotes, malformed local storage, unsupported timeframes, nonlinear scales, incomplete strike ranges, and invalid native-axis observations fail closed.
- No automatic option refresh, bottom tray, full option-chain table, Greeks, probability, margin, or recommendation engine is added.
- Chrome 141 or newer is required.

## TradingView status badge

The TradingView-owned compact status badge is cosmetic. LIVE uses green; OFFLINE uses red; disconnected also uses red; both use white text. If TradingView changes or removes the badge DOM, styling leaves the page unchanged. Badge styling cannot block the ladder, manual refresh, or break-even rails.

## Load candidate

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this `extension-axis-ladder` directory.
4. Open a logged-in TradingView NIFTY chart, select one exact expiry, and use the existing explicit refresh to load option values.

Existing Pine-sync extension v0.14.0 remains a separate untouched backup.

## Existing read-only seller-safety baseline

Click the pinned NIFTY extension icon on a TradingView tab to open the full-height side panel. The side panel is TradingView-only and retains the same seller-safety UI as the version 0.4.0 baseline. Switching tabs closes it.

Opening, closing, or resizing the side panel makes no seller-refresh, positions, trades, or option-chain requests. Panel open retains existing bridge-health, expiry-list, and Zerodha-status checks. Daily, use CONNECT ZERODHA, then press REFRESH ALL manually.

The seller-safety baseline remains independent from manual plans:

- A Zerodha tradebook CSV is staged as evidence. Every per-fill quantity stays under review, can be split across same-expiry strategies, or left explicitly unassigned.
- Manual strategy allocation requires operator review before accepted seller-risk evidence can appear.
- Confirmed coverage bounds advance only through successful daily checkpoints. A missing checkpoint creates **HISTORY GAP**.
- Weekly contracts retain exact expiry identity and never merge with monthly contracts.
- **REFRESH FAILED** immediately hides chart risk while preserving the last accepted evidence for review.
- The strategy selector restores an accepted strategy without another refresh.
- Current-risk boundaries use solid lines; whole-trade boundaries use dashed lines; profit and loss bands describe factual payoff regions.
- **EXCLUDING CHARGES** means unavailable broker charges were not deducted.
- Stale data preserves the last accepted evidence in the side panel but withholds chart risk until a successful refresh.

This baseline is read-only with no-order placement, modification, cancellation, conversion, or exit capability. It does not own, import into, or modify manual strategy-builder entries.
