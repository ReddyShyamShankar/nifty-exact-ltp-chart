# Premium Skyline Design

## Goal

Show selected contract premium history directly on TradingView without lower history box. Selected strike becomes baseline; Call history grows above it and Put history grows below it on exact TradingView time axis.

## Locked behavior

- Strike-number action opens selected contract history without mounting lower pane.
- Existing selected ladder-row highlight, horizontal strike rail, and square touch markers remain visible.
- `SKYLINE` is sole on-chart premium projection. No mode selector or mode state remains.
- Skyline creates no persistence, new history request, broker write, or order action.
- Missing premium candles create gaps. No interpolation or invented values.
- Rendering is passive (`pointer-events: none`) and must not block TradingView crosshair or chart interactions.
- Existing ARB Desk light/dark tokens remain only color source. No new color family, shadow, or font.

## Skyline definition

Anchor each premium close to selected strike using TradingView price scale:

- Call premium projects upward: `synthetic price = strike + premium`.
- Put premium projects downward: `synthetic price = strike - premium`.
- Example: strike `24,200`, Call premium `200` reaches `24,400`; Put premium `100` reaches `24,100`.
- Call is solid. Put is dashed. Neutral ARB Desk tokens avoid consuming profit/loss semantics.
- Shared crosshair shows exact matching timestamp, Call close, Put close, and selected strike.

This view answers: “How did premium for this exact strike and expiry expand or contract through TradingView time?”

## Performance and safety

- Clip history to TradingView visible time range before geometry work.
- Coalesce samples into screen-pixel bins so overlay work stays bounded while zoomed out.
- One reusable canvas node. No DOM node per candle.
- Repaint from cached history only.
- Clear overlay on pane close, expiry/instrument navigation, extension disable, or invalid price/time mapping.

## Acceptance

1. Existing square markers stay visible with Skyline.
2. Skyline geometry maps 24,200 + 200 to 24,400 and 24,200 - 100 to 24,100.
3. Missing data remains a gap.
4. Overlay remains passive and clears with premium history.
5. No on-chart mode selector or lower history box appears.
6. Shared crosshair never invents premium for missing candle.
