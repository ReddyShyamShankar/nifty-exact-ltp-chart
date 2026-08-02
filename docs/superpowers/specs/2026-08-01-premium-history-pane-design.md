# Premium History — On-Chart Skyline Design

**Date:** 2026-08-01  
**Status:** APPROVED — SKYLINE FINAL
**Scope:** Premium history for one exact strike and one exact expiry, rendered directly on TradingView.

## Universal product rule

Premium history must work from instrument metadata and market-data provider capabilities for any supported optionable instrument. NIFTY is current connector and test case, not core architecture. No history identity, interval rule, pricing model, or rendering mode may assume NIFTY-specific strike spacing.

## Goal

Select one ladder strike and understand how Call and Put premiums changed through same dates as underlying TradingView candles. User must be able to compare repeated trades on same contract, understand why premiums differed, and separate four forces:

1. Underlying distance from strike.
2. Time remaining until exact expiry.
3. Market uncertainty represented by estimated implied volatility.
4. Call/Put demand represented by traded option prices.

Underlying candle volatility alone does not fully explain option premium. History model therefore keeps market prices and modelled context distinct without claiming modelled values are exchange facts.

## Locked product decisions

- History identity is `instrument + exact expiry + strike + option right`.
- Call and Put histories appear together by default.
- Stable TradingView time-axis evidence controls visible date window and shared crosshair. Missing evidence fails closed; no independent lower-pane axis remains in production.
- History exists even when user never traded contract.
- Every trade remains separate with immutable timestamp, direction, quantity, and entry premium. Repeated entries in same contract never collapse into one average marker.
- Premium candle interval follows TradingView timeframe. Example: 1-minute TradingView chart uses 1-minute premium candles; 4-hour chart uses 4-hour premium candles.
- Current row click keeps quick break-even behavior.
- Current row double-click keeps manual trade editor behavior.
- Clicking rightmost strike number opens exact selected-expiry Call and Put history on chart. Example: clicking `24,400` selects that contract identity.
- Skyline shows Call and Put together: Call solid above selected-strike baseline, Put dashed below.
- Single stored ARB Desk theme controls pane, ladder, popup, and side panel. No new colors enter palette.
- Estimated IV is always labelled **ESTIMATED IV**. It is never described as broker, exchange, or exact IV.
- Skyline and selected-strike map coexist. Neither deletes row highlight, guide, or existing square markers.
- Selected history strike remains highlighted in the ladder while pane is open.
- A passive guide follows selected strike's exact TradingView price coordinate.
- Small square markers appear only where a real visible underlying candle satisfies `low <= selected strike <= high`.
- **SKYLINE** is sole production premium-history projection.
- Skyline uses exact point arithmetic: Call close maps to `strike + premium`; Put close maps to `strike - premium`. No missing value is inferred.
- No on-chart premium-mode selector remains.

## On-chart Skyline layout

Skyline uses same TradingView plot rectangle. Selected strike is central baseline. Call history occupies area above baseline; Put history occupies area below. Compact chart label contains:

- Exact strike and expiry.
- Active TradingView timeframe.
- Direction key: `CALL ↑ / PUT ↓`.

Shared crosshair tooltip contains values at active timestamp:

- Exact timestamp.
- Selected strike.
- Call close premium.
- Put close premium.
- Explicit `NO PREMIUM CANDLE` gap state.

Call-versus-Put distinction never consumes profit/loss colors. Solid versus dashed neutral strokes keep profit green, loss red, and ATM warning colors reserved for existing meanings.

## Interaction model

1. User selects exact expiry through existing controls.
2. User clicks strike number inside one visible ladder row.
3. History controller starts one explicit load for exact contract identity and current TradingView interval.
4. User pans or zooms TradingView. Skyline follows stable visible date window and horizontal coordinates from cached history; pan and zoom make no option-history request.
5. User changes TradingView timeframe. History controller requests matching interval only when normalized cache lacks it.
6. User moves TradingView pointer. Shared crosshair exposes one timestamp and matching values.
7. User closes history, changes expiry, changes instrument, or navigates away. Transient selection clears. Cached historical data remains available locally.

While history remains open, chart also shows selected-strike map: highlighted ladder row, horizontal strike guide, and square candle-touch markers. TradingView timeframe, zoom, and pan remap guide and markers from stable price/time-axis evidence and cached underlying OHLC. Map and Skyline are display-only: they cannot fetch data, move TradingView, or intercept pointer input.

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

