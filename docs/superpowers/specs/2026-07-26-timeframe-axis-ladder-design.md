# Timeframe-Aware Right-Axis Option Ladder — Design

Date: 2026-07-26  
Status: approved behavior, implementation in progress

## Goal

Keep TradingView as primary chart. Show thirteen live NIFTY Call and Put rows at exact matching right-axis strike coordinates: six below ATM, ATM, and six above. Select only exact contracts from chosen expiry. Adapt membership to timeframe, expiry, and midpoint ATM crossings while treating zoom and pan as placement-only events.

## Preserve current version

Extension v0.14.0, current Pine source, and existing backup archive remain untouched. Axis ladder stays separate under `extension-axis-ladder/`. No task may recreate, overwrite, delete, or amend old backup artifacts.

## Visible ladder

- Thirteen rows total: six below ATM, ATM, six above ATM.
- Every row represents one exact NIFTY strike with selected-expiry Call and Put LTP.
- ATM row remains orange. Other rows remain dark grey.
- Row text format: `C 266.60 | P 388.70 | 26,000`.
- Strike appears at row's right end, nearest TradingView price scale.
- Every pointer sits at mathematically exact vertical coordinate of its strike.
- No collision spreading or leader brackets. Exact price anchoring wins.
- No nearest-strike or nearest-contract substitution.

## Native interval and exact membership

TradingView's native major tick interval is upper bound for ladder interval.

1. Observe current right-axis numeric tick text and text baseline directly when TradingView draws chart canvas.
2. Keep numeric candidates near right edge and pair price with visual y-coordinate.
3. Require at least three distinct pairs on one linear map.
4. Derive native price interval from adjacent accepted tick pairs.
5. Floor native interval to largest 50-point increment at or below it. If native interval is below 50, no valid ladder interval exists.
6. Search candidate intervals downward in 50-point steps.
7. For each candidate, center ATM on that interval and request strikes `ATM + offset × interval` for offsets `-6..6`.
8. Accept first candidate only when all thirteen exact strikes exist in selected-expiry chain.

Result is widest complete 50-point interval at or below native TradingView interval. Example: native interval 238 permits candidates 200, 150, 100, then 50; it never rounds upward to 250. Native interval below 50 fails closed.

If no candidate provides complete symmetric thirteen-strike set, hide ladder and report `13 EXACT CONTRACTS UNAVAILABLE`. Do not fill gaps with neighboring strikes.

## ATM recenter behavior

Initial ATM is interval-aligned center nearest live spot. Current center remains stable while spot stays inside its midpoint band.

For center `C` and interval `I`:

- lower recenter boundary: `C - I / 2`
- upper recenter boundary: `C + I / 2`
- spot strictly inside boundaries keeps current membership
- spot reaching either exact midpoint triggers recenter toward crossed side

Same two-second option-chain refresh that updates LTP checks these boundaries. Recenter uses already-fetched chain response and cached axis map; it creates no extra chain request and no axis reread. Selector reruns exact completeness check under current interval ceiling. Membership changes only after complete exact thirteen-row set exists. Otherwise last complete exact set remains; no substitution occurs.

## Timeframe, expiry, zoom, and pan

Supported chart timeframes:

- 15 minutes
- 1 hour
- 4 hours
- 1 day
- 1 week
- 1 month
- 3 months
- 6 months

Membership rebuild triggers:

- initial enable
- supported timeframe change
- expiry change
- live spot reaching exact ATM midpoint boundary

Placement-only triggers:

- zoom
- pan
- resize
- TradingView scale animation
- manual **RETRY PLACEMENT**

Zoom and pan may reread native ticks and recompute y-coordinates, but must never change interval, ATM, strikes, expiry, or contracts.

## Linear scale support

Accepted map is linear in either direction:

- normal scale: price rises while screen y decreases
- inverted scale: price rises while screen y increases

Slope sign determines orientation; same linear interpolation places rows in both modes. Duplicate, missing, stale, or nonlinear tick sets fail closed. Logarithmic and percentage scales are not supported by this build.

If TradingView temporarily omits a printed tick after valid map exists, exact strike positions may be extrapolated from current linear map. If map itself cannot be validated, hide rows and retry instead of guessing.

## Direct canvas observation

Axis capture does not use Chrome debugger, DevTools Protocol, accessibility tree, screenshot analysis, OCR, or Pine calibration.

Main-world `axis-observer.js` wraps canvas `fillText` at document start. It:

- parses plain numeric tick text, including comma formatting
- converts transformed canvas coordinates to viewport coordinates
- keeps draws near right edge
- publishes fresh `{price, y}` candidates for isolated content script

