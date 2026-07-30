# LATEST SEED — Options Ladder

## STATE

Options Ladder v0.5.0 is loaded from `.worktrees/timeframe-axis-ladder/extension-axis-ladder` on `codex/arbdesk-theme-system`; prior checkpoint remains preserved separately. D17 universal axis-grid membership remains foundation, and D18 adds one explicit real-ATM reference: nearest available ATM strike stays present only while its exact price lies inside visible chart range. Fixed row count, ATM-centered range selection, and timeframe-specific spacing remain removed; light ATM uses ARB Desk brown and dark ATM uses ARB Desk orange.

## NEXT_LINE

Reload D18 build in Chrome and visually confirm pinned ATM at coarse axis spacing in both light and dark themes.

## MEMORY_KEY

Universal foundation: real selected-instrument/expiry strikes intersect TradingView's stable visible price grid; one real nearest-available ATM reference is added when inside visible chart range. No fixed row count, no ATM-centered range, and no timeframe-specific spacing. Covered live-price slot uses inferred rounded grid value such as 24,300. NIFTY is test case only.

## OPEN_QUESTIONS
- Does user approve D17 visual density at fine, medium, and far zoom after live verification?
- Does the 0.00 option-LTP state reproduce after a healthy bridge refresh, and should zero upstream quotes fail closed visibly?
- When should live Zerodha positions graduate from deferred foundation to chart-visible workflow?
- When should `codex/timeframe-axis-ladder` merge into the primary branch after user testing?