### 4. TradingView-synchronized time axis

While history is open, bounded MAIN-world observation reads stable TradingView time-axis labels and matching plot geometry. Skyline then uses same visible date window, same horizontal plot bounds, and same pointer x-coordinate as TradingView. Crosshair first snaps to exact joined underlying candle occupying that horizontal candle slot, then reads Call and Put only from that same timestamp. Underlying candle without option candle shows **NO PREMIUM CANDLE**. Pointer outside every real candle slot produces no invented clock time or substituted distant history.

Observation is disabled while history is closed. Missing or unstable TradingView evidence hides Skyline until stable evidence returns. No guessed axis, debugger permission, synthetic drag, or Auto-fit change is allowed. TradingView timeframe still selects requested candle interval.

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

### 6. Renderer

Skyline renderer consumes one immutable view model. Call uses solid neutral stroke above baseline; Put uses dashed neutral stroke below. Renderer owns pixels only; it cannot fetch, mutate trades, change cache, or alter TradingView chart state. One reusable passive canvas and animation-frame coalescing bound pointer-move work.

### 7. Selected-strike chart map

Chart map consumes same selected contract, joined underlying candles, and TradingView axis evidence as pane. Guide y-position comes from selected ladder row after price-axis placement. Marker x-position comes from TradingView visible time-axis range. Marker eligibility uses real underlying OHLC only: candle qualifies when selected strike lies inclusively between candle low and high. Missing low/high never qualifies. Canvas remains pointer-passive and sits below ladder rows so existing row, crosshair, and chart interactions keep ownership.

## Data flow

```text
Strike-number click
  → exact contract resolver
  → bridge history request
  → Call + Put + underlying candles
  → interval normalization and timestamp join
  → estimated-IV engine
  → immutable premium-history view model
  → Skyline renderer with Call above / Put below
  → TradingView-synchronized time scale
  → shared crosshair at exact matching timestamp
```

Trade evidence joins after market-data normalization. Actual trade timestamp remains exact; marker is projected to containing chart interval without rewriting stored trade time or fill premium.

## Refresh and network boundaries

- Opening history is explicit user action and may fetch history once.
- Skyline repaint makes no request.
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
- Missing or invalid history timestamps: hide Skyline and show `NO CONTRACT HISTORY`; never invent dates.
- Invalid IV input: premium remains; IV point shows `—` with reason available on hover.
- Instrument or expiry change during request: abort stale request and prevent old data from rendering.

History failure must never hide ladder, strategy rails, saved trades, or break-even evidence.

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
- Call and Put Skyline sides render from same view model and make zero requests.
- Buy/Sell markers remain distinct and accessible in dark and light themes.
- No new color literal enters locked ARB Desk palette.
- History close, expiry change, and instrument change clear transient selection.
- Selected ladder highlight, strike guide, candle-touch markers, and Skyline clear with same lifecycle.
- Candle-touch markers use squares, never circles, and appear only for real inclusive high-low crossings.
- ATM styling keeps its semantic fill when ATM is selected; selected-state contrast remains visible in light and dark themes.
- Keyboard and screen-reader names expose exact strike, expiry, mode, and data state.

### Runtime and performance

- Pan, zoom, crosshair, and CALL/PUT emphasis switch make no bridge request.
- Pan, zoom, and timeframe placement redraw selected-strike guide and visible candle-touch markers from cached evidence.
- Concurrent identical history requests deduplicate.
- Stale responses cannot replace newer selection.
- Missing or malformed provider data fails closed.
- Cached 10,000-point series supports side-emphasis switch and crosshair without visible blocking.

### Chrome UAT

Use exact NIFTY test contract selected by user, including strike `24,400` when available:

1. Compare same expiry Call and Put premiums across two dates.
2. Confirm underlying candle, DTE, strike distance, combined premium, and estimated IV at both timestamps.
3. Confirm multiple trade markers retain original timestamps and fill premiums.
4. Confirm solid Call Skyline above strike and dashed Put Skyline below strike in light and dark modes.

## Explicit exclusions for trial

- No trade recommendation or prediction.
- No order placement.
- No automatic premium-surge alert in this phase.
- No portfolio-wide multi-strike history grid.
- No claim that estimated IV is broker-reported or exchange-reported.
- No silent synthetic history for unavailable expired contracts.
