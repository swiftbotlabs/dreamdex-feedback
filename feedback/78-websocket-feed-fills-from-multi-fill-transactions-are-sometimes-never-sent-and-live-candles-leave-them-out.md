# WebSocket feed (mainnet): when one transaction makes more than one fill, the public `trades` channel sometimes sends only some of them, and the `ohlcv` stream builds its candle without the lost fill. A client that stays connected keeps a different candle from REST, and from a client that subscribes a minute later
Severity: major
Area: API (WebSocket feed)

> **Summary.** The docs send integrators to the WebSocket feed for "Live order book / trades / candles". We recorded the
> mainnet feed (`wss://api.dreamdex.io/v0/ws/public`, all four spot pairs) for 65 minutes (11:55–13:01 UTC), with a second connection open in parallel for 18 of them, and
> compared every `trades:update` with the chain's fills (indexer `Fill` rows, one per `OrderFilled` event). Every
> transaction with a single fill reached the feed (21 of 21). Transactions with two or more fills are a SpotRouter swap
> through two pools or a taker crossing two price levels. In 5 of 26 such transactions, a fill was never sent (6 of their 52 fills).
> In 4 of those 5, the feed did send the transaction's other fill. Nothing else went missing, and the feed sent no trade we could not
> match to a fill.
>
> The `ohlcv` stream follows the same trades. It leaves the lost fill out of the candle, and later updates for
> that minute leave it out too. So a connected client ends the minute with the wrong volume, and sometimes the wrong high
> or low. Example: SOMI:USDso 12:19 shows volume 39.33 on the live stream and 419.18 on REST `/candles`. A client
> that subscribes later gets the correct candle in its `ohlcv:snapshot`. The feed's own recent-trades snapshot still
> lacks the fill. Two connections open at the same time lost the same fills, so the loss happens on the server.
>
> Also (item 2): one connection accepts only 32 subscriptions. The 33rd fails with the generic `subscription_failed`,
> which the docs describe as rejected parameters. The docs tell makers to subscribe once per resting order.
>
> **Checked 2026-11-03, 11:55–13:09 UTC**, read-only, on mainnet; Shannon testnet as a control. Evidence: `evidence/78/`.

## Steps to reproduce
1. Record the feed (Node 22+, no dependencies) for 30 minutes or more. Mainnet has ~18 SpotRouter swaps an hour
   (SOMI ↔ USDC.e) and a few multi-level WBTC/WETH takers:
   ```sh
   node evidence/78/ws_capture.mjs 30 cap
   ```
2. Compare every fill in that window with what the feed sent, and the last live candle of each minute with REST
   (Python standard library):
   ```sh
   python3 evidence/78/ws_vs_fills.py cap.jsonl mainnet
   ```
   Fills the feed never sent are marked `NOT SENT ON THE FEED`. Candles that differ from REST are marked `<-- differs`.
3. Item 2, the subscription limit (any order ids will do):
   ```sh
   node evidence/78/ws_subscription_cap.mjs api.dreamdex.io   # or stg.api.dreamdex.io
   ```

## Expected
- Real-Time Feed, `trades:update`: "Sends a trade notification when an order is filled. Each update contains a single
  trade with its price, quantity, and aggressor side." `ohlcv:update`: "Sends a new or updated candlestick as trading
  occurs."
- Trading → Spot, order lifecycle table: "Matches | `OrderFilled` | One event per fill leg". Its worked example: "PTP fills
  `0.4 WETH` at `2,500.00` (best price), then `0.6 WETH` at `2,501.00` - two `OrderFilled` legs."
- Developers → "Choosing between REST and WebSocket": "Live order book / trades / candles | WebSocket | Server pushes a
  snapshot then deltas".

The docs do warn that "a silent mid-stream gap is indistinguishable from a quiet market". That warning is about missed
frames around disconnects. Here the connection never dropped: no close until we closed it at the end, never more than 8.7 s between
frames, and the other fill of the same transaction arrived. And the server's own candle and trade store miss the fill too.

## Actual
**1. Fills not sent**

