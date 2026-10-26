# Contracts + docs: a perp TP/SL closes only part of its size, or nothing at all, when the owner has a resting order on the closing side. The stop registry cuts every fixed-size stop to `getReducingCapacity(owner).effectiveReducingCapacity` and reports the result as `success` or as `ReduceOnlyBelowMinQty`
Severity: major
Area: contracts

> **Summary.** When a reduce-only perp TP/SL fires, the PerpStopOrderRegistry does not place
> `min(stop quantity, |position|)`. It places `min(stop quantity, effectiveReducingCapacity)`, where
> `effectiveReducingCapacity` is `PerpPool.getReducingCapacity(owner)`: the position minus every order the owner has
> resting on the closing side. Those resting orders can be limit orders far from the market (bids at $500 on BTC, for
> example), which cannot fill at the moment the stop fires. The registry still counts them against the stop.
> - If they cover part of the position, the stop closes only the rest. It is reported as `TRIGGERED`,
>   `success = true`, `dropReason` null.
> - If they cover all of it, the stop places nothing. It is reported as `TRIGGER_FAILED` with `ReduceOnlyBelowMinQty`,
>   even though the position is 1.05x to 3,240x the pool minimum.
>
> Either way the stop is used up (its 0.15 STT is spent), and the part of the position it did not close stays open
> without the TP/SL the trader armed for it.
> No docs page and no SDK doc says that a resting order shrinks or cancels a TP/SL. This is not the self-match case,
> where the stop's IOC crosses one of the owner's orders on the other side of the book and reverts
> `SelfMatchCancelTaker`: here the resting orders are on the same side as the stop's own order, nothing reverts, and
> the size is cut before the order is placed.

> **Checked 2026-10-26, 07:52–08:12 UTC, Somnia Tokyo testnet (chain 50383).**
> - The 7 cases below, rebuilt from chain and indexer data at 07:52–07:56 UTC.
> - All 25 `ReduceOnlyBelowMinQty` drops the indexer has ever recorded (2026-10-12 to 2026-10-23) are this case:
>   25 of 25.
> - Among the newest 1,000 stops that fired and placed an order, 3 were cut to the capacity.
> - At block 33,501,406 (08:11:31 UTC), by the same rule, 5 PENDING stops on 2 accounts would fire short. 4 of them
>   would place nothing.
> - The registry and PerpPool implementations at head are the ones that ran 6 of the 7 cases.

**Distinct from Samuel1505 `feedback/10` (critical, `SelfMatchCancelTaker`):** there the stop's IOC crosses one of the owner's orders on the *other* side of the book and the whole fire reverts; here the resting orders are on the *same* (closing) side, nothing reverts, and the registry silently cuts the stop to `effectiveReducingCapacity` before placing it. Different side, different outcome (silent partial close vs revert), different fix.

**Worked example (case 1, NEAR-PERP, 2026-10-25).** Owner `0x0c56a63043be6943eb4c7be73ad44afe75bb44f2` is long 4,617.7
NEAR.
- 17:42:55 UTC: the owner arms a stop-loss, sell 4,617.7 when mark ≤ 4.60 (MARKET, reduce-only).
- 17:43:07 UTC: the owner arms a take-profit, sell 4,617.7 when mark ≥ 4.75.
- 17:45:21 UTC: a limit sell of 2,434.1 at 4.80, above the market, comes to rest on the book (order
  `737869762948391806990`).
- 18:23:25 UTC: the mark reaches 4.59989 and the stop-loss fires. `getReducingCapacity(owner)` at the parent block is
  `(position 4617.7, pendingBid 0, pendingAsk 2434.1, pendingOpposite 2434.1, effective 2183.6)`. The registry places an
  IOC sell of exactly 2,183.6, which fills, and emits `PendingOrderTriggered(success = true, dropReason = 0)`.
  The indexer row says `TRIGGERED`.

