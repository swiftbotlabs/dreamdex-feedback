# Event Contracts: the strike and the close are floored to 2 decimals while settlement compares full precision, so a close that reads equal to the strike can pay either side, and the ticket, the tooltip and the FAQ state different rules
Severity: normal
Area: app | contracts | docs

> **Corrected 2026-11-01. This report was filed as critical on 2026-10-29 and we got the main claim wrong.** It said windows that
> close exactly at their strike settle against the market's own oracle question, and that identical ties settle on opposite
> sides. Neither holds. We compared the oracle's `numericValue` and the market's `strike`, which are both floored to 2 decimals.
> The settlement compares the full-precision price. Re-tested against the on-chain price feed
> (`price-feed.prd.oracle.somnia.host`, `PricePoint.spot`, 18 decimals), **all 61 "ties" are explained and none contradicts its
> question**: 53 by `spot(T) >= line`, 7 by the feed row published just before expiry (see below), and 1 mainnet window has no
> feed row at T. On recent windows there are no exceptions: see the results in `evidence/57/ec_settlement_rule_2026-10-30_to_11-01.txt`.
> So there was no inconsistent settlement, and the severity is now **normal**. What remains is a display and wording problem,
> described below. The original text is in the git history (commit `f8b7577`).

> **Summary.** An Up/Down market keeps its opening price at full precision in the oracle's question
> (`"at or above 2397.255"`), but the market's `strike`, the app's Strike row and the ticket header show it floored to 2 decimals
> (`2397.25`), and the oracle's recorded value is floored the same way. Two windows can therefore both read "close 2397.25,
> strike 2397.25" and pay opposite sides, correctly, and a trader has no way to see why. The app's ticket says "**above**
> $2,397.25", its tooltip says "**at or above** it", the docs say "at or above" and the FAQ adds a strictly-above rule. The actual
> rule is `full-precision close >= full-precision open`.

## Steps to reproduce
1. Re-test the windows the first version called ties, against the full-precision feed (read-only, Python 3 standard library):
   ```sh
   python3 evidence/57/ec_ties_vs_price_feed.py mainnet evidence/57/ec_tie_check_mainnet_2026-10-29T2028Z.txt
   python3 evidence/57/ec_ties_vs_price_feed.py tokyo   evidence/57/ec_tie_check_tokyo_2026-10-29T2032Z.txt
   ```
2. Check which feed row a period's settlements used:
   ```sh
   python3 evidence/57/ec_settlement_rule.py 2026-10-30 2026-11-01
   ```
3. Open a live market, e.g. https://app.dreamdex.io/event-contracts/WETH:USDso/15m (mainnet, logged out). Compare the header
   ("Will ETH settle **above** $X.XX at HH:MM UTC?") and the Strike row with the market's question:
   ```sh
   curl -s https://prd.smk.somnia.host/v1/graphql -H 'content-type: application/json' \
     -d '{"query":"{ Market(where:{marketType:{_eq:BINARY}}, limit:4, order_by:{expiry:desc}) { asset intervalSec strike question } }"}'
   ```
   `strike` has 2 decimals. The question's line often has 3 or 4. Hover **STRIKE** for the tooltip ("Up wins if the closing price
   is **at or above** it").

## Expected
The price a trader is shown as the line is the line the market settles against, the close is shown at the same precision, and
one rule is stated the same way in the ticket, the tooltip and the docs.

## Actual
**Two windows that read the same, paying opposite sides, both correctly:**

| Window (mainnet) | Question's line | `strike` | Oracle value | Feed `spot` at T | Paid |
|---|---|---|---|---|---|
| ETH, expiry 2026-10-23 09:50 UTC | 2397.255 | 2397.25 | 2397.25 | 2397.255 | **Up** (`2397.255 >= 2397.255`) |
| ETH, expiry 2026-10-11 02:00 UTC | 2508.455 | 2508.45 | 2508.45 | 2508.45 | **Down** (`2508.45 < 2508.455`) |

Both read "close == strike" on every surface that shows 2 decimals, including the oracle's recorded value.

**The stated rules differ:**

