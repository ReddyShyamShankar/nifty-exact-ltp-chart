# Open Questions

Questions needing user decisions. Defaults are proposed only to keep work moving. First-release decisions below are now accepted unless changed later.

## Market and data

1. First underlying: NIFTY only. Accepted.
2. First exchange/feed: NSE data available in TradingView? Must verify on actual account.
3. First expiry: monthly only. Accepted.
4. Premium: last traded price only. Accepted for first release.
5. Data delay tolerance: should delayed values be shown with a warning? Proposed default: yes, always show status.

## Strike ladder

6. Number of strikes visible: five total by default; user-configurable. Accepted.
7. Strike center: automatic ATM with manual override. Accepted.
8. Strike spacing: auto-detect or manual interval? Proposed default: manual interval first.
9. Calls/puts: both visible by default. Accepted.

## Strategy workflow

10. First strategy to support: straddle, strangle, credit spread, debit spread, or custom legs? Proposed default: custom legs with straddle preset.
11. Position quantity: lots or units? Proposed default: lots plus configurable lot size.
12. P&L basis: mark-to-last or bid/ask conservative mark? Proposed default: selectable.
13. Break-even: expiry-only first, or date-sensitive model? Proposed default: expiry-only first.

## Product boundary

14. Must everything remain inside TradingView, even if that limits automatic option-chain discovery?
15. Is a companion web panel acceptable later if it improves chain discovery and data quality? Accepted later.
16. Are alerts required in first usable release or later? Required.

## Safety

17. Indicator must be informational only, with no trade recommendation. Accepted.
18. What warning language should appear for delayed, missing, or estimated data?