That left 2,434.1 NEAR long, with the mark already below the stop price and no stop-loss left. The 4.75 TP and the 4.80
ask were both above the market. The position stayed open for 8 h 35 min while the mark fell. It went to zero at block
33,313,569 (2026-10-26 02:58:20 UTC), with the mark at 4.4558, 3.1% below the stop price. The owner cancelled the TP two
seconds later, and the 4.80 ask was cancelled at 02:58:28.

**Not the self-trade case.** In the self-trade case, a resting order on the opposite side is crossed by the stop's IOC.
That reverts with `SelfMatchCancelTaker` and shows as `PlacementFailed` (`dropReason` 4). Here every resting order that
cuts the stop is on the same side as the stop's own order, so the IOC can never touch it. No revert happens: the size
comes from the registry's own capacity read, and the only signals are a smaller fill or `dropReason` 3.

**Why this is more than the documented reduce-only rule:**
1. The docs promise a close. The perps Orders page says "A take profit (TP) closes a position when the price reaches
   your target, and a stop loss (SL) closes it when the price moves against you. Both are reduce-only." It also says
   "Reduce-only orders can only shrink a position, never open or flip one". An order of `min(quantity, |position|)`
   meets that rule. The Margin page tells traders to "set a stop loss" to stay clear of liquidation. Neither page
   mentions resting orders, and llms-full's stop troubleshooting page says "Perps are not covered here".
2. The SDK documents the split differently. It describes the capacity split only for plain closes: "that split
   governs the collateral _lock_, not the position" (`docs/PERPS.md:143`). A plain close larger than the capacity is
   accepted, and its remainder locks collateral (`PERPS.md:255–258`). The registry uses the same split to size a
   protective exit.
3. The SDK says the size is "only ever clamped DOWN", but not by what. `PerpStopOrderLeg.quantity`
   (`dist/trade.d.ts:1407–1409`): "A non-zero quantity is fixed at creation and only ever clamped DOWN." No stop doc
   in the package mentions resting orders or capacity.
4. Drop reason 3 names the wrong cause. It is documented as "what remained was below the pool's minimum"
   (`dist/gql/graphql.d.ts:2378`), and `PERPS.md:445–447` calls `ReduceOnly*` "overtaken by events (position already
   closed, flipped, or below the minimum), which is ordinary". In all 25 drops the position was still open on the
   stop's closing side. What was below the minimum was the capacity, which was 0.
5. The orders that use up the capacity need not be reduce orders at all. In cases 2, 3, 5 and 7 they are 3.2x to
   3,600x the position, so they would flip it if they filled. In case 5, 2.14068 BTC of bids at $500, with the mark
   at 80,505, cancelled a 0.00608 BTC take-profit on a 0.01496 BTC short. Today the same bids still block four
   stop-losses on that short.

## Steps to reproduce
All steps are read-only: receipts, logs, `eth_call` at pinned blocks and indexer queries, with nothing signed. Run the
scripts from the repo root (viem 2.57.7 from `package.json`).

