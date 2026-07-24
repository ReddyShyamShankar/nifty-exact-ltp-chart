# Visualization Spec — Draft 0.1

## Design goal

Keep underlying candles dominant. Add option information as a controlled layer around price, not as a second dashboard covering the chart.

## Proposed chart layers

### Layer 1: underlying

- Normal TradingView candles.
- Current-price line.
- Existing user drawings remain visible.

### Layer 2: strike ladder

- Selected strikes as right-edge labels only; no historical ladder lines.
- ATM strike emphasized in orange.
- Other strikes shown in muted dark labels.
- Strike labels aligned on right edge.

Default: five total strikes. User can select more through a dropdown/preset control. More strikes should add information without covering candles; if space becomes tight, reduce secondary label fields before reducing strike context.

Suggested label format:

```text
23,800   C 423.60 | P 335.00
```

One label contains strike, call LTP, and put LTP. This keeps chart clean.

### Layer 3: strategy markers

- Entry marker at each leg strike.
- `L` or `S` badge for long/short.
- Quantity shown only when position mode is enabled.
- Strategy color used consistently across legs and break-even lines.

### Layer 4: break-even and risk

- Solid line: break-even.
- Dashed line: important strike or reference level.
- Shaded band: estimated profitable region only when calculation is valid.
- Risk warning label: unlimited loss or incomplete data.

### Layer 5: compact information panel

Top-right or bottom-right panel:

```text
EXP: 25 AUG 2026   DTE: 32
ATM: 24,100        SPOT: 23,762.90
NET: +credit       BE: 22,991 / 24,? 
P&L: estimated     DATA: timestamp
```

Panel must be hideable. Chart remains usable when panel is off.

## Anti-clutter rules

- Keep labels at the right-side chart edge, not across historical candles.
- Show premium values only for enabled call/put sides.
- Use compact labels by default; expand detail on demand.
- ATM gets strongest emphasis; surrounding strikes use lighter lines.
- When strike count increases, use a compact ladder/table panel rather than placing every label directly on candles.
- Never use large filled regions for the strike ladder.
- Keep alert markers small and identifiable by tooltip/details.

## Interaction model

Inputs first version:

- Enable/disable ladder.
- Monthly expiry.
- Center strike.
- Strike interval.
- Strikes above/below.
- Strike-count preset.
- Show calls.
- Show puts.
- Show strategy.

Later:

- Click-to-select strike if TradingView interaction supports desired behavior.
- Preset strategy templates.
- Multiple strategy colors.

## Visual hierarchy

1. Underlying price.
2. Selected strike and ATM context.
3. Strategy break-even.
4. Premium values.
5. Secondary Greeks and scenario data.

If labels collide, hide secondary fields before hiding strike or strategy context.

## First prototype screen

One underlying chart with:

- Five strikes: two below, ATM, two above.
- Call and put premium labels.
- Expiry label.
- Current underlying price.
- No strategy calculations yet.

Prototype must include strike-count presets so visual clutter can be compared at 3, 5, 7, and 11 strikes.

This gives fastest visual feedback and isolates data/display problems.
