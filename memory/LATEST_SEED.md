## STATE

Working V1 uses existing TradingView Pine indicator plus Chrome extension v0.14.0. Persistent bridge starts through macOS LaunchAgent and reads long-lived Upstox token from macOS Keychain. Each sync calculates nearest 100-point ATM from live spot, writes five strikes spanning 400 points, and fills ten exact contracts. Labels show only `C <LTP> | P <LTP>`; Daily keeps exact spacing, while Weekly and Monthly use collision-safe visual separation with bracket connectors back to true strike coordinates. Live browser verification passed on all three timeframes.

## NEXT_LINE

Use extension v0.14.0 on Daily, Weekly, and Monthly charts and report visual feedback; reload extension only after future code updates.

## MEMORY_KEY

Working path is Upstox option chain -> live 100-point ATM -> Keychain-backed bridge -> same-window Chrome extension -> five exact strike rows, ten Pine symbols, compact Call/Put-only label text, and timeframe-safe collision placement.

## OPEN_QUESTIONS
- Should extension auto-run when ATM crosses next 100-point boundary, or keep explicit sync button?
- What is final product name and logo?
