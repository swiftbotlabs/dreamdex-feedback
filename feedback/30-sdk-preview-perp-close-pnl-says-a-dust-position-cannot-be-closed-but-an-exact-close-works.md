# SDK + docs: `previewPerpClosePnl` returns `placeable: false` for a position below `minQuantity` and says it "can only leave via liquidation or ADL", but the pool accepts one order that closes exactly the whole position
Severity: normal
Area: SDK

> **Summary.** For a perp position smaller than its market's `minQuantity`, `previewPerpClosePnl` in
> `@somnia-chain/markets-sdk` 0.32.1 returns `placeable: false`. Its type doc says `false` "means the close cannot be
> placed at all" and that such a position "can only leave via liquidation or ADL". The dreamDEX docs say the same thing
> in their own words: "Anything below it is rejected automatically". The PerpPool behaves differently. A closing order
> whose quantity is **exactly** the position size is accepted below `minQuantity` and flattens the position. Every other
> order below the minimum still reverts `QuantityBelowMinimum`. A close modal or bot that follows the SDK flag tells the
> trader the position cannot be closed, when one ordinary order would close it. A trader who follows the docs and sends
> `minQuantity` instead gets flipped into a new position that is again below the minimum. At 08:08 UTC, 63 of the 10,856
> open positions on Somnia Tokyo were below their market's minimum.

> **Checked 2026-10-26, 08:06–08:12 UTC.** At the chain head (block 33501213, 08:11:11 UTC), on 5 positions on BTC-PERP,
> ETH-PERP and WLD-PERP, the exact-size close is accepted as NormalOrder, FillOrKill and ImmediateOrCancel (15 of 15). All
> 19 below-minimum controls revert `QuantityBelowMinimum`. The pinned block 33461989 gives the same result. npm `latest`
> is still 0.32.1, and `canary` 0.32.2-canary.38575926931.ge4550933d36d has the same code and doc lines.

**Not the same as** the SDK sizing helpers (`getMaxPerpOrderSize`, `previewPerpOrderMargin`) passing a below-minimum
or off-grid order that the pool then rejects. This report is the reverse case: the SDK and the docs say a close cannot be
placed, and the pool accepts it.

The Perps guide says `previewPerpClosePnl` "backs a close modal" (`docs/PERPS.md`, "**What do I get if I close?**"). Its
`placeable` flag is computed from the pool minimum alone (`dist/perp/margin.js:1976`):

```
placeable: closedQuantity >= book.minQuantity && closedQuantity > 0n,
```

The published type doc on that field (`dist/perp/margin.d.ts:2003–2006`, the text an IDE shows on hover):

```
Whether {@link closedQuantity} clears the pool's `minQuantity`.

`false` means the close cannot be placed at all — not that it is small. A dust
position below the minimum can only leave via liquidation or ADL.
```

The guide adds "`placeable` is the pool minimum and nothing else" (`docs/PERPS.md:255`; hosted at
`https://somnia-platform-explorer.vercel.app/markets/llms-full.txt`, line 3430).

The dreamDEX docs state the minimum with no exception. None of these pages, and nothing else in `llms-full.txt`,
mentions dust positions or a full-close exemption:
- FAQ, `/docs/support/faq/order-rejected`: "Every market has a **`minQuantity`**, the smallest order it will accept.
  Anything below it is rejected automatically."
- `/docs/developers/perps-testnet`: "A price must sit on the market's `tickSize` and a quantity on its `lotSize`, at
  least `minQuantity`."
- `/docs/trading/common/order-types`: "An order below `minQuantity`, or whose size/price is not a whole multiple of
  `lotSize`/`tickSize`, is rejected on-chain."

On chain, the size exemption applies to exactly one order: one on the closing side whose quantity equals `|size|`. A
partial close, a close that also flips, an increase, and the same order sent from an account with no position all revert
`QuantityBelowMinimum(quantity, minQuantity)` (`0xeaa68ceb`). A `debug_traceCall` of the exact-size FillOrKill shows it
fills completely and emits `PositionUpdated` with `newSize 0` for the owner, on all three markets.

