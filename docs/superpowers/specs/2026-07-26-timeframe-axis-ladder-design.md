# Timeframe-Aware Right-Axis Option Ladder — Design

Date: 2026-07-26  
Status: approved design, pending implementation

## Goal

Keep TradingView as primary chart. Show live NIFTY Call and Put prices beside exact matching right-axis strike coordinates. Changing timeframe selects a new thirteen-strike ladder that matches current chart scale. Zooming or panning moves labels with their prices but never changes selected contracts.

## Preserve current version

Before implementation, preserve extension v0.14.0 and current Pine source as a restorable backup. New build must not delete or overwrite that backup. User can compare both versions before choosing which one to keep.

## Visible ladder

- Thirteen strikes total: six below ATM, ATM, six above ATM.
- Each row represents one real NIFTY strike and its selected-expiry Call and Put LTP.
- ATM row remains orange. Other rows remain dark grey.
- Row text format: `C 266.60 | P 388.70 | 26,000`.
- Strike appears at row's right end, nearest TradingView price scale.
- Every row pointer sits at exact vertical coordinate of its strike.
- No artificial label spreading. Exact price anchoring wins.

## Timeframe and zoom behavior

Supported chart timeframes:

- 15 minutes
- 1 hour
- 4 hours
- 1 day
- 1 week
- 1 month
- 3 months
- 6 months

On initial load or timeframe change:

1. Wait until TradingView finishes primary scale transition.
2. Read current chart price-to-pixel calibration from controlled Pine anchors.
3. Detect current major right-axis/grid interval from chart pixels.
4. Convert that interval to a valid NIFTY strike interval, rounded to nearest 50 points.
5. Select nearest ATM on that interval.
6. Build thirteen strikes from ATM minus six intervals through ATM plus six intervals.
7. Fetch selected expiry's full option chain once.
8. Render available Call/Put LTP rows at exact strike coordinates.

After ladder selection, zooming or panning must only recompute each row's screen position. It must not replace strike contracts. Another timeframe change creates a new thirteen-strike set.

If TradingView temporarily hides a printed axis tick, row remains at mathematically exact coordinate for that strike.

## Fast data path

Do not inject twenty-six option symbols into Pine. That path requires repeated trusted Symbol Search interactions and would take minutes.

New path:

`Upstox option chain -> local bridge -> Chrome extension -> thirteen exact-price rows`

Pine remains a lightweight chart-calibration indicator only. It provides controlled anchors for converting price into chart pixels. Upstox provides option LTP data. Extension joins both sources and draws labels.

Expected healthy-path performance:

- Timeframe change detected immediately.
- One option-chain request and one scale capture run in parallel where possible.
- All thirteen labels appear within two seconds after TradingView scale settles.
- LTP refresh does not reopen TradingView Settings or Symbol Search.

## Components

### Backup package

Stores v0.14.0 extension files, Pine source, version metadata, and checksum. Backup remains outside active extension folder.

### Pine calibration indicator

Produces two controlled-color anchors around current NIFTY price. Anchor range adapts by chart timeframe so both calibration points remain visible. No per-contract `request.security()` calls required for new overlay.

### Axis-scale detector

Uses captured chart pixels to locate repeated horizontal grid rows. Combines grid pixel spacing with controlled Pine price-to-pixel calibration. Returns current major price interval and confidence score.

### Timeframe ladder selector

Receives timeframe, live spot, detected interval, and available chain strikes. Produces exactly thirteen symmetric strikes when contracts exist. Falls back to nearest available valid strikes when selected expiry has edge gaps.

### Exact-price renderer

Places each row at raw strike coordinate without collision displacement. Repositions on resize, zoom, pan, and TradingView scale animation. Keeps current contracts until timeframe changes.

### Chain data client

Fetches selected expiry once, indexes rows by strike, and refreshes LTP values without changing ladder membership.

## Fallbacks and errors

- Low-confidence grid detection: use last good interval for current timeframe.
- No prior interval: use conservative timeframe fallback table, then retry detection after scale settles.
- Missing edge contract: use nearest available chain strike while preserving sorted symmetry as far as possible; never invent LTP.
- Bridge interruption: preserve last good labels and mark data stale.
- Calibration anchors missing: hide labels rather than place them at wrong prices; retry capture automatically.
- Unsupported timeframe: keep last ladder hidden and show clear unsupported-timeframe status.

## Verification

### Unit tests

- Grid-pixel spacing to NIFTY strike interval conversion.
- Thirteen-strike symmetry around ATM.
- Nearest-available strike fallback.
- Timeframe change replaces contracts.
- Zoom/pan preserves contracts.
- Label format places strike last.

### Browser tests

- 15m, 1h, 4h, Daily, Weekly, Monthly, 3M, and 6M each show thirteen rows.
- Each row pointer matches corresponding right-axis strike coordinate.
- Zoom in, zoom out, and pan preserve same thirteen strikes.
- Timeframe change recalculates ladder within two seconds after scale settles.
- Selected-expiry Call/Put values match bridge response.
- Existing v0.14.0 backup remains restorable.

## Rejected approaches

### Twenty-six Pine symbol inputs

Accurate but slow. Requires twenty-six trusted Symbol Search selections after each ladder change.

### Standalone custom chart

Fast and controllable but removes user's TradingView chart, indicators, drawings, and workflow.

## Acceptance criteria

Build succeeds when user can change supported timeframe and receive thirteen live `Call | Put | Strike` rows at exact right-axis coordinates without opening Settings or pressing Sync. Zoom and pan move rows with chart prices while preserving selected contracts. Existing v0.14.0 remains available as backup.
