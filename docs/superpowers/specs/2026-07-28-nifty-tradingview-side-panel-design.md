# NIFTY TradingView Side Panel Design

**Date:** 2026-07-28  
**Status:** Approved for implementation planning  
**Branch:** `codex/timeframe-axis-ladder`

## Goal

Replace the constrained 420×600 extension popup with a full-height Chrome side panel. Preserve the current NIFTY Options visual design and seller-safety workflow. Reduce unnecessary scrolling without changing broker, market-data, ladder, or risk behavior.

## Approved user experience

- Clicking the existing NIFTY extension icon opens or closes the Chrome side panel directly.
- The side panel is available only on `tradingview.com` and `www.tradingview.com` tabs.
- Switching to any other tab closes the panel. Returning to the prior TradingView tab does not reopen it; the user must click the NIFTY icon again.
- The side panel uses the current extension UI without redesign: same colors, typography, spacing language, cards, content order, Refresh button, expiry and strategy controls, and collapsible sections.
- The panel uses Chrome's full available height and user-controlled width. The current 600px height limit is removed.
- The normal collapsed view should avoid unnecessary scrolling at common laptop viewport heights. Long position or trade-review content may scroll when its content exceeds available height.
- The sticky header and **REFRESH ALL** control remain visible while panel content scrolls.

## Chrome extension architecture

### Manifest

- Add the `sidePanel` permission.
- Add a `side_panel.default_path` pointing to the existing extension UI document or its side-panel rename.
- Remove `action.default_popup`; the action icon must no longer open the legacy popup.
- Keep the existing action title and icon assets.
- Set `minimum_chrome_version` to `141` because deterministic per-tab closing uses `chrome.sidePanel.close()`.

Chrome documents `sidePanel.setOptions()` for site- and tab-specific availability, `setPanelBehavior({ openPanelOnActionClick: true })` for toolbar-icon opening, and `sidePanel.close()` for explicitly closing a tab-specific panel: https://developer.chrome.com/docs/extensions/reference/api/sidePanel

### Background service worker

- Configure `openPanelOnActionClick: true` during installation and service-worker startup.
- On tab creation, update, and activation, inspect the tab URL.
- Enable one tab-specific side panel path only when the URL uses HTTPS and its hostname is exactly `tradingview.com` or `www.tradingview.com`.
- Disable the side panel for every other URL.
- Track the previously active tab per Chrome window. On every tab activation, call `chrome.sidePanel.close({ tabId: previousTabId })` before treating the newly active tab as eligible. Ignore the documented no-op/already-closed result.
- Do not open the side panel programmatically during navigation, reload, installation, or startup. Opening remains a user action through the NIFTY icon.
- Do not add background polling or broker requests.

### Side-panel document

- Reuse the current `popup.html`, `popup.css`, and `popup.js` behavior unless a rename improves clarity. Reuse is preferred to prevent visual or workflow drift.
- Replace popup-only body sizing (`width: 420px; max-height: 600px`) with side-panel sizing (`width: 100%; min-height: 100vh`) while preserving existing design tokens and component rules.
- Keep vertical overflow on the side-panel document for genuinely long review content.
- Preserve the sticky top bar and all existing disclosure states.
- Do not introduce tabbed navigation, new cards, reordered sections, new colors, or new type styles.

## Data flow and safety invariants

1. User clicks NIFTY toolbar icon on an eligible TradingView tab.
2. Chrome opens that tab's extension side panel.
3. Panel reads existing `chrome.storage.local` state and bridge health exactly as the popup does today.
4. Opening, closing, resizing, switching tabs, timeframe changes, zoom, and pan make no seller-refresh, option-chain, Zerodha-position, or Zerodha-trade request.
5. Only explicit **REFRESH ALL** coordinates one seller refresh.
6. The accepted chain snapshot continues feeding the chart ladder through storage; moving UI into the side panel does not change chart rendering.
7. **CONNECT ZERODHA** retains the daily official login flow.
8. Closing the panel does not disable or remove an already enabled chart ladder.

Existing fail-closed behavior remains unchanged:

- A failed manual refresh stores a non-renderable stale chart state while preserving the last accepted operator evidence in the panel.
- Expired evidence or Zerodha session state hides chart risk without making a network request.
- Position changes, trade ownership, coverage gaps, and snapshot acceptance still require explicit review.
- Zerodha integration remains read-only. No order, modification, cancellation, conversion, or exit endpoint is added.

## Error handling

- Side-panel setup errors stay in the service-worker console and must not trigger repeated retries.
- URL parsing failures disable the panel for that tab.
- `sidePanel.close()` failures caused by an already-closed or destroyed tab are ignored; other failures are logged once.
- If the bridge is stopped, origin-rejected, disconnected, expired, rate-limited, or upstream-unavailable, the panel shows the existing user-facing error state.
- Side-panel migration must not clear, rename, or rewrite existing stored strategy, expiry, ledger, evidence, accepted view, chart view, or chain keys.

## Testing

### Automated

- Manifest declares `sidePanel`, valid default path, no `default_popup`, and Chrome 141 minimum.
- NIFTY action icon opens the side panel only through the configured user-click behavior.
- Exact TradingView hosts enable the panel; lookalike hosts, HTTP, extension pages, localhost, and unrelated sites disable it.
- Switching tabs closes the previous tab's panel and does not auto-open the new tab's panel.
- Returning to a previously active TradingView tab requires another icon click.
- Panel initialization performs no seller-refresh, chain, positions, or trades request.
- Manual refresh, Zerodha login, review, acceptance, storage, and chart-message tests remain unchanged and pass.
- Release artifact test verifies current UI tokens, one refresh control, no option-chain table, and side-panel wiring.

### Live Chrome and TradingView

- Reload unpacked extension and verify icon opens a full-height side panel.
- Verify existing visual UI matches the approved current extension.
- Verify normal collapsed view has no unnecessary scroll at the user's working viewport.
- Verify long review content scrolls within the panel without moving the sticky Refresh control.
- Verify panel is unavailable outside TradingView.
- Verify switching between two TradingView tabs closes the panel and requires a new icon click.
- Verify extension restart, Chrome restart, and bridge restart preserve storage and do not auto-open the panel.
- Verify one manual refresh updates the panel evidence and thirteen-row chart ladder once.

## Rollout

- Implement only on `codex/timeframe-axis-ladder`.
- Keep branch unmerged and unpushed until user completes live testing.
- Keep original NIFTY Chain LTP Overlay v0.14.0 disabled and untouched as backup.
- Do not remove popup-era source files until side-panel verification passes; reuse is preferred, so removal may be unnecessary.

## Non-goals

- No visual redesign.
- No automatic option-number refresh.
- No automatic broker polling.
- No new risk calculation.
- No broker order placement.
- No global side panel across non-TradingView sites.
- No persistent panel across tab switches.
- No change to ladder styling or TradingView price-coordinate behavior.
