# Docs: the WebSocket `order` channel sends no `order:snapshot` and no `order` object or `status` (frames are flat `event` updates), so the documented tracking flow never sees a terminal `order.status`, and an older open order gets no frame at all
Severity: normal
Area: docs

> **Summary.** The Real-Time Feed page and Quick Start (Option C) describe the `order` channel like this. On subscribe, the
> client first gets an `order:snapshot` with the order's current state. After that it gets `order:update` frames, and each
> one carries the full `order {id, market, side, price, quantity, filled, status, createdAt, updatedAt}`. A tracker stops
> when `order.status` reaches `filled` or `cancelled`. Neither testnet host sends anything like that. The frames are flat
> lifecycle events (`event: placed | rested | filled | cancelled`), with no snapshot, no `order` object and no `status`
> field. On subscribe the hosts replay only recent events. So an order that is open on chain but was placed earlier than
> that gets `subscribed` and then nothing, which is exactly what an order id that does not exist gets.

> **Checked 2026-10-26, 03:09–04:40 UTC, Somnia Shannon testnet (chain 50312), SOMI:USDso.** We re-fetched both docs pages
> and both hosts' AsyncAPI specs at 04:35 UTC. Their sha256 hashes match the 03:03 UTC copies. Fresh orders, in three
> separate runs (03:09, 04:14, 04:33 UTC) on both hosts: 0 `snapshot` frames, 0 frames with an `order` object, 0 frames
> with a `status`. Old open orders, in three runs (04:15, 04:16, 04:34 UTC) on both hosts: `subscribed`, then 0 frames.
> Evidence: `evidence/26/fresh_stg_2026-10-26T0433Z.txt`, `evidence/26/old_orders_stg_2026-10-26T0434Z.txt`, and the
> api.testnet copies of both.

