# NIFTY Axis Ladder + Manual Strategy Builder + Seller Safety Map

Version 0.5.0 adds a manual NIFTY options strategy builder directly to the TradingView exact-axis ladder.

## Candidate workflow

- Double-click any visible ladder row to add a manual Call or Put entry at that exact strike.
- Use `CALL ▾` or `PUT ▾`, then choose Buy or Sell from that staged menu.
- Set positive whole-number lots and an editable premium; the displayed premium is only the starting value.
- The count dot reports saved entries at that strike, not lots.
- Live rows are black `#111315`, ATM live is orange `#ff9f0a`, Buy snapshots are green `#34d399`, and Sell snapshots are red `#f87171`.
- With saved entries, single-click cycles newest-first through one snapshot at a time, then returns to live.
- `PLAN BE` marks every exact price where the combined same-expiry payoff is zero after all saved legs are combined.
- A manual refresh changes live values only; saved snapshots remain unchanged.
- Add and Save stay disabled until the selected Call/Put side has a valid non-negative premium and positive whole-number lot count; typing previews payoff without closing or rebuilding the editor.
- Keyboard: `Shift+Enter` opens the focused row editor; `Enter` or `Space` keeps single-click behavior; `Escape` closes the editor or returns the row to live.
- The manual-only builder does not import broker positions or tradebooks and cannot place, modify, or cancel orders.

Plans stay in local extension storage, keyed by exact expiry. The background service worker serializes mutations across tabs so one valid edit cannot overwrite another. Entry premiums and captured snapshots remain fixed through refresh, reload, timeframe changes, zoom, pan, and side-panel activity; an unavailable opposite-side snapshot remains unavailable. Malformed stored entries are quarantined for recovery and reported as `MANUAL ENTRY NEEDS REVIEW` instead of being discarded. Invalid axis data fails closed.

## Setup

Load [`extension-axis-ladder`](extension-axis-ladder) as an unpacked extension in Chrome 141 or newer. Open a logged-in TradingView NIFTY chart, select the exact expiry, and use the existing explicit refresh to populate live option values. Double-click a row to start the manual plan.

No automatic option refresh, full option-chain table, bottom tray, Greeks, probability, margin, or recommendation path is added. Existing broker and seller-safety code remains independent from manual-plan storage and was not changed by this candidate.

## Existing read-only side panel

Click the pinned NIFTY extension icon on a TradingView tab to open the full-height side panel. The side panel is TradingView-only and retains the same seller-safety UI as the version 0.4.0 baseline. Switching tabs closes it.

Opening, closing, or resizing the side panel makes no seller-refresh, positions, trades, or option-chain requests. Panel open retains existing bridge-health, expiry-list, and Zerodha-status checks. Daily, use CONNECT ZERODHA, then press REFRESH ALL manually. This existing read-only workflow remains separate from manual strategy entries and has no-order capability.

See the [extension guide](extension-axis-ladder/README.md) for exact row behavior, independent quick break-evens, combined plan break-evens, failure boundaries, and keyboard controls.
