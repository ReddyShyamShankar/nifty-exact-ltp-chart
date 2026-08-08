# Options Ladder — Chart Strategy Builder

Version 0.6.0 is a chart-first options planning candidate for TradingView. NIFTY is current connector and test case, while core design remains instrument-neutral: selected instrument/expiry supplies real strikes and TradingView axis supplies visible density.

## Strategy workflow

- Double-click any visible ladder row to add a manual Call or Put entry at that exact strike.
- Use `CALL ▾` or `PUT ▾`, then choose Buy or Sell from that staged menu.
- Set positive whole-number lots and an editable premium; the chosen live premium is only the starting value.
- Separate top-left `C2` and `P3` badges report saved Call and Put lots at that strike.
- One saved ARB Desk theme controls popup, side panel, and chart ladder together. Dark is default; the header sun/moon toggle switches every surface to the exact light token set.
- Live rows use the active ARB Desk panel tokens, ATM and selected rows use warning tokens with black text, Buy snapshots use accent tokens, and Sell snapshots use danger tokens.
- Original Options Ladder logo stays unchanged. Control icons follow ARB Desk. Geist Sans and Geist Mono are bundled locally, so extension typography never falls back or needs network access.
- Saving a new leg asks which compatible strategy owns it, or whether to create next strategy. Product never guesses ownership.
- Each strategy may contain any mix of Call/Put and Buy/Sell legs. Same contract may be entered again later as separate leg with its own premium, time, lots, and ownership.
- `T1 BE`, `T2 BE`, and later labels mark every exact expiry break-even for each strategy. Click label to open only that strategy's positions and live P&L.
- Adjacent 16-pixel square is independent selection control. Filled square includes whole strategy in temporary combined preview; label click never changes selection.
- Selecting two or more compatible strategies shows combined break-even rails. Original rails hide by default; **Compare** restores originals beside combined rails.
- Temporary preview never changes ownership or history. Refresh, reload, expiry/instrument change, or **Cancel** clears preview only.
- Off-screen roots remain available as exact `↑` or `↓` edge markers. Close cards stack for readability while connector returns to exact financial rail.
- Permanent **Save** on chart asks whether to create new strategy or merge into chosen existing strategy. Side panel exposes same versioned operation. Successful merge archives source strategies instead of deleting them.
- Side panel supports explicit leg split, manual archive, immutable version history, and restore. Restore creates new current version; old history never changes.
- Expired strategies move automatically into **Ledger History**. Last active strategy reopens for same instrument and exact expiry.
- Known charges affect P&L and break-evens. Missing charges show `EXCLUDING UNKNOWN CHARGES`; stale or missing quotes suppress combined economics until manual refresh.
- A manual refresh changes live values only; saved snapshots remain unchanged.
- Add and Save stay disabled until the selected Call/Put side has a valid non-negative premium and positive whole-number lot count; typing updates `PREVIEW BE` without closing or rebuilding the editor.
- Keyboard: `Shift+Enter` opens the focused row editor; `Enter` or `Space` keeps single-click behavior; `Escape` closes the editor or returns the row to live.
- Strategy builder cannot place, modify, cancel, convert, or exit orders.

Add, edit, remove, merge, split, archive, and restore each send one atomic mutation to background service worker, which serializes writes from every open TradingView tab before updating exact-expiry local storage. Storage failure preserves current version and temporary preview. Duplicate command does not duplicate strategy. Close, outside click, or `Escape` cancels unsaved draft. Reload, timeframe changes, zoom, and pan rebuild strategy rails from local evidence and TradingView's validated native price axis.

## Premium history trial

Click only the rightmost strike number, such as `24,400`, to open exact-expiry Call and Put premium history directly on TradingView. Clicking rest of row keeps quick break-even behavior; double-clicking rest of row keeps manual editor behavior. History load remains one explicit user action. Crosshair movement, pan, and zoom reuse cached history and make no request. TradingView timeframe change requests matching interval only when absent from cache.

Stable TradingView time-axis evidence is master: Skyline uses same visible dates, same horizontal plot bounds, and same pointer x-coordinate. Crosshair snaps to exact joined candle slot and reads premium only from that identical timestamp. Underlying candle without option candle reports **NO PREMIUM CANDLE**. Empty chart space never receives invented clock time or borrowed distant premium. Observer stays disabled while history is closed. Expiry/instrument change, navigation, close, or disable clears transient selection. Current NIFTY connector reads Upstox history; provider-specific minute/hour limits are chunked inside one explicit load with no automatic retry.

