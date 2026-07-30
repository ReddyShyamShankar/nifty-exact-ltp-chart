# NIFTY Axis Ladder + Manual Strategy Builder + Seller Safety Map

Version 0.5.0 adds a manual NIFTY options strategy builder directly to the TradingView exact-axis ladder.

## Candidate workflow

- Double-click any visible ladder row to add a manual Call or Put entry at that exact strike.
- Use `CALL ▾` or `PUT ▾`, then choose Buy or Sell from that staged menu.
- Set positive whole-number lots and an editable premium; the displayed premium is only the starting value.
- Separate top-left `C2` and `P3` badges report saved Call and Put lots at that strike.
- One saved ARB Desk theme controls popup, side panel, and chart ladder together. Dark is default; the header sun/moon toggle switches every surface to the exact light token set.
- Live rows use the active ARB Desk panel tokens, ATM and selected rows use warning tokens with black text, Buy snapshots use accent tokens, and Sell snapshots use danger tokens.
- Original Options Ladder logo stays unchanged. Control icons follow ARB Desk. Geist Sans and Geist Mono are bundled locally, so extension typography never falls back or needs network access.
- With saved entries, single-click cycles newest-first through one snapshot at a time, then returns to live.
- `PLAN BE` marks every exact price where the combined same-expiry payoff is zero after all saved legs are combined.
- Break-even rails span the plot in both directions. Click a plan rail label to flip through individual position P&L for that side; values are approximate and never combined.
- A manual refresh changes live values only; saved snapshots remain unchanged.
- Add and Save stay disabled until the selected Call/Put side has a valid non-negative premium and positive whole-number lot count; typing previews payoff without closing or rebuilding the editor.
- Keyboard: `Shift+Enter` opens the focused row editor; `Enter` or `Space` keeps single-click behavior; `Escape` closes the editor or returns the row to live.
- The manual-only builder does not import broker positions or tradebooks and cannot place, modify, or cancel orders.

Plans stay in local extension storage, keyed by exact expiry. The background service worker serializes mutations across tabs so one valid edit cannot overwrite another. Entry premiums and captured snapshots remain fixed through refresh, reload, timeframe changes, zoom, pan, and side-panel activity; an unavailable opposite-side snapshot remains unavailable. Malformed stored entries are quarantined for recovery and reported as `MANUAL ENTRY NEEDS REVIEW` instead of being discarded. Invalid axis data fails closed.

Extension never changes TradingView price scale or Auto-fit state and requests no Chrome debugger access. Visible ladder rows use one column and follow TradingView's current native right-axis ticks; timeframe-specific 50/100/250/500 rules are not used. True ATM stays included. Zoom and pan remap cached rows without requesting option data.

## Setup

Load [`extension-axis-ladder`](extension-axis-ladder) as an unpacked extension in Chrome 141 or newer. Open a logged-in TradingView NIFTY chart, select the exact expiry, and click the pinned extension icon. Use **Refresh ladder** to fetch current option values or **Open side panel** for full controls. Double-click a row to start the manual plan.

No automatic option refresh, full option-chain table, bottom tray, Greeks, probability, margin, or recommendation path is added. Existing broker and seller-safety code remains independent from manual-plan storage and was not changed by this candidate.

## Compact toolbar popup and read-only side panel

Click the pinned Options Ladder icon on a TradingView tab to open a compact popup. **Refresh ladder** updates chart option numbers and reports progress in the popup. **Open side panel** opens the full-height seller-safety controls. Clicking outside closes the popup. The side panel is TradingView-only and retains the same seller-safety UI as the version 0.4.0 baseline. Switching tabs closes an open panel.

Popup refresh updates ladder option numbers only. Opening, closing, or resizing the side panel makes no seller-refresh, positions, trades, or option-chain requests. Panel open retains existing bridge-health, expiry-list, and Zerodha-status checks. Daily, use CONNECT ZERODHA, then press REFRESH ALL manually. This existing read-only workflow remains separate from manual strategy entries and has no-order capability.

See the [extension guide](extension-axis-ladder/README.md) for exact row behavior, independent quick break-evens, combined plan break-evens, failure boundaries, and keyboard controls.