1. Pinned raw JSON-RPC for case 1, on RPC `https://api.hideki2.infra.testnet.somnia.network`:
   ```
   curl -s -H 'content-type: application/json' --data @evidence/28/req_case1_capacity_parent.json https://api.hideki2.infra.testnet.somnia.network
   curl -s -H 'content-type: application/json' --data @evidence/28/req_case1_position_parent.json https://api.hideki2.infra.testnet.somnia.network
   curl -s -H 'content-type: application/json' --data @evidence/28/req_case1_position_after.json  https://api.hideki2.infra.testnet.somnia.network
   curl -s -H 'content-type: application/json' --data @evidence/28/req_case1_receipt.json         https://api.hideki2.infra.testnet.somnia.network
   ```
   The calls are:
   - `getReducingCapacity(address)` (`0x2809c6ee`) on NEAR PerpPool `0x1cD15ae8bFf0FE0a7F49233BE8b90734775bA454` at
     block `0x1f79cc2`.
   - MarginBank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` `getPosition(owner, pool)` (`0xb33dc190`) at `0x1f79cc2`
     and `0x1f79cc3`.
   - The receipt of `0x43dbc0706b992846233f66661cb93b116e70ca9c515ca270a0ea3e7468903f02`, where topic0 `0x6db08222…` is
     `PendingOrderTriggered(uint128,bool,uint8,uint128)`.
2. Rebuild each fired stop: `node evidence/28/stop_case.mjs <firing tx> <stop id>`. The script prints:
   - the stop as the registry held it at the parent block (`getPendingOrder`);
   - the mark, position, pool minimum, `getReducingCapacity` and the owner's resting orders at the parent block;
   - the registry event, and the order placed in the same receipt with its fills;
   - the position after, whether the stop is still live, and the indexer row.

   | case | firing tx | stop id |
   |---|---|---|
   | 1 NEAR SL, long | `0x43dbc0706b992846233f66661cb93b116e70ca9c515ca270a0ea3e7468903f02` | `184467440737095517909` |
   | 2 BTC SL, long | `0xbedbbaeeedd754a44d5ef98c0caa85179cb4b4148d3d6c5e9e0b3eb39b8e52fa` | `3099053004383204677666` |
   | 3 BTC SL, short | `0x14e90e4546a4de4555b2fb2b8e53a1fdbdc07e5d4cc98761ff0e6b69ffb50a50` | `2656331146614175437941` |
   | 4 ETH TP, long | `0xecb17124db7aaaf6b947a08f188b50552be685ffe86d37575f879e3a8431fce3` | `3006819284014656919237` |
   | 5 BTC TP, short | `0xfc07f09eb6cbb7f41149c8a8f5309b14afcf17ec5b72b0012d4f04da9d7b9b1e` | `5773830895071089660971` |
   | 6 SOL TP, short | `0x1306ee02d6b293f81edb8d7af131af880f6dce95989fbc1f7df21dbc788ebb12` | `498062089990157895718` |
   | 7 ETH TP, short | `0x78d37ece38b4489880d2fcf154df5170b35bc66332adecf020bcf3e41443c329` | `1199038364791120860832` |
3. Every `ReduceOnlyBelowMinQty` drop: `node evidence/28/dr3_scan.mjs`. It reads all indexer `StopOrder` rows with
   `dropReason = 3`, finds each one's `PendingOrderTriggered` log on chain, and reads position, capacity and pool
   minimum at the parent block.
4. Partial placements: `node evidence/28/partial_scan.mjs 1000`. For the newest 1,000 `TRIGGERED` stops it compares the
   placed `Order.fullQuantity` with `min(quantity, |position|)` at the parent block.
5. Stops that would fire short right now: `node evidence/28/pending_scan.mjs`. It checks every `PENDING` stop on the 21
   perp registries against `getReducingCapacity(owner)`, all at one pinned block.
6. Implementations: `node evidence/28/impl_check.mjs`. It reads the EIP-1967 beacon slot and `implementation()` of the
   NEAR, BTC, ETH and SOL registries and pools at each case's parent block and at head. It also counts the
   `getReducingCapacity` selector in the registry implementation's bytecode.
7. Case 1 aftermath: `node evidence/28/after_case1.mjs`.
8. Docs and SDK text:
   - Fetch `https://app.dreamdex.io/docs/trading/perps-testnet/orders.md`, `…/margin-and-liquidations.md`,
     `https://app.dreamdex.io/docs/developers/perps-testnet/README.md` and `https://app.dreamdex.io/llms-full.txt`.
   - Read `@somnia-chain/markets-sdk` 0.32.1 as text (`npm pack`): `dist/trade.d.ts` 1404–1411,
     `dist/perp/stops.d.ts` 8–18 and 86–94, `dist/gql/graphql.d.ts` 2373–2384, and `docs/PERPS.md` 142–144, 255–258
     and 445–448.