**Distinct from report 27 (the docs' `order` subscribe examples):** that report covers the request. The docs' subscribe frames
(hex `orderId`, or no `symbol`) are rejected with `subscription_failed`. This report covers what comes back after a
subscribe that is accepted (`symbol` plus a decimal `orderId`): the frame format, the missing snapshot and the replay
window. The text is different and so is the fix.

What the docs say (`https://app.dreamdex.io/docs/developers/websocket-api/real-time-feed.md`, sha256 `b0ce3186…`):

- Order Lifecycle Tracking, step 3 (line 40): "**Consume `order:update` events** until the order reaches a terminal
  `order.status` of `filled` or `cancelled` (an expired order surfaces as `cancelled`)."
- `order:snapshot` (lines 558–581): "Sends the current state of a specific order immediately after a client subscribes to
  the order channel. Contains full order details including filled quantity and current status." Required fields:
  `type: "snapshot"` and `order.id`, `order.market`, `order.side`, `order.price`, `order.quantity`, `order.filled`,
  `order.status` (`"open"`, `"partial"`, `"filled"`, `"cancelled"`), `order.createdAt`, `order.updatedAt`.
- `order:update` (lines 604–625): "The update contains the complete current order state, not just the changes." It has the
  same required `order {…}` object.

Quick Start, "5. Track Your Order", Option C (`https://app.dreamdex.io/docs/welcome/quick-start.md`, lines 365–377): "You
will receive a snapshot of the current order state followed by real-time updates as the order fills or is cancelled."

No docs page mentions a replay window or the `event` field, and none links the hosts' AsyncAPI specs. The live
`https://app.dreamdex.io/llms-full.txt` (04:39 UTC) has 0 matches for `well-known`, `async.json`, `ten minutes`,
`10 minutes` and `"rested"`. Its one `replay` match is the reconnect warning ("There is no way to replay messages missed
while disconnected").

The page's reconnect section does say that only `orderbook`, `ohlcv` and `trades` resnapshot, and that open orders should
be re-read over REST after a disconnect. That text is about reconnects. The `order:snapshot` section and Quick Start still
promise a snapshot on every subscribe, and the frame format is wrong for fresh orders too.

## Steps to reproduce
Needs Node >= 22 (global `WebSocket`) and viem. Read-only, no key. Run from a folder where `viem` resolves (we used 2.57.7).

1. Fresh orders: `node evidence/26/vr_order.mjs wss://stg.api.dreamdex.io/v0/ws/public 20 fresh`. The script takes the 2
   newest `OrderRested(uint128)` ids from the last 300 blocks on the SOMI:USDso SpotPool
   `0x259fD6559214dd5aD3752322426eA9F9fABEFff4` (Shannon RPC `https://api.infra.testnet.somnia.network`) and subscribes to
   each one. It logs every frame for 20 s, then prints a `SUMMARY` with counts of `type: "snapshot"` frames, frames with an
   `order` object and frames with a `status`. Repeat with `wss://api.testnet.dreamdex.io/v0/ws`. The script also sends
   the docs' request shapes, which are rejected (see report 27). The frames counted here come from
   `{"symbol":"SOMI:USDso","orderId":"<decimal id>"}`, which both hosts accept.
2. Old open orders: `node evidence/26/vr_chain.mjs open` lists the open bids on the same pool that expire more than 1 h from
   now (`getAllOpenOrdersOffChain(true, 300, 0)`). The list includes `959230691832913713755` and `1199038364791142869051`.
   `node evidence/26/vr_chain.mjs get 959230691832913713755 1199038364791142869051 1` confirms both are open and that
   `getOrder(1)` reverts. `node evidence/26/vr_chain.mjs hist <id> 20000` finds no event for either order in the last 20,000
   blocks (about 33 min).
3. On both hosts, run `node evidence/26/vr_order.mjs <wsUrl> 25 ids 959230691832913713755 1199038364791142869051 <fresh id from step 1> 1`.
   The fresh id is the positive control in the same connection.

## Expected
Either the hosts send what the docs describe (an `order:snapshot` with the current `order {…status}` on every subscribe,
then `order:update` frames with the full order), or the docs describe what the hosts send: the `event` values and the
fields of each event, which event ends the order, the replay window on subscribe, and the fact that an order older than
the window gets no frame. In that case its state has to come from REST (`GET /markets/{symbol}/orders/{orderId}`) or
`getOrder`.

## Actual
Fresh orders, 04:33 UTC. `stg` is the docs' testnet feed. The order is `1254378597012275048430`: placed and rested in block
524149897 (tx `0xe2364d3d0818ca7e48a204d054f0a3eee48c2c457e91c853b46cb7d34b4cfda8`, 04:33:11 UTC), cancelled in block
524149985.

```
stg 04:33:19Z
{"channel":"order","type":"subscribed","symbol":"SOMI:USDso","orderId":"1254378597012275048430"}
{"channel":"order","type":"update","orderId":"1254378597012275048430","event":"placed","timestamp":1792989191572,"block":524149897,"isBid":false,"price":"176100000000000000","quantity":"750400000000000000000","remaining":"750400000000000000000","expiresAt":1792989221000}
{"channel":"order","type":"update","orderId":"1254378597012275048430","event":"rested","timestamp":1792989191572,"block":524149897}
{"channel":"order","type":"update","orderId":"1254378597012275048430","event":"cancelled","timestamp":1792989200371,"block":524149985}

api.testnet 04:33:19Z
{"type":"subscribed","channel":"order","symbol":"SOMI:USDso","orderId":"1254378597012275048430"}
{"channel":"order","type":"update","symbol":"SOMI:USDso","kind":"spot","contract":"0x259fd6559214dd5ad3752322426ea9f9fabefff4","orderId":"1254378597012275048430","event":"placed","timestamp":1792989191000,"isBid":false,"price":"0.1761","quantity":"750.4","remaining":"750.4","expiresAt":1792989221000,"block":524149897}
{"channel":"order","type":"update","symbol":"SOMI:USDso","kind":"spot","contract":"0x259fd6559214dd5ad3752322426ea9f9fabefff4","orderId":"1254378597012275048430","event":"cancelled","timestamp":1792989200000,"isBid":false,"price":"0.1761","quantity":"750.4","remaining":"750.4","expiresAt":1792989221000,"block":524149985}
```

| run (UTC) | host | `type: "snapshot"` frames | frames with `order` object | frames with `status` | events seen |
|---|---|---|---|---|---|
| 03:09 | stg | 0 | 0 | 0 | `922337203685503111888`: placed, rested, filled, filled, cancelled |
| 03:09 | api.testnet | 0 | 0 | 0 | `977677435906631766794`: placed, cancelled |
| 04:14 | stg | 0 | 0 | 0 | `1420399293675661011436`: placed, rested, filled, filled, cancelled |
| 04:14 | api.testnet | 0 | 0 | 0 | same order: placed, filled, filled, cancelled |
| 04:33 | stg | 0 | 0 | 0 | `1254378597012275048430` and `922337203685503119343`: placed, rested, cancelled |
| 04:33 | api.testnet | 0 | 0 | 0 | same orders: placed, cancelled |

On api.testnet, `{symbol, decimal id}` and `{symbol, hex id}` were both accepted for the same order. Each event therefore
arrived once per subscription. The table lists each event once.

Old open orders, 04:34 UTC, with the chain read at 04:33:53 UTC (block 524150305). Each subscribe got `subscribed`, and the
connection stayed open for at least 21 s after it.

| order id | on chain | stg | api.testnet |
|---|---|---|---|
| `959230691832913713755` | open bid. `getOrder`: `quantityRemaining` = `fullQuantity` = 413.6e18, `expireTimestampNs` 3364550541000000000 (year 2076). No event in blocks 524130923–524150923 (04:01–04:34 UTC) | `subscribed`, then 0 frames | `subscribed`, then 0 frames |
| `1199038364791142869051` | open bid, 1025e18 of 1025e18 remaining, expiry 2076. No event in the last 20,000 blocks | `subscribed`, then 0 frames | `subscribed`, then 0 frames |
| `1254378597012275048430` (control, same connection) | placed 04:33:11, cancelled block 524149985 | placed, rested, cancelled | placed, cancelled |
| `1` | `getOrder(1)` reverts | `subscribed`, then 0 frames | `subscribed`, then 0 frames |

The same result came at 04:15 UTC (for `959230691832913713755` and `1`) and at 04:16 UTC (both old orders, 28 s wait) (`evidence/26/earlier_0414Z_old_fresh_one_*.txt`, `evidence/26/earlier_0414Z_old2_*.txt`).

What this means for a client built from the docs:

1. **The tracking flow cannot finish.** `order.status` never exists, so step 3 ("until the order reaches a terminal
   `order.status`") never ends, and `type: "snapshot"` never arrives. The official bot kit shows this. In
   `somnia-chain/dreamdex-bot-kit` (`main` = `25798660`; file `examples/05-production-async/src/dreamdex_bot/core/ws_client.py`,
   last changed in commit `a327454866e9457cd835b6b1654e8d180e9af892`), `_dispatch` documents the frame as
   `{"channel": "order", "type": "update", "order": {...}}` (line 250). It routes an order frame to the per-order handler
   only `elif channel == "order" and isinstance(msg.get("order"), dict)` (lines 269–273). With the real flat frames,
   `msg["order"]` is absent, so handlers registered with `subscribe_order` (lines 86–100, key `order.{order_id}`) are
   never called.
2. **Older orders return nothing.** Without the documented snapshot, the WebSocket cannot give the state of an order that
   was placed before the replay window. An order that has been resting for half an hour and an id that never existed
   both produce `subscribed` and then silence, with no error.

The hosts' own AsyncAPI specs (not linked from the docs) describe event frames, and they also disagree with each other:

- `https://api.testnet.dreamdex.io/.well-known/async.json` (sha256 `35269d6f…`), `OrderUpdate`: "On subscribe the last ten
  minutes of the order's events are replayed (no separate snapshot); each update carries only the event-specific fields".
  Also: "The replay on subscribe covers the last ten minutes, so an older placement is not replayed" and "OrderRested and
  OrderCancelledPreFill produce no OrderUpdate frame". api.testnet behaves as this spec says.
- `https://stg.api.dreamdex.io/.well-known/async.json` (sha256 `04778aa3…`), `OrderUpdate`: "On subscribe, the order's full
  event history is replayed as a sequence of these updates", with `event` enum `placed`, `reduced`, `filled`,
  `cancelled`, `expired`. stg does not match this spec either. It replays nothing for the two old orders, and it sends a
  `rested` event that is not in its own enum.

## Evidence
- `evidence/26/fresh_stg_2026-10-26T0433Z.txt`, `evidence/26/fresh_apitestnet_2026-10-26T0433Z.txt`: every frame with UTC
  times, plus the per-order summaries.
- `evidence/26/old_orders_stg_2026-10-26T0434Z.txt`, `evidence/26/old_orders_apitestnet_2026-10-26T0434Z.txt`: the old orders,
  the control and id `1`.
- `evidence/26/chain_open_2026-10-26T0433Z.txt`, `evidence/26/chain_getorder_2026-10-26T0433Z.txt`,
  `evidence/26/chain_hist_2026-10-26T0434Z.txt`: open-order list, `getOrder` reads (and the `getOrder(1)` revert), and the
  20,000-block event search with the positive control and the timestamp of the window start.
- `evidence/26/earlier_0309Z_order_channel_{stg,apitestnet}.txt` and `evidence/26/earlier_0414Z_*.txt`: the earlier runs in the
  tables above.
- `evidence/26/docs_real-time-feed_2026-10-26T0435Z.md`, `evidence/26/docs_quick-start_2026-10-26T0435Z.md`,
  `evidence/26/spec_stg_async_2026-10-26T0435Z.json`, `evidence/26/spec_apitestnet_async_2026-10-26T0435Z.json`,
  `evidence/26/sha256_2026-10-26T0435Z.txt`: pages and specs as served. `evidence/26/llms_full_grep_2026-10-26T0439Z.txt`:
  the match counts quoted above.
- `evidence/26/botkit_ws_client_a327454866e9457cd835b6b1654e8d180e9af892.py`: the bot kit file at that commit.
- Scripts: `evidence/26/vr_order.mjs`, `evidence/26/vr_chain.mjs`.

## Suggested fix
Rewrite the `order:snapshot` and `order:update` sections, the Order Lifecycle Tracking steps and Quick Start Option C to
match the frames the hosts send. Cover the `event` values per host (including stg's `rested`), the fields each event
carries, which events end an order, and the replay window on subscribe (10 minutes on api.testnet). State that an order
older than the window gets no frame, so its current state must come from REST or `getOrder` before subscribing. Either
make stg replay what its spec says or correct the stg spec, and link the AsyncAPI specs from the WebSocket pages. If a
snapshot on subscribe is the intended behaviour, send it: one frame with the order's current state would cover orders
older than the window, and it would let a client tell an unknown id apart from a quiet order. Update the bot kit's
`_dispatch` to match whichever format is kept.

## Environment
- Network: Somnia Shannon testnet, chain id 50312 (`eth_chainId` `0xc488` on `https://api.infra.testnet.somnia.network`).
  The Real-Time Feed page lists this network for its testnet feed ("Testnet (Somnia Shannon)"). The api.testnet spec's
  `OrderParams.chainId` says "Defaults to 50312, the only chain this deployment serves". We found no dreamDEX order feed
  for Somnia Tokyo (50383): its node WebSocket `wss://api.hideki2.infra.testnet.somnia.network/ws` answers the same
  subscribe frame with JSON-RPC `-32600 invalid request` (`evidence/26/hideki_ws_probe_2026-10-26T0440Z.txt`).
- WebSocket hosts: `wss://stg.api.dreamdex.io/v0/ws/public` (the docs' testnet feed) and `wss://api.testnet.dreamdex.io/v0/ws`
  (the testnet server in its `/.well-known/async.json`)
- Market: SOMI:USDso SpotPool `0x259fD6559214dd5aD3752322426eA9F9fABEFff4`
- Node 22.22.1 (global `WebSocket`), viem 2.57.7
- Date: 2026-10-26, 03:09–04:40 UTC
- Wallet: n/a (read-only, no key)