Such positions mostly come out of normal trading: a reduce or a flip that leaves a remainder below the minimum (the
BTC and WLD minimums were the same at the blocks of both examples below as they are today,
`evidence/30/min_quantity_history_2026-10-26T0827Z.txt`). At indexer block 33499336 (08:08 UTC), 63 of the 10,856 open positions were below their market's
`minQuantity`, and all 63 sizes match `MarginBank.getPosition` at that block. By market: BTC 39, ETH 5, XLM 3, WLD 2,
NEAR 2, SOL 2, DOGE 2, and one each on ZRO, VVV, BNB, HYPE, TAO, AVAX, LINK and 1000PEPE. The last position change of
each was REDUCE 38, FLIP 21 and OPEN 4. Two examples, decoded from their receipts:
- tx `0xfd97806156143b1b298d5ef551190bcff60d4cca506fe1a5738663956769ebc1` (BTC-PERP, block 23296283, 2026-10-14
  12:30:06 UTC): the indexer records a REDUCE from -24000 that closed 13000, exactly the minimum. The receipt's
  `PositionUpdated` leaves `0x2f92Ab9455b49892AC77Ca2fc6321FDf23E55590` at `newSize -11000`, and the position was still
  -11000 at 08:08 UTC.
- tx `0x143639eb810c340a9d041e6cdc6154065f2ddb1df242222e0a6e3fe5d579b6ec` (WLD-PERP, block 31419483, 2026-10-23
  22:20:20 UTC): the indexer records a REDUCE of 32 WLD on a 37 WLD short. The receipt's `PositionUpdated` leaves
  `0x3391dc5839157E746c5f1756Cc11e0765ad5aE62` at `newSize -5000000000000000000` (min 26 WLD). It is one of the five
  positions tested below.

Following the docs does not flatten such a position. The only orders the docs allow (at least `minQuantity`) flip it.
For the BTC long of 2000, a FillOrKill sell of 13000 is accepted and leaves `newSize -11000`: a new short, again below
the minimum.

## Steps to reproduce
All steps are read-only: plain `eth_call` / `debug_traceCall` from the position's real owner, with nothing signed and
no state overrides. We did not execute the SDK. Its `placeable` value follows from the expression at
`dist/perp/margin.js:1976` with the on-chain inputs, and `evidence/30/dust_close_check.mjs` applies the same expression.

1. Pinned raw calls, BTC-PERP pool `0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0` (minQuantity 13000, lotSize 1000),
   block `0x1fe96e5` = 33461989 (2026-10-26 07:05:47 UTC). Account `0x1cc7ecc3a7dba7760c7a47b926bd11b6211ed276` holds
   a long of 2000 there (`MarginBank 0x478769E1177C0773c43A593DCCc4Ad15F15F1394 getPosition`). Each body is
   `placeOrder(isBid, 0, price, quantity, expireTimestampNs = block time + 1 h, orderType = 2 (ImmediateOrCancel), 0,
   0x0, 0)` at the best bid (sells) or best ask (buys) of that block:
   ```
   RPC=https://api.hideki2.infra.testnet.somnia.network
   curl -s -H 'content-type: application/json' --data @evidence/30/req_full_close_sell_2000.json $RPC   # exact full close
   curl -s -H 'content-type: application/json' --data @evidence/30/req_partial_sell_1000.json $RPC      # partial close
   curl -s -H 'content-type: application/json' --data @evidence/30/req_close_flip_sell_3000.json $RPC   # close + flip
   curl -s -H 'content-type: application/json' --data @evidence/30/req_increase_buy_2000.json $RPC      # increase
   curl -s -H 'content-type: application/json' --data @evidence/30/req_flat_account_sell_2000.json $RPC # same sell from 0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817 (no BTC position)
   ```
   (`node evidence/30/pinned_bodies.mjs evidence/30` rebuilds these bodies.)
2. Five positions at one block (default: chain head), each as NormalOrder, FillOrKill and ImmediateOrCancel, with
   controls and the SDK rule applied to the same chain reads:
   ```
   node evidence/30/dust_close_check.mjs              # chain head
   node evidence/30/dust_close_check.mjs 0x1fe96e5    # pinned
   ```
   Positions: BTC `0x1cc7ecc3…d276` (long 2000) and `0x9002b9c4958ef4b71675d7a33956f9f6913ff566` (short 9000); ETH-PERP
   `0xD6Cb1DD58580B84D76068aC21594219ce03aeddf` (min 4e15, lot 1e14) `0x5ad3f981bc477868844f1c925a82c6c0f5a33817`
   (short 1e14) and `0x879f00002e1ebf877da934a6332ca1bed907154f` (short 5e14); WLD-PERP
   `0x0f464d57c1fd839e4d87a408bbccdab8f77e6394` (min 26e18, lot 1e18) `0x3391dc58…ae62` (short 5e18).