9. Live check for the team (we sent no transaction):
   - Open a BTC-PERP long of size `q`.
   - Place a GTC limit sell of `q` about 3% above the mark.
   - Arm a reduce-only MARKET stop-loss for `q` a little below the mark, either with the app's TP/SL on the position or
     with `trader.placePerpStopOrder({ registry, pool, isBid: false, quantity: q, triggerPrice, triggerOperator: 1, stopOrderType: 1 })`.
   - When the mark crosses, `client.listPerpStopOrders({ account, status: ["TRIGGER_FAILED"] })` shows
     `dropReason: "ReduceOnlyBelowMinQty"` and the long is unchanged.
   - With a `q/2` resting sell instead, the stop shows `TRIGGERED` and only `q/2` closes.

## Expected
One of these two:
- A reduce-only TP/SL for `q` on a position of at least `q` closes `q` when it fires, as the Orders page describes,
  whatever limit orders the owner has resting away from the market. A reduce-only order of `min(q, |position|)`
  cannot open or flip the position.
- If resting closing-side orders are meant to reserve part of the position against stops, the Orders page and the SDK
  say so. The registry then reports the shortfall, a partial placement is distinguishable from a full one, and a stop
  that places nothing gets a reason that names the cause. Today it gets "what remained was below the pool's minimum"
  on a position up to 3,240x that minimum.

## Actual
Run 2026-10-26 07:52–07:56 UTC (`evidence/28/out_case*.txt`). In every case the placed size equals
`effectiveReducingCapacity` and is smaller than `min(stop quantity, |position|)`:

| case | UTC / block | stop | position before | owner's resting orders (closing side) | capacity | placed | reported | position after |
|---|---|---|---|---|---|---|---|---|
| 1 NEAR SL | 10-25 18:23:25 / 33,004,739 | sell 4,617.7 at mark ≤ 4.60 (mark 4.59989) | +4,617.7 | ask 2,434.1 @ 4.80 | 2,183.6 | 2,183.6, filled | `success=true`, `TRIGGERED` | +2,434.1 |
| 2 BTC SL | 10-22 13:14:00 / 30,228,282 | sell 0.01554 at ≤ 81,500 (mark 81,499.63) | +0.01554 (119.5x min) | ask 0.09811 @ 82,400 | 0 | nothing | `dropReason 3`, `TRIGGER_FAILED` | +0.01554 |
| 3 BTC SL | 10-21 01:49:15 / 28,954,337 | buy 0.01816 at ≥ 83,000 (mark 83,012.42) | −0.01816 (139.7x min) | bids 0.00844 + 0.04918 @ 81,000 | 0 | nothing | `dropReason 3`, `TRIGGER_FAILED` | −0.01816 |
| 4 ETH TP | 10-23 14:36:45 / 31,141,418 | sell 4.2874 at ≥ 2,400 (mark 2,400.85) | +4.2874 | ask 2.9455 @ 2,540.02 | 1.3419 | 1.3419, filled | `success=true`, `TRIGGERED` | +2.9455 |
| 5 BTC TP | 10-23 22:53:50 / 31,439,576 | buy 0.00608 at ≤ 80,537.4 (mark 80,504.93) | −0.01496 (46.8x min for 0.00608) | bids 1.54068 + 0.6 @ 500 | 0 | nothing | `dropReason 3`, `TRIGGER_FAILED` | −0.01496 |
| 6 SOL TP | 10-23 22:31:50 / 31,426,380 | buy 1.2 at ≤ 103 (mark 102.995) | −0.98 | bid 0.24 @ 103 | 0.74 | 0.74, filled | `success=true`, `TRIGGERED` | −0.24 |
| 7 ETH TP | 10-22 23:36:10 / 30,601,342 | buy 0.0042 at ≤ 2,378.23 (mark 2,378.14) | −0.0042 (1.05x min) | bid 15.1188 @ 2,348 | 0 | nothing | `dropReason 3`, `TRIGGER_FAILED` | −0.0042 |

In all 7 cases:
- The stop held `somiPaid` 0.15 and is no longer live after the fire.
- Intent was 0 (reduce-only) and order type 1 (MARKET).
- The stop was created by `execTransaction` (`0x6a761202`) on the owner's Safe account.
- In cases 2 and 5 the stop was one leg of a linked pair. The sibling got `PendingOrderUnlinked` and stayed live, so
  each of those positions was left with only the other leg.