| transaction shape | transactions | fills | fills not sent | transactions with a fill not sent |
|---|---|---|---|---|
| one fill | 21 | 21 | 0 | 0 |
| several fills | 3 | 6 | 1 | 1 |
| two pools | 23 | 46 | 5 | 4 |

Every fill the feed did not send (`ws_vs_fills_*.txt`):

| time (UTC) | market | fill | taker | tx (block, log) | shape | other fills of the tx | capture(s) |
|---|---|---|---|---|---|---|---|
| 12:02:41 | SOMI:USDso | 186.7 @ 0.1592 | buy | `0x28611c6a…` (455528918, 74) | two pools | USDC.e:USDso 29.73 @ 0.9998: sent | 1: not sent |
| 12:19:22 | SOMI:USDso | 379.85 @ 0.1611 | sell | `0x84aa326f…` (455538930, 243) | two pools | USDC.e:USDso 61.18 @ 1.0002: sent | 2: not sent |
| 12:27:48 | WBTC:USDso | 0.0013 @ 77297 | sell | `0xf1e4f3e2…` (455543985, 23) | several fills | WBTC:USDso 0.0007 @ 77253.5: sent | 2: not sent |
| 12:32:50 | SOMI:USDso | 367.28 @ 0.1622 | sell | `0xa9b2a87f…` (455547006, 149) | two pools | USDC.e:USDso 59.56 @ 1.0002: not sent | 2: not sent, 3: not sent |
| 12:32:50 | USDC.e:USDso | 59.56 @ 1.0002 | buy | `0xa9b2a87f…` (455547006, 155) | two pools | SOMI:USDso 367.28 @ 0.1622: not sent | 2: not sent, 3: not sent |
| 12:32:50 | SOMI:USDso | 203.37 @ 0.1623 | sell | `0x6463e44e…` (455547011, 47) | two pools | USDC.e:USDso 33 @ 1.0002: sent | 2: not sent, 3: not sent |

The candle for each of those minutes, as the live stream left it and as REST and a fresh snapshot give it:

| minute (UTC) | market | last live `ohlcv:update` (connection open the whole minute) | REST `/candles` | `ohlcv:snapshot` of a connection opened at 12:29:09 |
|---|---|---|---|---|
| 12:02 | SOMI:USDso | no update at all | vol 186.7, o/h/l/c 0.1592 | vol 186.7 |
| 12:19 | SOMI:USDso | vol **39.33**, o 0.1611 h 0.1615 l 0.1611 c 0.1615 | vol **419.18**, same o/h/l/c | vol 419.18 |
| 12:27 | WBTC:USDso | vol **0.0027**, o 77281.4 h **77281.4** l 77242.7 c 77253.5 | vol **0.004**, h **77297** | vol 0.004, h 77297 |
| 12:32 | SOMI:USDso | vol **19.54**, o **0.1623** h 0.1623 l **0.1623** c 0.1623 (both connections) | vol **590.19**, o 0.1622, l 0.1622 | (after the snapshot) |
| 12:32 | USDC.e:USDso | vol **36.17** (both connections) | vol **95.73** | (after the snapshot) |

- The feed's trade side matched the taker side on all 67 trades it did send, and its prices and quantities match the
  fills exactly. So the problem is only the fills it drops.
- Both connections lost the same fills: the 14 fills both captured had the same result on both, including the three lost at 12:32:50. Capture 3 subscribed at 12:29:09 UTC. Its `trades:snapshot`
  lists the 12:27:48 WBTC fill of 0.0007 (feed id `1793708868430-10`) but not the 0.0013 @ 77,297 fill from the same
  transaction. Its `ohlcv:snapshot` for 12:27 has high 77,297 and volume 0.004, the same as REST.
- Shannon testnet control (12 minutes, `ws_vs_fills_testnet_*.txt`): 168 fills in 168 single-fill transactions, and the
  feed sent all 168. Testnet had no multi-fill transaction in that window.
- Order books stayed right. We applied the `orderbook` updates locally and compared them with REST `/v0/orderbooks`
  every 20 s for the whole capture. Every difference was gone by the next comparison, because book updates carry absolute
  level quantities.