3. Show the close fills and flattens: `node evidence/30/dust_close_trace.mjs 0x1fee777` (`debug_traceCall` of the
   exact-size FillOrKill on BTC, ETH and WLD at block 33482615; the prices in the script are that block's best levels).
4. Show what the documented minimum order does: `node evidence/30/min_order_trace.mjs 0x1fee777` (BTC long 2000, sell
   13000 FillOrKill).
5. Census: `node evidence/30/dust_census.mjs out.json`. It takes pools from `PerpPoolFactory
   0xE631fAEE547baeE07353E290f0562ea67d856560 getPerpPoolStatuses()`, open positions from the indexer
   (`https://hideki-dev.smk.somnia.host/v1/graphql`, `PerpPosition(where:{size:{_neq:"0"}})`), re-reads each
   below-minimum row with `getPosition`, and fetches its last `PerpPositionChange`. Then run
   `node evidence/30/dust_origin_receipts.mjs` for the two example receipts.
6. Read `dist/perp/margin.d.ts:2003–2006`, `dist/perp/margin.js:1976` and `docs/PERPS.md:255` in the 0.32.1 tarball
   (`npm pack @somnia-chain/markets-sdk@0.32.1` into an empty directory), and the three docs pages quoted above.

## Expected
The SDK and the docs agree with the pool. Either:
- `placeable` is `true` for a full close (`fullClose && closedQuantity == |size|`) even below `minQuantity`, the type doc
  says a position below the minimum can be closed with one order of exactly its size, and the docs pages above mention
  this exemption; or
- if the exemption is not intended, the pool rejects that order like every other below-minimum order, and the SDK text
  stays as it is.

## Actual
The SDK says the close cannot be placed. The docs say any order below `minQuantity` is rejected. The pool accepts the
exact-size close.

Step 1, run 2026-10-26 08:06:57 UTC (`evidence/30/out_pinned_curl.txt`):
```
req_full_close_sell_2000.json
  {"jsonrpc":"2.0","id":1,"result":"0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000003600000000000774655"}
req_partial_sell_1000.json
  {"jsonrpc":"2.0","id":1,"error":{"code":3,"message":"execution reverted","data":"0xeaa68ceb00000000000000000000000000000000000000000000000000000000000003e800000000000000000000000000000000000000000000000000000000000032c8"}}
req_close_flip_sell_3000.json
  {"jsonrpc":"2.0","id":1,"error":{"code":3,"message":"execution reverted","data":"0xeaa68ceb0000000000000000000000000000000000000000000000000000000000000bb800000000000000000000000000000000000000000000000000000000000032c8"}}
req_increase_buy_2000.json
  {"jsonrpc":"2.0","id":1,"error":{"code":3,"message":"execution reverted","data":"0xeaa68ceb00000000000000000000000000000000000000000000000000000000000007d000000000000000000000000000000000000000000000000000000000000032c8"}}
req_flat_account_sell_2000.json
  {"jsonrpc":"2.0","id":1,"error":{"code":3,"message":"execution reverted","data":"0xeaa68ceb00000000000000000000000000000000000000000000000000000000000007d000000000000000000000000000000000000000000000000000000000000032c8"}}
```
`0xeaa68ceb` = `QuantityBelowMinimum(uint256,uint256)`. The arguments are `0x3e8` = 1000, `0xbb8` = 3000, `0x7d0` = 2000
and `0x32c8` = 13000.

Step 2 at the chain head, block 33501213 (2026-10-26 08:11:11 UTC; `evidence/30/out_head.txt`). The BTC long of 2000:
```
   chain: size 2000 (long), minQuantity 13000, lotSize 1000, ...
   SDK previewPerpClosePnl port: closedQuantity 2000, fullClose true, placeable false
   owner  full close  IOC  q=|size|       sell q=2000 px=79705800000000000000000: ACCEPTED
   owner  full close  LIMIT q=|size|      sell q=2000 px=79705800000000000000000: ACCEPTED
   owner  full close  FOK  q=|size|       sell q=2000 px=79705800000000000000000: ACCEPTED
   owner  partial     IOC  q=|size|-lot   sell q=1000 px=79705800000000000000000: REVERT QuantityBelowMinimum(1000,13000)
   owner  close+flip  IOC  q=|size|+lot   sell q=3000 px=79705800000000000000000: REVERT QuantityBelowMinimum(3000,13000)
   owner  close side  IOC  q=minQuantity  sell q=13000 px=79705800000000000000000: ACCEPTED
   owner  increase    IOC  q=|size|       buy  q=2000 px=79705900000000000000000: REVERT QuantityBelowMinimum(2000,13000)
   flat   same order  IOC  q=|size|       sell q=2000 px=79705800000000000000000: REVERT QuantityBelowMinimum(2000,13000)
```
(`LIMIT` in the script's labels is orderType 0, `NormalOrder`.) All five positions:

| market, position | SDK `placeable` | exact-size close (3 order types) | partial | close + flip | increase | flat account | `minQuantity` on the closing side (more than the position) |
|---|---|---|---|---|---|---|---|
| BTC, long 2000 (min 13000) | `false` | accepted 3/3 | revert | revert | revert | revert | accepted |
| BTC, short 9000 | `false` | accepted 3/3 | revert | revert | revert | revert | accepted |
| ETH, short 1e14 (min 4e15) | `false` | accepted 3/3 | n/a (one lot) | revert | revert | revert | accepted |
| ETH, short 5e14 | `false` | accepted 3/3 | revert | revert | revert | revert | accepted |
| WLD, short 5e18 (min 26e18) | `false` | accepted 3/3 | revert | revert | revert | revert | accepted |

All 15 exact-size closes are accepted, and all 19 controls below the minimum revert
`QuantityBelowMinimum(quantity, minQuantity)`. The 5 orders of exactly `minQuantity` are accepted as well. They are not
below the minimum, but they are larger than the position, so a full fill flips it. We traced this for the BTC long
(step 4). The pinned block 33461989 gives the same result (`evidence/30/out_block_0x1fe96e5.txt`).

Step 3, block 33482615 (2026-10-26 07:40:11 UTC; `evidence/30/out_trace_0x1fee777.txt`):
```
== BTC long 2000, sell 2000 FOK ... top-level error: none
   OrderFilled: ... filled 2000 takerRemaining 0 price 80030600000000000000000
   PositionUpdated: account 0x1cc7ecC3a7DbA7760c7A47B926Bd11B6211ed276 pool 0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0 newSize 0 avgEntry 0 realizedPnl -43674000000000000
== ETH short 1e14, buy 1e14 FOK ... top-level error: none
   PositionUpdated: account 0x5Ad3f981BC477868844F1c925a82c6C0F5a33817 pool 0xD6Cb1DD58580B84D76068aC21594219ce03aeddf newSize 0 avgEntry 0 realizedPnl 4791027612338429
== WLD short 5e18, buy 5e18 FOK ... top-level error: none
   PositionUpdated: account 0x3391dc5839157E746c5f1756Cc11e0765ad5aE62 pool 0x0F464d57c1FD839E4d87A408BBcCDAb8f77E6394 newSize 0 avgEntry 0 realizedPnl 731000000000000000
```

Step 4, same block (`evidence/30/out_min_order_trace.txt`):
```
BTC long 2000, sell 13000 (= minQuantity) FOK, top-level error: none
   PositionUpdated account 0x1cc7ecC3a7DbA7760c7A47B926Bd11B6211ed276 newSize -11000 (minQuantity 13000)
```

Step 5, 2026-10-26 08:08:03–08:08:58 UTC (`evidence/30/out_dust_census.txt`, `evidence/30/dust_census.json`):
```
 "indexerHeadBlock": "33499336", "pools": 21, "openPositions": 10856, "belowMinQuantity": 63,
 "chainSizeMatchesIndexer": 63,
 "lastChangeKind": { "REDUCE": 38, "FLIP": 21, "OPEN": 4 }
```
Receipts (`evidence/30/out_dust_origin_receipts.txt`): `0xfd978061…ebc1` → `0x2f92…5590 newSize -11000`;
`0x143639eb…b6ec` → `0x3391…aE62 newSize -5000000000000000000`.

## Evidence
All files are in `evidence/30/`:
- `req_*.json` (5 bodies), `pinned_bodies.mjs` and `out_pinned_curl.txt`: the pinned raw calls of step 1.
  `repro_pinned.mjs` → `out_repro_pinned.txt` runs the same five calls through viem.
- `dust_close_check.mjs` → `out_head.txt` (block 33501213) and `out_block_0x1fe96e5.txt` (block 33461989).
- `dust_close_trace.mjs` → `out_trace_0x1fee777.txt`; `min_order_trace.mjs` → `out_min_order_trace.txt`.
- `dust_census.mjs` → `out_dust_census.txt`, `dust_census.json` (all 63 rows: indexer size, chain size, min, lot,
  last change); `dust_origin_receipts.mjs` → `out_dust_origin_receipts.txt`.
- `min_quantity_history_2026-10-26T0827Z.txt`: `getOrderBookParameters()` of BTC-PERP and WLD-PERP at both example
  receipts' blocks and parents and at block 33501000 (minimum unchanged: 13000 and 26e18).
- `sdk_excerpts.txt`: the quoted lines from the 0.32.1 and canary tarballs, plus npm dist-tags. Both tarballs' sha512
  match npm `dist.integrity`. They were read as text; nothing was installed or run.
- `docs_grep.txt`, with copies of the pages fetched 2026-10-26 08:09 UTC: `docs_llms-full_2026-10-26T0809Z.txt.gz`
  (`https://app.dreamdex.io/llms-full.txt`, lines 3736, 5203 and 5683), `page_docs_*_2026-10-26T0809Z.html.gz` (the
  three pages quoted), and `sdk_markets_llms-full_2026-10-26T0809Z.txt.gz` (the hosted SDK guide, line 3430). The search
  finds no "dust" or "full close" text on any of the three pages. In `llms-full.txt` the word "dust" appears only once,
  for rounding dust in `lockedSurplus`. The two reduce-only lines (`/docs/trading/perps-testnet/orders`) say nothing
  about size.

## Suggested fix
- SDK: compute `placeable` as `closedQuantity > 0n && (closedQuantity >= book.minQuantity || closedQuantity ===
  absSize)`, with `absSize` the position's unsigned size. A close that takes the whole lot-aligned position is then
  `true`. Replace the type doc's "can only leave via liquidation or ADL" with the real rule: an order on the closing side
  whose quantity is exactly the position size is accepted below the minimum, and any other size below it reverts. Say
  the same in `docs/PERPS.md` next to "`placeable` is the pool minimum and nothing else".
- Docs: add the exemption to the FAQ "The order was below the minimum size", to `/docs/developers/perps-testnet`
  ("at least `minQuantity`"), to the Order Types warning and to the `QuantityBelowMinimum` row of the Errors page. Tell a
  trader with a position below the minimum to close it with one order of exactly its size, not a larger one, which
  flips them into a new position.
- If the exemption is not intended, keep the SDK text and make the pool reject this order as well. Then say in the docs
  how a position below the minimum can be closed.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (npm `latest`) and 0.32.2-canary.38575926931.ge4550933d36d (source and docs read
  as text from the npm tarballs; not executed); viem 2.57.7 for our own read-only scripts
- Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and SDK), RPC `https://api.hideki2.infra.testnet.somnia.network`;
  indexer `https://hideki-dev.smk.somnia.host/v1/graphql`
- MarginBank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394`, PerpPoolFactory `0xE631fAEE547baeE07353E290f0562ea67d856560`
  (21 pools); BTC-PERP `0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0`, ETH-PERP `0xD6Cb1DD58580B84D76068aC21594219ce03aeddf`,
  WLD-PERP `0x0F464d57c1FD839E4d87A408BBcCDAb8f77E6394`
- Docs: `https://app.dreamdex.io/docs/support/faq/order-rejected`, `/docs/developers/perps-testnet`,
  `/docs/trading/common/order-types`, `https://app.dreamdex.io/llms-full.txt`, read 2026-10-26 08:09 UTC
- Date: 2026-10-26, 08:06–08:12 UTC (chain head runs); pinned reads at blocks 33461989 and 33482615
- Wallet: none of ours. Every call is sent `from` the position's own owner (or the flat control account), with nothing
  signed and no state overrides.
