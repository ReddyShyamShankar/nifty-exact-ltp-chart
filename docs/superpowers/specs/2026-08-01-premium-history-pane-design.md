# Premium History Pane — Trial Design

**Date:** 2026-08-01  
**Status:** APPROVED FOR TRIAL BUILD  
**Scope:** Premium history for one exact strike and one exact expiry, synchronized with TradingView.

## Universal product rule

Premium history must work from instrument metadata and market-data provider capabilities for any supported optionable instrument. NIFTY is current connector and test case, not core architecture. No history identity, interval rule, pricing model, or rendering mode may assume NIFTY-specific strike spacing.

## Goal

Click one ladder strike and understand how Call and Put premiums changed through same dates as underlying TradingView candles. User must be able to compare repeated trades on same contract, understand why premiums differed, and separate four forces:

1. Underlying distance from strike.
2. Time remaining until exact expiry.
3. Market uncertainty represented by estimated implied volatility.
4. Call/Put demand represented by traded option prices.

Underlying candle volatility alone does not fully explain option premium. Pane therefore shows market prices and modelled context together without claiming modelled values are exchange facts.

## Locked product decisions

- History identity is `instrument + exact expiry + strike + option right`.
- Call and Put histories appear together by default.
- History covers full available contract life, then clips rendering to TradingView's visible dates.
- History exists even when user never traded contract.
- Every trade remains separate with immutable timestamp, direction, quantity, and entry premium. Repeated entries in same contract never collapse into one average marker.
- Premium candle interval follows TradingView timeframe. Example: 1-minute TradingView chart uses 1-minute premium candles; 4-hour chart uses 4-hour premium candles.
- Current row click keeps quick break-even behavior.
- Current row double-click keeps manual trade editor behavior.
- Clicking rightmost strike number opens premium-history pane. Example: clicking `24,400` opens exact selected-expiry Call and Put history.
- Pane ships with three temporary render modes:
  - **LINES** — default; Call close is solid neutral line and Put close is dashed neutral line.
  - **SPLIT** — two stacked Call and Put candle panes.
  - **FOCUS** — one selected side uses large candles while other side stays available through Call/Put toggle.
- All modes use one normalized dataset and one cache. Switching mode never makes another market-data request.
- Trial keeps all three modes. User testing chooses winner; two rejected renderers are deleted later.
- Single stored ARB Desk theme controls pane, ladder, popup, and side panel. No new colors enter palette.
- Estimated IV is always labelled **ESTIMATED IV**. It is never described as broker, exchange, or exact IV.

## Pane layout

Pane docks below TradingView plot and uses same horizontal plot bounds. Header contains:

- Exact strike and expiry.
- Active TradingView timeframe.
- Current Call and Put premiums.
- `LINES`, `SPLIT`, and `FOCUS` mode controls.
- Close control.

Context strip contains values at active crosshair timestamp:

- Underlying close.
- Signed strike distance: `underlying close − strike`.
- DTE — remaining time to exact expiry, expressed in days.
- Call premium and estimated Call IV.
- Put premium and estimated Put IV.
- Call + Put premium.

Plot contains premium history plus optional estimated-IV history. Shared crosshair shows same timestamp across TradingView and premium pane. Hover card contains:

- Underlying OHLC.
- Call OHLC and estimated Call IV.
- Put OHLC and estimated Put IV.
- Call + Put close premium.
- DTE and signed strike distance.

Trade markers use existing semantic tokens: Buy uses existing accent token; Sell uses existing danger token. Call-versus-Put distinction never consumes profit/loss colors. LINES mode uses solid versus dashed neutral strokes so profit green, loss red, and ATM warning colors keep existing meanings.

## Interaction model

1. User selects exact expiry through existing controls.
2. User clicks strike number inside one visible ladder row.
3. Pane opens and starts one explicit history load for exact contract identity and current TradingView interval.
4. User pans or zooms TradingView. Pane redraws cached history against stable time-axis evidence; pan and zoom make no option-history request.
5. User changes TradingView timeframe. Pane requests matching interval only when normalized cache lacks it.
6. User switches LINES, SPLIT, or FOCUS. Rendering changes immediately from same data.
7. User hovers either chart. Shared crosshair exposes one timestamp and matching values.
8. User closes pane, changes expiry, changes instrument, or navigates away. Transient pane selection clears. Cached historical data remains available locally.

## Architecture

### 1. Contract resolver

Resolves exact Call and Put provider keys from instrument metadata. Resolver must retain provider contract keys currently discarded from Upstox option-chain response. It rejects ambiguous or mismatched instrument, expiry, strike, or option-right data.

### 2. Read-only history provider

Local bridge gains provider-neutral option-history operation. Current NIFTY adapter uses Upstox because bridge already uses Upstox option chain and Historical Candle Data V3. Upstox returns timestamp, OHLC, volume, and open interest for supported instruments and intervals. [Official Upstox Historical Candle Data V3 documentation](https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/).

