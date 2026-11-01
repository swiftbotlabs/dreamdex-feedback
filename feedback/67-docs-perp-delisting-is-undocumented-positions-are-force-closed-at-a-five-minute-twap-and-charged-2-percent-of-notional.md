# Docs: perp delisting is not documented anywhere, yet it force-closes every position at a 5-minute TWAP and charges 2% of notional, twice the largest perp fee the docs list
Severity: major
Area: docs | contracts

> **Summary.** The perps docs list every fee a trader can pay: maker 0, taker 0, and a liquidation fee of "up to 1% of the notional closed, only if you are liquidated". The word "delist" appears nowhere in the docs (0 hits in `llms-full.txt`). The contracts
> do delist. On 2026-09-22 09:40–09:42 UTC on Shannon, the SWBTCC market entered settlement and all 24 open positions were closed against each other at one TWAP price, and each was charged **exactly 2.00%** of notional: 573.86 USDso on 28,693.21 USDso. None of them
> was liquidated. On that market (40×), 2% of notional is 80% of the initial margin. On a 20× market such as Tokyo's BTC-PERP it would be 40%. A trader has no way to learn this exists, how much notice to expect, or what it costs. No market has been delisted on Tokyo yet (21
> `PoolRegistered` events and nothing else).
>
> **Checked 2026-11-01, 12:12–12:18 UTC**, read-only, from the indexers and on chain. Evidence: `evidence/66/`.

## Steps to reproduce
```sh
python3 evidence/66/delisting_history.py
curl -s https://app.dreamdex.io/llms-full.txt | grep -ci delist     # 0
```
The script prints each lifecycle event with its transaction, then the totals from `PerpSettlementPairing`.

## Expected
The perps docs describe delisting: when it can happen, the notice given, the settlement window and the price it uses, and its fee. The fee table includes it.

## Actual
From the indexer (`PerpMarketLifecycleEvent`, `PerpSettlementPairing`), market `0x50b8…ac5`:

| UTC, 2026-09-22 | Event | Detail |
|---|---|---|
| 09:40:37 | `SettlementEntered` | price 85,907.82, 16 samples, 300 s TWAP, tx `0xc18a9b14…e7d3` |
| 09:41:42 | `SettlementBatchProcessed` | 10 settled, fee 178.69 USDso, tx `0x9c973573…f0bf` |
| 09:41:45 | `SettlementBatchProcessed` | 10 settled, fee 335.04 USDso, tx `0xde9a2069…5d352` |
| 09:41:48 | `StaleOrdersCancelled` | 26 orders |
| 09:41:52 | `SettlementBatchProcessed` | 4 settled, fee 60.14 USDso, tx `0x9bbd9798…af73` |
| 09:42:03 | `MarketDelisted` | tx `0xaf0a8b30…21cc` |

24 pairings, 28,693.21 USDso of notional, 573.86 USDso charged: 2.0000% on every row.

What the docs say instead:
- Perps on Testnet: "Maker fee 0", "Taker fee 0", "Liquidation fee: Up to 1% of the notional closed, only if you are liquidated".
- Margin & Liquidations: no mention of settlement or delisting.
- Risks, FAQ, the SDK's perps guide: nothing on delisting. The SDK only exposes the errors (`MarketSettled`, `SettlementNotReady` and others) and the indexer has the event types.

Scope, stated plainly: this has happened once, on one test market on Shannon, so we can't say how notice is given. The parameters (`minLeadSeconds`, `twapWindowSec`, `dwellSeconds`) were configured on 9 Shannon markets on 2026-09-16, and `minLeadSeconds` was cut from 300 to 1 on SWBTCC before the settlement that ran. We rate this major for the money involved. It's also the kind of thing a trader must read before mainnet perps launch.

## Evidence
`evidence/66/delisting_history.py`, output `evidence/66/delisting_history_2026-11-01T1218Z.txt`. Docs: `https://app.dreamdex.io/llms-full.txt` as served 2026-11-01.

## Suggested fix
Add a "Delisting" section to Margin & Liquidations, add the settlement fee to the fee table, and publish how to read a market's settlement parameters.

## Environment
- Somnia Shannon testnet (chain 50312), indexer `https://dev.smk.somnia.host/v1/graphql`; Somnia Tokyo testnet (chain 50383), indexer `https://hideki-dev.smk.somnia.host/v1/graphql`
- Read-only, no transactions sent
