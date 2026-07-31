# Options Ladder — Axis Ladder + Versioned Strategy Builder + Seller Safety Map

Version 0.6.0 adds multiple user-owned strategies, temporary combined previews, permanent merge/split, immutable versions, and Ledger History directly to TradingView exact-axis ladder. NIFTY remains current connector and test case; core model stays instrument-neutral.

## Candidate workflow

- Double-click any visible ladder row to add a manual Call or Put entry at that exact strike.
- Use one `CHOOSE LEG ▾` selector, then choose exactly one: Buy Call, Buy Put, Sell Call, or Sell Put.
- Set positive whole-number lots and an editable premium; the displayed premium is only the starting value.
- Separate top-left `C2` and `P3` badges report saved Call and Put lots at that strike.
- One saved ARB Desk theme controls popup, side panel, and chart ladder together. Dark is default; the header sun/moon toggle switches every surface to the exact light token set.
- Live rows use the active ARB Desk panel tokens, ATM and selected rows use warning tokens with black text, Buy snapshots use accent tokens, and Sell snapshots use danger tokens.
- Original Options Ladder logo stays unchanged. Control icons follow ARB Desk. Geist Sans and Geist Mono are bundled locally, so extension typography never falls back or needs network access.
- Every new leg asks for explicit strategy ownership or creates next strategy. No strike/time-based auto-grouping exists.
- Strategy label opens positions and P&L. Adjacent square only selects whole strategy for temporary preview.
- Two or more selected strategies show combined break-even rails; **Compare** restores individual rails beside them.
- Temporary preview clears on refresh, reload, expiry/instrument change, or cancel without changing saved strategies.
- Side panel saves preview as new strategy or merges into explicit destination, archives sources, splits selected legs, restores old versions as new current version, and preserves Ledger History.
- Off-screen roots use exact `↑`/`↓` markers. Colliding cards stack with connectors to unmoved financial rails.
- Known charges affect economics; unknown charges and stale quotes are disclosed and never guessed.
- A manual refresh changes live values only; saved snapshots remain unchanged.
- Add and Save stay disabled until the selected Call/Put side has a valid non-negative premium and positive whole-number lot count; typing previews payoff without closing or rebuilding the editor.
- Keyboard: `Shift+Enter` opens the focused row editor; `Enter` or `Space` keeps single-click behavior; `Escape` closes the editor or returns the row to live.
- Strategy builder cannot place, modify, cancel, convert, or exit orders.

Strategies and immutable versions stay in local extension storage, keyed by instrument and exact expiry. Background service worker serializes mutations across tabs so one valid edit cannot overwrite another. Duplicate commands remain idempotent, storage failure preserves current version, and malformed records enter recovery quarantine. Entry premiums and captured snapshots remain fixed through refresh, reload, timeframe changes, zoom, pan, and side-panel activity. Invalid axis data fails closed.

Extension never changes TradingView price scale or Auto-fit state and requests no Chrome debugger access. Visible ladder rows use one column and follow TradingView's current native right-axis ticks; timeframe-specific 50/100/250/500 rules are not used. True ATM stays included. Zoom and pan remap cached rows without requesting option data.

## Setup

Load [`extension-axis-ladder`](extension-axis-ladder) as unpacked extension in Chrome 141 or newer. Open logged-in TradingView NIFTY chart, select exact expiry, and click pinned extension icon. Use **Refresh ladder** to fetch current option values or **Open side panel** for permanent strategy/version controls. Double-click row to add or edit one leg.

No automatic option refresh, full option-chain table, bottom tray, Greeks, probability, margin, or recommendation path is added. Existing broker and seller-safety code remains independent from manual-plan storage and was not changed by this candidate.

## Compact toolbar popup and read-only side panel

Click the pinned Options Ladder icon on a TradingView tab to open a compact popup. **Refresh ladder** updates chart option numbers and reports progress in the popup. **Open side panel** opens the full-height seller-safety controls. Clicking outside closes the popup. The side panel is TradingView-only and retains the same seller-safety UI as the version 0.4.0 baseline. Switching tabs closes an open panel.

Popup refresh updates ladder option numbers only. Opening, closing, or resizing the side panel makes no seller-refresh, positions, trades, or option-chain requests. Panel open retains existing bridge-health, expiry-list, and Zerodha-status checks. Daily, use CONNECT ZERODHA, then press REFRESH ALL manually. This existing read-only workflow remains separate from manual strategy entries and has no-order capability.

See the [extension guide](extension-axis-ladder/README.md) for exact row behavior, independent quick break-evens, combined plan break-evens, failure boundaries, and keyboard controls.