Pool minimums: NEAR 5.1, BTC 0.00013, ETH 0.004, SOL 0.1.

Case 1 output (`evidence/28/out_case1_near_sl.txt`):
```
stop: sell 4617.7 when mark LTE 4.6, orderType 1, intent 0, sibling 0
parent block 33004738: mark 4.5998906211095, position 4617.7, pool minQuantity 5.1
getReducingCapacity(owner): { "positionSize": "4617.7", "pendingBidQuantity": "0", "pendingAskQuantity": "2434.1", "pendingOppositeQuantity": "2434.1", "effectiveReducingCapacity": "2183.6" }
owner's resting orders: ask 2434.1 @ 4.8
PendingOrderTriggered: success=true dropReason=0 (None) placedOrderId=110680464442267059879
placed: ask 2183.6 @ 4.3699, filled 2183.6 in 4 fills
min(stop qty, |position|) = 4617.7 (905.43x pool minimum); placed = 2183.6; capacity = 2183.6; placed == capacity: true
position after: 2434.1; stop still live after: false; indexer: TRIGGERED dropReason null
```
Raw RPC, run 07:55:36 UTC (`evidence/28/out_case1_raw_rpc.txt`):
- `getReducingCapacity` at `0x1f79cc2` decodes to `[4617.7e24, 0, 2434.1e24, 2434.1e24, 2183.6e24]`.
- `getPosition.size` is `4617.7e24` at `0x1f79cc2` and `2434.1e24` at `0x1f79cc3`.
- Receipt log 30 (registry `0xf3a51c26…076e`): topic1 = stop `184467440737095517909`, topic2 = placed order
  `110680464442267059879`, data `[1, 0]` (success, dropReason 0).

Aftermath of case 1 (`evidence/28/out_after_case1.txt`):
```
2026-10-25T20:00:00Z block 33062668: mark 4.5674529626935, position 2434.1
2026-10-26T00:00:00Z block 33206611: mark 4.587588961259, position 2434.1
2026-10-26T02:23:00Z block 33292376: mark 4.4782532335435, position 2434.1
position changed from 2434.1 to 0 at block 33313569 (2026-10-26T02:58:20.000Z), mark 4.455818291998
stop 534955578137576998614: sell 4617.7 GTE 4.75 -> CANCELLED (Owner), created 2026-10-25T17:43:07.000Z, updated 2026-10-26T02:58:22.000Z
```

**All `ReduceOnlyBelowMinQty` drops** (`evidence/28/out_dr3_scan.txt`, run 07:57 UTC, indexer at block 33,492,943):
```
SUMMARY rows 25, located on chain 25; event dropReason 3: 25; position open on the stop's closing side: 25; effectiveReducingCapacity 0: 25; resting closing-side orders >= |position|: 25; position unchanged after: 25; SL 7 / TP 18; min(qty,|pos|)/minQuantity from 1.05x to 3239.85x; first 2026-10-12T16:26:07.000Z, last 2026-10-23T22:53:50.000Z
```
So in the indexer's whole history, reason 3 has never meant a dust position. All 25 drops are stops cancelled by the
owner's own resting orders, across ETH, BTC, SOL, LINK and NEAR.

**Partial placements** (`evidence/28/out_partial_scan.txt`, run 07:59 UTC). This covers the newest 1,000 `TRIGGERED`
stops, 2026-10-22 09:00:45 to 2026-10-26 06:27:00 UTC.
- Exactly 3 placed less than `min(quantity, |position|)`: cases 1, 4 and 6.
- In all 3 the placed size equals `effectiveReducingCapacity`.
- In the other 997 the placed size was not below `min(quantity, |position|)`.
- In the same period 3 more stops were dropped with reason 3: cases 2, 5 and 7.