Selected history strike remains visually distinct in ladder. Passive horizontal guide extends left from exact strike coordinate without candle-touch dots. Timeframe, zoom, and pan redraw guide from cached evidence without fetching history or changing TradingView. Closing history or changing instrument/expiry removes row highlight, guide, and Skyline. Crosshair shows one green Call value chip and one orange Put value chip—never duplicate side labels.

**PREMIUM SKYLINE** is sole production premium-history projection. Selected strike is baseline. Call close premium draws as solid history above baseline; Put close premium draws as dashed history below. At strike `24,200`, Call premium `200` maps to chart coordinate `24,400`; Put premium `100` maps to `24,100`. This mapping communicates premium magnitude in points; it does not predict underlying price. Missing premium candles split line into real gaps. Shared crosshair shows exact timestamp, Call, Put, and strike. One reusable passive canvas keeps TradingView interaction ownership and bounds zoomed-out work by screen pixels. No lower history box, mode selector, broker write, storage write, or order action is added.

## Ladder and quick break-evens

The ladder has no fixed row count and no ATM-centered membership window. It considers every real strike returned for selected instrument and expiry, then shows strikes intersecting TradingView's stable visible right-axis grid. One explicit reference exception keeps the real nearest available ATM strike visible when its exact price remains inside the chart's visible range, even if it falls between printed axis labels. ATM never changes range or density. Light mode uses the ARB Desk brown warning token; dark mode uses the ARB Desk orange warning token. When live-price marker covers one expected grid label, surrounding stable cadence supplies rounded slot, such as `24,300` beneath `24,296.60`. Row order stays `C <Call> | P <Put> | <strike>`. Every visible row stays in one right-edge column at exact price coordinate.

The extension never double-clicks or drags TradingView's price scale and does not request Chrome debugger access. TradingView Auto-fit remains under user control. Timeframe-specific 50/100/250/500 spacing rules are not used. Zoom and pan read fresh native ticks, remap cached rows, and make no option-chain request. Zoom guidance appears only when no row can be shown safely.

Click one ladder strike without saved entries to show independent single-leg expiry break-evens. CALL BE is strike plus displayed Call premium. PUT BE is strike minus displayed Put premium. Values use selected instrument's valid display precision. An outside click removes both break-even rails. Manual refresh removes both break-even rails; click a strike again to calculate from refreshed numbers. These are independent single-leg expiry break-evens, not combined short-straddle break-evens.

## Data and failure boundaries

- Strategies are keyed by instrument and one exact expiry. NIFTY is current test case, not architectural scope.
- Live numbers change only after existing explicit manual refresh.
- Saved premiums and captured Call/Put snapshots never update from refresh, side-panel activity, timeframe changes, zoom, pan, or reload.
- Only the selected side needs a captured snapshot; an unavailable opposite-side snapshot remains shown as `—` and is never backfilled.
- Malformed stored entries are quarantined for recovery; valid edits do not erase recovery data.
- Missing quotes, unsupported timeframes, nonlinear scales, incomplete strike ranges, and invalid native-axis observations fail closed.
- No automatic option refresh, bottom tray, full option-chain table, Greeks, probability, margin, or recommendation engine is added.
- Chrome 141 or newer is required.

## TradingView status badge

The TradingView-owned compact status badge is cosmetic. LIVE uses green; OFFLINE uses red; disconnected also uses red; both use white text. If TradingView changes or removes the badge DOM, styling leaves the page unchanged. Badge styling cannot block the ladder, manual refresh, or break-even rails.

## Load candidate

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this `extension-axis-ladder` directory.
4. Open logged-in TradingView NIFTY chart, select one exact expiry, click pinned Options Ladder icon, then choose **REFRESH ALL**.

Existing Pine-sync extension v0.14.0 remains a separate untouched backup.

## Compact toolbar popup and read-only seller-safety baseline

Click the pinned Options Ladder icon on a TradingView tab to open a compact popup. **REFRESH ALL** captures connected-broker evidence, updates chart option numbers, and reports progress in the popup. **Open side panel** opens the full-height seller-safety controls. Clicking outside closes the popup. The side panel is TradingView-only and retains the same seller-safety UI as the version 0.4.0 baseline. Switching tabs closes an open panel.

Popup REFRESH ALL first captures connected-broker positions, funds, and margin evidence, then refreshes ladder option numbers. Opening, closing, or resizing the side panel makes no seller-refresh, positions, trades, or option-chain requests. Panel open retains existing bridge-health, expiry-list, and Zerodha-status checks. Daily, use CONNECT ZERODHA, then press REFRESH ALL manually.

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
