# Indexer `Market.markPrice` (what `listPerpMarkets()` returns) lags the on-chain mark by 15–40 minutes, up to 1.4 %, while the indexer is otherwise at the chain head
Severity: normal
Area: API | docs

`client.listPerpMarkets()` is the documented entry point ("Connect" sample on the developer page) and
its rows carry `markPrice` / `markPriceUpdatedAt` / `indexPrice` from the indexer `Market` table. The
bot kit sizes orders from that field when no live mark is passed (`sizeForNotional` in
`packages/perp-core/src/markets.ts`). On Hideki the row's `markPrice` is refreshed only every
15–40 minutes even though `chain_metadata.latest_processed_block` is within a few blocks of the
head, so `PerpMarket.markPrice` is routinely 10–140 bps away from `PerpPool.tryGetMarkPrice()`.
Nothing on the developer page or in the `PerpMarket` field docs says the row's mark is a slow
snapshot, and `markPriceUpdatedAt` is the only hint.

## Steps to reproduce
1. Query the indexer:
   ```graphql
   query { chain_metadata { latest_processed_block }
           Market(where:{marketType:{_eq:"PERP"}}, limit: 50) { baseSymbol poolAddress markPrice markPriceUpdatedAt } }
   ```
2. For each `poolAddress` call `tryGetMarkPrice()` on the pool (chain head at the same moment).
3. Compare; `node scripts/mark_lag.mjs` does both and prints the table.

## Expected
Either the row's `markPrice` tracks the chain within a few blocks (the indexer is at the head), or the
docs say how often it is refreshed and that sizing/pricing must use `getPerpState` /
`tryGetMarkPrice`.

## Actual
2026-10-19 09:34:49 UTC, chain head 27506743, indexer block 27506737 (6 blocks = 60 ms behind):

| market | chain `tryGetMarkPrice` | indexer `markPrice` | row age | diff |
|---|---|---|---|---|
| PUMP | 0.0045272896 | 0.0044658467 | 2367 s | +137.6 bps |
| ZRO | 1.8803751381 | 1.8874262263 | 2359 s | −37.4 bps |
| BTC | 82928.738751 | 82664.969019 | 1386 s | +31.9 bps |
| VVV | 23.838330355 | 23.767396331 | 2365 s | +29.8 bps |
| SUI | 1.0108549502 | 1.0079288032 | 1205 s | +29.0 bps |
| SOL | 105.79768248 | 105.51606645 | 2433 s | +26.7 bps |
| ETH | 2440.1454067 | 2436.0206829 | 931 s | +16.9 bps |
| (all 21 markets) | | | 931–2433 s | 5–138 bps |

A 10 ms-block chain whose indexed mark is 15–40 minutes old is a trap for anyone who reads
"realtime … streamed with zero polling" on the SDK overview and sizes from the row.

### Re-check 2026-10-19 15:08 UTC: worse
`node scripts/mark_lag.mjs` at 15:08:41 UTC, chain head 27706930, indexer block 27706922 (8 blocks behind),
output in `evidence/mark_lag_2026-10-19T1508Z.txt`:

| market | chain `tryGetMarkPrice` | indexer `markPrice` | row age | diff |
|---|---|---|---|---|
| ZRO | 1.8727166386 | 1.8195752138 | 788 s | +292.1 bps |
| SUI | 0.9975435031 | 0.9884048235 | 3238 s | +92.5 bps |
| AVAX | 9.6673286945 | 9.6000726647 | 3239 s | +70.1 bps |
| ETH | 2405.6909265 | 2394.9717725 | 2963 s | +44.8 bps |
| BTC | 82139.790644 | 81781.713460 | 3418 s | +43.8 bps |
| (all 21 markets) | | | 788–3418 s | 2–292 bps |

So the row mark was 13–57 minutes old and up to 2.9 % off (the title's "15–40 minutes, up to 1.4 %"
is from the 09:34 UTC run). During that hour our own ETH-PERP order (tx
`0x39ca9dd7b0f749ad37703072ddbce9ef4e798ed37080d91c47bd5486a8390aac`, 15:03:39 UTC) and its cancel showed up in
the indexer's `Order` and `MarginEvent` tables when we queried ~30 s later. Order and margin rows are fresh,
so the stale value is the `Market.markPrice` refresh itself. We priced that order from `tryGetMarkPrice`
(2409.19). Pricing it from the row (2394.97 at the time) would have put it ~0.6 % lower.

## Evidence
- Full 21-row table from `scripts/mark_lag.mjs` (output kept in `evidence/mark_lag.txt`).
- Indexer `chain_metadata` in the same response shows the indexer at the head, so this is the mark
  refresh cadence, not indexer lag.

## Suggested fix
Refresh `Market.markPrice` on every `FundingUpdated`/mark update event (or on a short timer), or
document the cadence on the developer page and in the `PerpMarket.markPrice` field doc with a pointer
to `client.getPerpState(pool)` / `getPerpFeedStatus(pool)` for anything that prices or sizes.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (field semantics read from source; not executed)
- Indexer `https://hideki-dev.smk.somnia.host/v1/graphql`; RPC `https://api.hideki2.infra.testnet.somnia.network`
- Somnia Hideki testnet, chain id 50383, block 27506743
- Date: 2026-10-19, 09:34 UTC
- Wallet: n/a (reads only)