| Source | Wording |
|---|---|
| App ticket header | "Will ETH settle **above** $2,313.46 at 20:30 UTC?" |
| App STRIKE tooltip | "Up wins if the closing price is **at or above** it" |
| Docs, Event Contracts / Settlement & Voids / FAQ | "if the asset closes the window at or above its opening price, Up wins" |
| Docs, FAQ "settled against me" | "a fixed-strike market resolves Up only if the close is *above* the strike" |
| Oracle's recorded question | "at or above **2397.255**" |

The ticket's rule and the real one differ whenever the close falls between the floored strike and the true line, and at an exact
tie on a 2-decimal line.

**Settlements checked against the feed** (`evidence/57/ec_settlement_rule_*.txt`, `ec_ties_vs_price_feed_*.txt`):
- 2026-10-30 to 11-01: 1,150 of 1,150 expiries with a feed row have an oracle value equal to `floor(spot(T))`; 0 of 1,629 markets
  differ from `spot(T) >= line`.
- 2026-10-20: 572 of 572 and 0 of 812, the same result.
- 2026-10-09 to 10-14: the settlement read an earlier row. The oracle value matches only the row at T-1 on 1,129 of the 2,636
  expiries with a row at T, and 41 of 3,741 markets settled differently from `spot(T) >= line`. Oracle answers landed in the same
  second as expiry until about 2026-10-14 and are often one second later from then on (`Answer.resolvedAt`), which fits this change.
  The docs do not say which instant the settlement price is taken at, and we have seen no recurrence since. We note it because it
  explains the outside trade in the first version: `0x4e3e…3852` held Down on `0x…9de4` (ETH, 2026-10-10 05:45 UTC). The market paid
  Up at 2496.335, the feed row from one second before expiry, and the row at expiry read 2496.255.

## Evidence
- `evidence/57/ec_ties_vs_price_feed.py`, outputs `ec_ties_vs_price_feed_mainnet_2026-11-01T1144Z.txt` and
  `ec_ties_vs_price_feed_tokyo_2026-11-01T1145Z.txt`: every window the first version listed, with the full-precision feed rows.
- `evidence/57/ec_settlement_rule.py`, outputs `ec_settlement_rule_2026-10-09_to_10-14.txt`, `ec_settlement_rule_2026-10-20.txt`,
  `ec_settlement_rule_2026-10-30_to_11-01.txt`.
- `evidence/57/ec_tie_check.py` and its outputs: the original 2-decimal comparison, kept because it lists the windows.
- `evidence/57/ec_tie_onchain.mjs`, `ec_fill_transfers.mjs` and their outputs: payout vectors, oracle answer events and the
  trader's token balances. These are still accurate as on-chain reads.
- `evidence/57/app_mainnet_eth15m_ticket_above_vs_tooltip_at_or_above_2026-10-29T2024Z.png`: mainnet ticket, logged out: header
  "settle above $2,313.46" next to the open STRIKE tooltip "at or above it".
- Docs (`https://app.dreamdex.io/llms-full.txt`, byte-identical on 2026-10-30 and 2026-11-01).

## Suggested fix
1. Show the strike at the precision the market settles at, in the app and in `Market.strike`, or round the opening price to the
   displayed precision before writing the question.
2. Publish the full-precision close next to the 2-decimal value in the oracle answer and the app's settled card.
3. Say the same rule everywhere: "at or above" in the ticket header, and drop or qualify the strictly-above line in the FAQ.

## Environment
- Somnia mainnet (chain 5031, indexer https://prd.smk.somnia.host/v1/graphql, feed https://price-feed.prd.oracle.somnia.host/v1/graphql)
  and Somnia Tokyo testnet (Hideki, chain 50383, indexer https://hideki-dev.smk.somnia.host/v1/graphql, feed
  https://price-feed.hideki-dev.oracle.somnia.host/v1/graphql; that feed's last row was 2026-10-28 18:41 UTC when checked)
- App: https://app.dreamdex.io, Chrome on Linux, logged out
- Python 3 (standard library only); read-only, no transactions sent. Corrected 2026-11-01 11:50 UTC.
