# LATEST_SEED

## STATE

Approved project is NIFTY Exact LTP Chart: controlled TradingView-style chart, NIFTY 1H candles, next monthly expiry, automatic rollover, five nearby strikes, real Call LTP | Strike | Put LTP labels at exact price levels. Native TradingView/Pine and browser overlays are rejected as final architecture because they cannot reliably auto-discover option contracts or map exact price pixels.

Design and implementation plan are complete in `docs/superpowers/`. Current work is repository initialization and publication. Product deployment remains blocked until Advanced Charts access and verified Upstox live-feed permissions exist.

## NEXT_LINE

Create public GitHub repository `ReddyShyamShankar/nifty-exact-ltp-chart`, push initial commit, then begin Upstox WebSocket proof gate.

## MEMORY_KEY

Exact price-level Call/Strike/Put LTP labels require chart we control: Upstox -> own data service -> TradingView Advanced Charts.

## OPEN_QUESTIONS

- Does user's Upstox analytics token receive market-data WebSocket updates?
- Does user have TradingView Advanced Charts access and public-release license approval?
- What is final product name and logo?