**Stops that would fire short today** (`evidence/28/out_pending_scan.txt`, block 33,501,406, 08:11:31 UTC):
```
SUMMARY pinned block 33501406: 631 PENDING stops; 430 fixed-size stops on the closing side of an open position; 5 of them (2 accounts, 4 SL / 1 TP) have capacity below min(qty, |position|); 4 would place nothing.
```
- Four of them are BTC stop-losses on the 0.01496 BTC short of case 5's owner `0xe72f3513…b90c`:
  - `4796153459164483425322`: buy 0.00608 at ≥ 85,474.1
  - `5460236245818027284052`: buy 0.00027 at ≥ 85,275
  - `6105872288397861591030`: buy 0.00121 at ≥ 83,166.3
  - `1420399293675635480568`: buy 0.00242 at ≥ 83,166.3

  Capacity is 0 because of the same 2.14068 BTC of bids at $500.
- The fifth is an ETH take-profit, `2877692075498690058019`: sell 3.7247 on case 4's owner's 4.1332 long. It would
  close only 1.1877, because the same 2.9455 ask at 2,540.02 is still resting.
- Quantity-0 ("whole position") stops are not counted. The 50 such stops on the closing side all have capacity ≥
  |position|, so their behaviour cannot be shown here.

**Current code** (`evidence/28/out_impl_check.txt`, head 33,492,150 at 07:56:05 UTC):
- Registry beacon `0x06683223b403374cb58c135b87b0f81ef0fd18f0` → `0x8d7FcDfC6D043B0296Ccf84D82f9dbe2c701096E` at the
  parent blocks of cases 1, 2, 4, 5, 6 and 7 and at head. This covers the NEAR, BTC, ETH and SOL registries.
- Perp pool beacon `0xb787f7d2f87d32c1505c110c4457ed36a3f6b002` → `0x81F9EB88C95a52B4D3eA47A73ac394b8A547d443` at the
  same blocks.
- Case 3 ran on the previous implementations (`0x1A483b48…d086` / `0x772e9B72…521D`), so the behaviour predates the
  2026-10-21 upgrade.
- Both registry implementations contain the `getReducingCapacity(address)` selector `2809c6ee` twice.

**Docs and SDK** (`evidence/28/docs_grep.txt`, pages fetched 08:08:20 UTC; `evidence/28/sdk_grep.txt`):
- The live Orders page's TP/SL section, quoted above, is the whole description of perp TP/SL. It says nothing about
  resting orders.
- `llms-full.txt` (438,288 bytes) has 0 matches for `PerpStopOrderRegistry`, `getReducingCapacity`,
  `effectiveReducingCapacity`, `reducing capacity`, `ReduceOnlyBelowMinQty` and `dropReason`.
- None of its 29 lines with "resting order" is about TP/SL.
- In SDK 0.32.1 (tarball sha512 equals `dist.integrity`; npm `latest` is 0.32.1), the stop module and the stop sections
  of the docs never mention resting orders or capacity. Every mention of reducing capacity is about plain orders and
  the collateral lock.

## Evidence
All files are in `evidence/28/`:
- `stop_case.mjs`, with `out_case1_near_sl.txt`, `out_case2_btc_sl_long.txt`, `out_case3_btc_sl_short.txt`,
  `out_case4_eth_tp.txt`, `out_case5_btc_tp_short.txt`, `out_case6_sol_tp_short.txt` and `out_case7_eth_tp_short.txt`.
  Each output has a short summary followed by the full JSON.
- `req_case1_capacity_parent.json`, `req_case1_position_parent.json`, `req_case1_position_after.json`,
  `req_case1_receipt.json` → `out_case1_raw_rpc.txt`: the pinned raw calls of step 1.
- `after_case1.mjs` → `out_after_case1.txt`: the position the stop left open, until it closed.
- `dr3_scan.mjs` → `out_dr3_scan.txt`, `out_dr3_scan.jsonl`: all 25 reason-3 drops, one row each, with tx, block,
  position, capacity, resting quantity and minimum.
- `partial_scan.mjs` → `out_partial_scan.txt`, `out_partial_scan.jsonl`: the newest 1,000 triggered stops.
- `pending_scan.mjs` → `out_pending_scan.txt`, `out_pending_scan.jsonl`: the 631 pending stops at block 33,501,406.
- `impl_check.mjs` → `out_impl_check.txt`: the beacon implementations per block, and the selector count in the registry
  bytecode.