Kite can remain later provider adapter. Kite supports historical candles, but expired option tokens must be cached before expiry because continuous history applies to futures, not options. [Official Kite historical-data documentation](https://kite.trade/docs/connect/v3/historical/).

History provider exposes only market-data reads. It adds no order, modify, cancel, convert, or exit operation.

### 3. History cache

Bridge caches normalized candle chunks by:

`provider + instrument + exact expiry + strike + option right + interval + date range`

Extension stores only view selection and immutable user trade markers. Large candle series stay outside `chrome.storage.local`. Cache returns complete chunks or explicit gaps; it never fills missing market candles with zero or invented interpolation.

### 4. TradingView time-axis adapter

Adapter observes TradingView-owned time-axis evidence and plot bounds without debugger permission, synthetic drag, or Auto-fit control. It validates stable linear time mapping before drawing synchronized points. Unsafe, incomplete, or contradictory mapping hides synchronized rendering while preserving cached data.

### 5. IV engine

IV engine calculates one estimated IV value from each valid option close and matching underlying close. Model adapter is selected from instrument metadata rather than hard-coded market name. Inputs are:

- Option close premium.
- Matching underlying close.
- Exact strike.
- Exact expiry timestamp.
- Risk-free rate assumption.
- Dividend or carry assumption.
- Exercise and settlement model required by instrument metadata.

Every output stores model name, assumption version, and calculation timestamp. Tooltip exposes assumptions. Engine enforces no-arbitrage price bounds and convergence checks. Missing input, impossible price, expiry boundary, or failed convergence returns `—` for that IV point. Premium history remains visible.

### 6. Renderers

LINES, SPLIT, and FOCUS implement one renderer interface and consume same immutable view model. Renderer owns pixels only; it cannot fetch, mutate trades, change cache, or alter TradingView chart state.

## Data flow

```text
Strike-number click
  → exact contract resolver
  → bridge history request
  → Call + Put + underlying candles
  → interval normalization and timestamp join
  → estimated-IV engine
  → immutable premium-history view model
  → LINES / SPLIT / FOCUS renderer
  → stable TradingView time-axis placement
```

Trade evidence joins after market-data normalization. Actual trade timestamp remains exact; marker is projected to containing chart interval without rewriting stored trade time or fill premium.

## Refresh and network boundaries

- Opening history is explicit user action and may fetch history once.
- Mode switching makes no request.
- Crosshair movement makes no request.
- Pan and zoom make no request.
- Timeframe change may fetch one missing interval because user explicitly changed requested view.
- Failed request has no automatic retry loop.
- Existing ladder manual-refresh rules stay unchanged.
- Account positions and trades endpoints remain independent from history loading.

## Failure behavior

- Missing contract key: `CONTRACT HISTORY UNAVAILABLE`.
- Provider authentication failure: preserve cached series, mark `STALE · AUTH REQUIRED`.
- Rate limit or network failure: preserve cached series, mark `STALE · REFRESH FAILED`, no retry.
- Missing Call or Put series: show available side and explicit missing-side state.
- Timestamp mismatch: show gaps; never forward-fill premium or IV.
- Unsupported timeframe: offer nearest exact supported aggregation only when smaller source candles produce mathematically exact interval. Otherwise fail closed.
- Unsafe TradingView time mapping: hide synchronized plot and show `TIME AXIS UNAVAILABLE`; never place points approximately.
- Invalid IV input: premium remains; IV point shows `—` with reason available on hover.
- Instrument or expiry change during request: abort stale request and prevent old data from rendering.

History-pane failure must never hide ladder, strategy rails, saved trades, or break-even evidence.

## Performance boundaries

- One contract selection loads Call, Put, and underlying history through one coordinated operation.
- Candle chunks are deduplicated across tabs and render modes.
- Renderer receives viewport-clipped points rather than full-history DOM nodes.
- Crosshair updates use cached arrays and make no network or storage write.
- Switching render modes targets one animation frame for cached viewport data.

## Validation plan

### Data and business rules

- Exact strike and expiry resolve correct Call and Put provider keys.
- Same strike under different expiry never shares cache or trade markers.
- Repeated same-contract trades remain separate.
- Premium OHLC, volume, and OI normalize without zero substitution.
- Interval aggregation preserves OHLC rules and market timestamps.
- Call + Put equals exact matching-timestamp closes.
- DTE uses exact expiry timestamp and market timezone.

### Estimated IV

- Known reference cases converge within declared tolerance.
- Call and Put calculate independently.
- Impossible premium, missing underlying, expired contract, or missing model input returns unavailable.
- Assumption version appears in every calculated series.
- IV calculation never changes actual premium candles or trade evidence.

### UI and UX

- Strike number click opens history; row click and double-click retain existing actions.
- Shared crosshair aligns underlying, premiums, IV, and tooltip timestamp.
- All three modes render from same view model and make zero mode-switch requests.
- Buy/Sell markers remain distinct and accessible in dark and light themes.
- No new color literal enters locked ARB Desk palette.
- Pane close, expiry change, and instrument change clear transient selection.
- Keyboard and screen-reader names expose exact strike, expiry, mode, and data state.

### Runtime and performance

- Pan, zoom, crosshair, and mode switch make no bridge request.
- Concurrent identical history requests deduplicate.
- Stale responses cannot replace newer selection.
- Missing or malformed provider data fails closed.
- Cached 10,000-point series supports mode switch and crosshair without visible blocking.

### Chrome UAT

Use exact NIFTY test contract selected by user, including strike `24,400` when available:

1. Compare same expiry Call and Put premiums across two dates.
2. Confirm underlying candle, DTE, strike distance, combined premium, and estimated IV at both timestamps.
3. Confirm multiple trade markers retain original timestamps and fill premiums.
4. Compare LINES, SPLIT, and FOCUS in light and dark modes.
5. User selects winning renderer after real use; remove remaining two in follow-up change.

## Explicit exclusions for trial

- No trade recommendation or prediction.
- No order placement.
- No automatic premium-surge alert in this phase.
- No portfolio-wide multi-strike history grid.
- No claim that estimated IV is broker-reported or exchange-reported.
- No silent synthetic history for unavailable expired contracts.