Background service worker validates candidates as one direct linear axis and rejects unrelated numeric chart text as outliers. Content script converts accepted pairs into price-to-y function.

Extension manifest must not request `debugger` permission. No Pine calibrator or per-contract Pine symbol input is required.

## Fast data path

`TradingView canvas ticks -> exact linear price map`

`Upstox option chain -> local bridge -> exact thirteen-contract membership + LTP`

`price map + membership -> Chrome extension rows`

Healthy path:

- timeframe change detected after chart label update
- native scale and selected-expiry chain fetched in parallel where possible
- two matching native interval reads stabilize rebuild
- thirteen labels appear within two seconds after scale settles
- one chain request every two seconds refreshes LTP and checks midpoint recenter
- TradingView Settings and Symbol Search never open

## Components

### Native canvas tick observer

Records right-axis canvas text draws with viewport y-coordinates without debugger attachment.

### Axis-pair validator

Finds largest set of distinct candidate pairs fitting one linear function. Supports positive or negative price-to-y slope and rejects nonlinear data.

### Exact timeframe ladder selector

Receives live spot, native interval ceiling, and full selected-expiry chain. Searches downward by 50 points and returns first complete symmetric thirteen-contract set. Returns failure when no complete set exists.

### Ladder state controller

Separates membership from placement. Rebuilds membership only for explicit triggers. Reuses cached axis map for two-second LTP refresh and midpoint recenter. Zoom and pan invoke placement only.

### Exact-price renderer

Places each row at raw strike coordinate without collision displacement. Repositions during resize, zoom, pan, and scale animation.

### Chain data client

Fetches selected expiry every two seconds, indexes rows by exact numeric strike, refreshes current quotes, and supplies live spot for midpoint recenter.

## Failures

- Native ticks loading or stale: hide rows, show calibration unavailable, retry bounded schedule.
- Nonlinear or ambiguous scale: hide rows; never approximate.
- No complete exact thirteen-strike range: hide rows or retain last complete set during recenter; never substitute.
- Bridge interruption: preserve current membership, retain last good values, mark stale.
- Unsupported timeframe: hide rows and show unsupported status.
- Expiry changes during request: discard stale response.

## Verification

### Unit and contract tests

- 13 rows: offsets `-6..6`.
- Native interval floors to 50-point increment and never exceeds native interval.
- Widest complete exact interval wins.
- Missing any required strike fails exact selection.
- No production selector calls nearest-substitution helper.
- Spot below midpoint preserves center.
- Spot at exact midpoint recenters.
- Recenter reuses same chain refresh and cached axis map.
- Zoom and pan preserve membership.
- Normal and inverted linear tick maps produce exact y-coordinates.
- Nonlinear map fails.
- Manifest omits `debugger`.
- Capture path omits screenshot, accessibility tree, DevTools Protocol, and Pine anchors.

### Browser tests

- 15m, 1h, 4h, Daily, Weekly, Monthly, 3M, and 6M each show thirteen rows when complete exact range exists.
- Every displayed strike exists exactly in bridge response.
- Every row pointer matches TradingView coordinate under normal scale.
- Inverted linear scale places same strikes correctly.
- Zoom in, zoom out, and pan preserve same thirteen contracts.
- Spot one tick below midpoint preserves ATM; exact midpoint refresh recenters ATM.
- Sparse or edge-limited chain never produces nearest substitutions.
- Existing v0.14.0 backup checksum still passes and files remain unmodified.

## Rejected approaches

### Nearest-contract edge filling

Keeps thirteen visible rows but changes contract meaning. Rejected because every displayed row must be exact requested strike.

### Chrome debugger or accessibility-tree capture

Can expose axis labels but adds privileged attachment, browser warning, and brittle protocol dependency. Rejected in favor of direct canvas tick observation.

### Screenshot grid detection or OCR

Adds raster ambiguity and device-scale sensitivity. Rejected because native canvas text draws already contain exact price and position.

### Pine calibrator or twenty-six Pine symbol inputs

Adds chart setup and repeated trusted Symbol Search work. Rejected because native ticks provide placement and Upstox provides quotes.

### Standalone custom chart

Removes user's TradingView chart, indicators, drawings, and workflow.

## Acceptance criteria

Build succeeds when supported TradingView timeframe shows thirteen exact `Call | Put | Strike` rows using widest complete 50-point interval no greater than native axis interval. Same two-second chain refresh updates LTP and recenters ATM at exact midpoint. Zoom and pan change positions only. Normal and inverted linear scales place rows correctly. No nearest substitutions, Chrome debugger, accessibility-tree capture, screenshot calibration, or Pine calibrator exists. Old v0.14.0 backup remains untouched.
