# Position spine repair — live TradingView evidence

Date: 2026-08-08

## Live workflow replay

- Reloaded the unpacked `extension-axis-ladder` revision in Chrome.
- Started the existing read-only local bridge and confirmed Upstox was reachable.
- Opened the saved NIFTY TradingView chart with the Options Ladder side panel open.
- Ran the explicit **REFRESH LADDER** action; no order or strategy mutation was performed.
- Confirmed the daily chart rendered the shared vertical position spine.
- Confirmed manual strategy identities `T44`, `T48`, and `T51` remained visible.
- Confirmed accessible position controls remained source- and side-specific: Call BUY at 25,200, Put SELL at 24,900, and Call SELL at 23,500.
- Switched from 1D to 5m and back to 1D; ladder placement rebuilt from cached chain data without another refresh.
- Kept the side panel open during the replay, exercising the reduced chart viewport.

## Automated verification

- `TVG-001` through `TVG-020`: passed.
- Full extension and bridge suite: 1,012 passed, 0 failed.
- JavaScript syntax checks: passed.
- `git diff --check`: passed.

## Artifact

- `live-daily-spine.jpeg` — daily TradingView chart after refresh, showing the restored spine and persistent strategy labels in the reduced side-panel viewport.