- `docs_grep.txt` and `docs_fetch_time.txt`, with the fetched pages `docs_trading_perps-testnet_orders.md`,
  `docs_trading_perps-testnet_margin-and-liquidations.md`, `docs_developers_perps-testnet_README.md` and
  `docs_llms-full.txt.gz`.
- `sdk_grep.txt`: the quoted SDK 0.32.1 lines, the tarball integrity, and the capacity and resting-order searches.

## Suggested fix
1. **Registry.** At trigger, size a reduce-only stop by `min(quantity, |position|)`, and by `|position|` for the 0
   sentinel. Do not size it by `effectiveReducingCapacity`. Such an order can only shrink the position. If a resting
   closing-side order later fills against a smaller position, the pool can treat that fill's excess like any other
   increasing order, as it already does for a plain close larger than the capacity (`PERPS.md:255–258`).
   Alternatively, when the stop fires, cancel or shrink the owner's resting closing-side orders by the amount the stop
   needs.
2. **If the current sizing is intended.**
   - Give the case its own drop reason, for example "capacity reserved by your resting orders", instead of
     `ReduceOnlyBelowMinQty`.
   - Carry the requested and placed sizes in `PendingOrderTriggered`, so a partial stop is visible.
   - Warn or refuse at creation when the owner's resting closing-side orders already cover the position.
3. **Docs and SDK.**
   - On the perps Orders page, say that resting limit orders on the closing side reduce what a TP/SL can close, and can
     cancel it entirely.
   - In `PerpStopOrderLeg.quantity`, say what "clamped DOWN" clamps to.
   - Correct the `ReduceOnlyBelowMinQty` text in `PERP_STOP_DROP_REASON`, `PerpStopOrder.dropReason`, the GraphQL enum
     doc and `PERPS.md:445–447`. Today it says "what remained was below the pool's minimum" and calls it ordinary.
   - Add perps to the "My stop or take-profit did not work" page.

## Environment
- Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and SDK), RPC `https://api.hideki2.infra.testnet.somnia.network`,
  indexer `https://hideki-dev.smk.somnia.host/v1/graphql`
- Stop registries: NEAR `0xf3a51c26ead3f84c2221336484bb42b8cfca076e`, BTC `0x52e2ccebaec9332672c247e9a90aa3d61fb615ef`,
  ETH `0x44bfa5b28684e8d2156d15b85902da18f02b3a34`, SOL `0x85a0879d19777c343eb317a890d5058ab92b8f5d`. Implementation
  `0x8d7FcDfC6D043B0296Ccf84D82f9dbe2c701096E` (beacon `0x06683223…18f0`).
- Perp pools: NEAR `0x1cD15ae8bFf0FE0a7F49233BE8b90734775bA454`, BTC `0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0`,
  ETH `0xD6Cb1DD58580B84D76068aC21594219ce03aeddf`, SOL `0xB483ec1fb34996638677c20ab087b16F1896FA53`. Implementation
  `0x81F9EB88C95a52B4D3eA47A73ac394b8A547d443` (beacon `0xb787…b002`). MarginBank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394`.
- `@somnia-chain/markets-sdk` 0.32.1 (npm `latest`; source read as text from the tarball, nothing executed); viem
  2.57.7 for our own read-only scripts
- Docs: `https://app.dreamdex.io/docs/trading/perps-testnet/orders.md`, `…/margin-and-liquidations.md`,
  `/docs/developers/perps-testnet/README.md`, `/llms-full.txt`, fetched 2026-10-26 08:08:20 UTC
- Date: 2026-10-26, 07:52–08:12 UTC. Historical reads at blocks 21,713,067 to 33,313,667 (2026-10-12 to 2026-10-26).
- Wallet: none of ours. All positions, stops and orders shown belong to other accounts. Every call is a read, with
  nothing signed and no state overrides.