How often this can happen on mainnet: over the 24 hours to 12:40 UTC, 429 of 4,211 fill transactions touched two
pools (all SOMI ↔ USDC.e router swaps), and 143 more had several fills in one pool: 14% of all transactions (`multi_fill_txs_24h_*.txt`).

**2. One connection takes at most 32 subscriptions, and the 33rd fails with the error for bad parameters**

The Real-Time Feed page tells makers to track every resting order on the per-order `order` channel ("track each order you
place"; "Unsubscribe once terminal to free the subscription"). It gives no limit. On mainnet and on stg, a connection
accepts **32 subscriptions in total**. Market-data subscriptions count toward the 32: after 3 market-data subscriptions,
only 29 `order` subscriptions go through. Every later subscribe gets
`{"type":"error","errorName":"subscription_failed","message":"subscription failed to channel: order"}`. The Errors page
describes that error as "the channel is valid but params were rejected (missing field, unknown symbol, bad timeframe,
malformed `orderId`)", and nothing names the cap (`ws_subscription_cap_*.txt`; the script uses arbitrary order ids,
since the feed accepts a subscription for any decimal id). A grid or ladder bot with more than about 30 resting orders
cannot follow the documented pattern on one connection. When it tries, the error tells it its parameters are wrong.

## Evidence
- `evidence/78/ws_capture.mjs`: the recorder. `evidence/78/ws_vs_fills.py`: the comparison.
- `evidence/78/ws_vs_fills_mainnet_capture1_*.txt`, `…capture2_*.txt`, `…capture3_*.txt`, `ws_vs_fills_testnet_*.txt`:
  outputs. `evidence/78/captures/`: the raw frames of the trades and ohlcv channels, one JSON line per frame with the local
  receive time. Order book frames are left out for size.
- `evidence/78/multi_fill_txs_24h_*.txt`: the 24-hour count of transaction shapes on mainnet.
- `evidence/78/ws_subscription_cap.mjs`, output `ws_subscription_cap_2026-11-03T1308Z.txt` (mainnet and stg): item 2.

## Why it matters
A chart, a volume or VWAP feed, or a bot that tracks prints from the `trades` channel, as the docs recommend, silently
misses fills from multi-fill transactions: takers that sweep several levels, and router swaps. A
candle-driven bot that stays connected trades on a candle whose volume and high/low differ from the venue's own REST
candles and from what a freshly connected client sees, and nothing in the stream says so. Reconciling against REST
`/trades` and `/candles` is the only way to notice. The bot kit's own `examples/06-multipair-competition/bot/ws_trades.py`
builds its "aggressive buy/sell flow (whale detection / momentum)" window from this channel. It misses part of exactly the
sweeps it is looking for, and `packages/core/src/ws.ts` subscribes to the same `trades` channel.

## Suggested fix
Publish one `trades:update` per `OrderFilled` log, keyed by `(blockNumber, logIndex)` or `txHash:logIndex`, and make sure
two fills of one transaction can't overwrite or deduplicate each other on the way into the stream. The REST trade id
(`takerOrderId:makerOrderId`) already differs per fill. Build live `ohlcv` updates from the same fill set as REST
`/candles`. Expose that key (or a sequence number) as `trade.id`, so clients can detect a gap and backfill from REST.
Today `trade.id` is a feed-internal `<ms>-<n>` value that matches nothing in REST or on chain.
For item 2: document the per-connection subscription limit, return a distinct error such as `too_many_subscriptions`
with the limit in the message, or raise the limit for `order` subscriptions.

## Environment
- Somnia mainnet (5031): feed `wss://api.dreamdex.io/v0/ws/public`, REST `https://api.dreamdex.io/v0`, indexer
  `https://prd.smk.somnia.host/v1/graphql` (at chain head during the captures)
- Shannon testnet control: `wss://stg.api.dreamdex.io/v0/ws/public`, `https://dev.smk.somnia.host/v1/graphql`
- Node 22.22.1 built-in WebSocket client, Python 3.14
