# Docs: the documented testnet feed rejects all three `order` channel subscribe examples (two leave out the required `symbol`; all three use a hex `orderId`)
Severity: normal
Area: docs

> **Summary.** The Real-Time Feed page and the Quick Start give three `order` subscribe frames. The testnet feed they name,
> `wss://stg.api.dreamdex.io/v0/ws/public`, answers each one with `subscription_failed`. Two of the frames leave out `symbol`,
> which both testnet hosts' specs require, so those two fail on both hosts. All three pass a hex `orderId`, which stg rejects; its own OpenAPI
> defines the id as a decimal string. The only frame that subscribes on both hosts is `{symbol, orderId: "<decimal>"}`.

The docs show three ways to subscribe to one order's lifecycle on the `order` channel:

| # | Where | `params` as documented |
|---|---|---|
| A | Real-Time Feed → Order Lifecycle Tracking, step 2 (`/docs/developers/websocket-api/real-time-feed.md`, line 38) | `{"symbol": "SOMI:USDso", "orderId": "0xYourOrderId"}` |
| B | Real-Time Feed → "Subscribe to order updates" (same page, lines 153–162) | `{"orderId": "0x1234567890abcdef"}` |
| C | Quick Start → "Option C: Stream via WebSocket" (`/docs/welcome/quick-start.md`, lines 365–375) | `{ "orderId": "0xYourOrderId" }` |

Both pages give `wss://stg.api.dreamdex.io/v0/ws/public` as the testnet feed (Real-Time Feed, Connection table, line 65:
"Testnet (Somnia Shannon)"; Quick Start line 367: "(testnet: `wss://stg.api.dreamdex.io/v0/ws/public`)"). On that host:

- **A** (symbol + hex id) → `subscription_failed`.
- **B** and **C** (hex id, no symbol) → `subscription_failed`.
- `{symbol, orderId: "<decimal>"}` for the **same order** subscribes and streams its `placed` / `rested` / `cancelled`
  updates. This works on a fresh connection both before and after the failing frames, so the id itself is valid.

The specs say why. `OrderParams` in `https://stg.api.dreamdex.io/.well-known/async.json` has `"required": ["symbol", "orderId"]`,
and stg's `/.well-known/oapi.json` defines `OrderId` as "Unique uint128 order identifier, encoded as a decimal string",
`"pattern": "^[0-9]+$"`. stg's own AsyncAPI example, which has the same title as the docs' example B ("Subscribe to order
updates"), sends `{"orderId": "340282366920938463463374607431768211455", "symbol": "SOM:USD"}`: a decimal id plus a symbol. The
docs pages give no format for `orderId` and use only hex ids. Step 1 of the docs flow says to take the id "from the `OrderPlaced`
event / prepared-order response", but does not say how to turn it into the string the feed takes.

The second testnet host, `wss://api.testnet.dreamdex.io/v0/ws` (the `Testnet` server in its own `/.well-known/async.json`; the
docs don't mention it), shows the missing-`symbol` failure is not specific to stg. It accepts **A**, and rejects **B** and
**C** with `params.symbol: Invalid input: expected string, received undefined`. So examples B and C fail on every testnet host.

The official bot kit sends the symbol-less shape of examples B and C. In `github.com/somnia-chain/dreamdex-bot-kit` (main = `25798660`),
`examples/05-production-async/src/dreamdex_bot/core/ws_client.py` sends `"params": {"orderId": str(order_id)}` with no
`symbol` (lines 100, 111 and 214), to `testnet_ws = "wss://stg.api.dreamdex.io/v0/ws/public"` (`config.py` line 157). Its test
`test_subscribe_order_sends_documented_order_subscription` expects exactly that payload (`{"orderId": "123"}`). We did not run
the kit. Frames of that shape ((b) and (c) below) are rejected on both hosts.

This report covers only the subscribe request: the `params` the docs tell a client to send. It does not cover the frames
the feed sends after `subscribed`.

## Steps to reproduce
1. Get a live order id on the SOMI:USDso market. `GET /v0/markets` on both hosts maps SOMI:USDso to SpotPool
   `0x259fD6559214dd5aD3752322426eA9F9fABEFff4` on Somnia Shannon. Read its latest `OrderRested(uint128 indexed orderId)` log
   (topic0 `0xcdd45acd…b866`, as on the Events page, `/docs/developers/contracts/events`):
   ```sh
   RPC=https://api.infra.testnet.somnia.network
   H=$(curl -s -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' $RPC | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"])')
   F=$(printf '0x%x' $(( H - 300 )))
   curl -s -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"eth_getLogs\",\"params\":[{\"address\":\"0x259fD6559214dd5aD3752322426eA9F9fABEFff4\",\"topics\":[\"0xcdd45acd62788abc10f79d86fac34df2a63e1a3b20f061c5bcf431ff6a09b866\"],\"fromBlock\":\"$F\",\"toBlock\":\"$H\"}]}" $RPC \
     | python3 -c 'import sys,json;t=json.load(sys.stdin)["result"][-1]["topics"][1];print(int(t,16), hex(int(t,16)))'
   ```
   This prints the id as a decimal and as hex, e.g. `793209995169536258277 0x2b000000000185b0e5`.
2. Open a new connection to `wss://stg.api.dreamdex.io/v0/ws/public` for each frame below, send it, and read the first reply:
   - (a) docs example A: `{"operation":"subscribe","channel":"order","params":{"symbol":"SOMI:USDso","orderId":"0x<hex id>"}}`
   - (b) docs examples B / C: `{"operation":"subscribe","channel":"order","params":{"orderId":"0x<hex id>"}}`
   - (c) B / C with a decimal id: `{"operation":"subscribe","channel":"order","params":{"orderId":"<decimal id>"}}`
   - (d) control, the spec's shape: `{"operation":"subscribe","channel":"order","params":{"symbol":"SOMI:USDso","orderId":"<decimal id>"}}`,
     sent once before (a)–(c) and once after them
3. Repeat step 2 on `wss://api.testnet.dreamdex.io/v0/ws`.

`node evidence/27/order_sub_verify.mjs` runs steps 1–3 (Node 22 built-in `WebSocket`, viem only for `eth_getLogs`; read-only, no
keys, no transactions). It uses one fresh connection per frame.

## Expected
The docs' examples subscribe on the testnet feed the docs name. Or the docs show the frame that does subscribe, and say that
`symbol` is required and `orderId` is the uint128 as a decimal string, as both specs say.

## Actual
Run 2026-10-26 04:32:28–04:33:19 UTC (`evidence/27/order_sub_verify_2026-10-26T0432Z.txt`), order `1328165573307113254805`
= `0x48000000000185af95` (block 524149424, tx `0x3865c642a60aa8debefc64b967e67b5da7cfeb81cbe8d2f8e997b7f2eaf44179`):

| Frame | stg `/v0/ws/public` (documented testnet) | api.testnet `/v0/ws` |
|---|---|---|
| (d) control, before | `subscribed`, then `placed` + `rested` + `cancelled` | `subscribed`, then `placed` + `cancelled` |
| (a) docs A `{symbol, hex}` | `subscription_failed` | `subscribed` |
| (b) docs B / C `{hex}` | `subscription_failed` | `subscription_failed`, `params.symbol` |
| (c) `{decimal}` | `subscription_failed` | `subscription_failed`, `params.symbol` |
| (d) control, after | `subscribed`, then `placed` + `rested` + `cancelled` | `subscribed`, then `placed` + `cancelled` |

Replies as received:
```
04:32:31.040Z stg  (d) {"channel":"order","type":"subscribed","symbol":"SOMI:USDso","orderId":"1328165573307113254805"}
04:32:36.608Z stg  (a) {"type":"error","errorName":"subscription_failed","message":"subscription failed to channel: order"}
04:32:39.923Z stg  (b) {"type":"error","errorName":"subscription_failed","message":"subscription failed to channel: order"}
04:32:43.260Z stg  (c) {"type":"error","errorName":"subscription_failed","message":"subscription failed to channel: order"}
04:32:46.755Z stg  (d) {"channel":"order","type":"subscribed","symbol":"SOMI:USDso","orderId":"1328165573307113254805"}
04:33:03.913Z api.testnet (a) {"type":"subscribed","channel":"order","symbol":"SOMI:USDso","orderId":"0x48000000000185af95"}
04:33:09.394Z api.testnet (b) {"type":"error","errorName":"subscription_failed","message":"subscription failed to channel: order: params.symbol: Invalid input: expected string, received undefined"}
04:33:12.763Z api.testnet (c) {"type":"error","errorName":"subscription_failed","message":"subscription failed to channel: order: params.symbol: Invalid input: expected string, received undefined"}
```

We got the same result in five more runs on 2026-10-26, each with a different order:

| UTC | Order (decimal = hex) | Hosts | File |
|---|---|---|---|
| 03:08:58–03:09:04 | `922337203685503111888` = `0x3200000000018592d0` | stg | `evidence/27/order_channel_stg_2026-10-26T0308Z.txt` |
| 03:09:47–03:09:52 | `977677435906631766794` = `0x35000000000185930a` | api.testnet | `evidence/27/order_channel_apitestnet_2026-10-26T0309Z.txt` |
| 03:26:39–03:26:45 | `977677435906631768126` = `0x35000000000185983e` | stg | `evidence/27/order_channel_stg_2026-10-26T0326Z.txt` |
| 04:20:59–04:21:43 | `977677435906631773263` = `0x35000000000185ac4f` | both | `evidence/27/order_sub_verify_2026-10-26T0420Z.txt` |
| 04:22:00–04:22:44 | `1254378597012275047539` = `0x44000000000185ac73` | both | `evidence/27/order_sub_verify_2026-10-26T0422Z.txt` |

The 03:xx runs used `evidence/27/order_channel_repro.mjs`, which sends all frames on one connection.

The docs lines, both hosts' `OrderParams` and `OrderId` definitions and the bot kit lines, re-fetched at 04:33:28 UTC (the same
bytes as at 04:19 UTC), are in `evidence/27/docs_and_spec_excerpts_2026-10-26T0433Z.txt`.

## Evidence
- `evidence/27/order_sub_verify.mjs`: the repro script (read-only).
- `evidence/27/order_sub_verify_2026-10-26T0432Z.txt`, `…T0420Z.txt`, `…T0422Z.txt`: full frame logs, one fresh connection per
  frame, both hosts.
- `evidence/27/order_channel_repro.mjs` and `evidence/27/order_channel_{stg,apitestnet}_2026-10-26T03*.txt`: the earlier
  one-connection runs.
- `evidence/27/docs_and_spec_excerpts_2026-10-26T0433Z.txt`, with line numbers:
  - Real-Time Feed lines 29–38 (example A), 46 (bad params return `subscription_failed`), 60–65 (Connection table) and
    153–162 (example B);
  - Quick Start lines 365–377 (example C);
  - WebSocket Errors line 58 (`subscription_failed`: "missing field, unknown symbol, bad timeframe, malformed `orderId`");
  - both `OrderParams` schemas, stg's `subscribeOrder` example, both `OrderId` definitions;
  - bot kit `ws_client.py` lines 86–101, 103–112 and 210–215.
- Full copies as fetched: `evidence/27/docs_real-time-feed_2026-10-26T0433Z.md`, `evidence/27/docs_quick-start_2026-10-26T0433Z.md`,
  `evidence/27/docs_websocket-errors_2026-10-26T0433Z.md`, `evidence/27/spec_{stg,apitestnet}_{async,oapi}_2026-10-26T0433Z.json`,
  `evidence/27/botkit_05_ws_client_main_25798660.py`.

## Suggested fix
- Change examples A, B and C to the shape both specs define, with a decimal id and the market symbol, e.g.
  `{"operation":"subscribe","channel":"order","params":{"symbol":"SOMI:USDso","orderId":"977677435906631773263"}}`.
- Under step 1 of Order Lifecycle Tracking, say that `orderId` is the uint128 as a decimal string, and how to get it from the
  `OrderPlaced` topic (e.g. `BigInt(log.topics[1]).toString()`). Also use decimal ids in the `order:snapshot` and `order:update` examples, which use
  `"id": "0x1234567890abcdef"` (Real-Time Feed lines 591, 636 and 656).
- Or make stg accept `0x` hex ids, as api.testnet already does when `symbol` is present.
- Bot kit example 05: add `symbol` to the `order` subscribe and unsubscribe frames in `ws_client.py`, and to the expected
  payload in `tests/test_ws_client.py`.

## Environment
- WebSocket feeds: `wss://stg.api.dreamdex.io/v0/ws/public` ("Testnet (Somnia Shannon)" in the docs) and
  `wss://api.testnet.dreamdex.io/v0/ws` (the `Testnet` server in its own `/.well-known/async.json`)
- Market: SOMI:USDso, SpotPool `0x259fD6559214dd5aD3752322426eA9F9fABEFff4`, Somnia Shannon testnet, chain id 50312, RPC
  `https://api.infra.testnet.somnia.network`. `GET /v0/markets` on both hosts lists only the Shannon spot markets
  (SOMI:USDso, WBTC:USDso, WETH:USDso). The api.testnet spec lists `kind: "perp"` as an option for this channel.
- Docs: `https://app.dreamdex.io/docs/developers/websocket-api/real-time-feed.md`, `/docs/welcome/quick-start.md`,
  `/docs/developers/websocket-api/errors.md`, fetched 2026-10-26 04:19 and 04:33 UTC
- Bot kit: `github.com/somnia-chain/dreamdex-bot-kit` main `25798660bbe4674a6f83a960b202852896e2fed4` (source read; not run)
- Node v22.22.1 (built-in `WebSocket`), viem 2.57.7 (for `eth_getLogs` only)
- Date: 2026-10-26, 03:08–04:34 UTC
- Wallet: n/a (read-only, no transactions sent). The order ids are other traders' public SOMI:USDso orders.
- `@somnia-chain/markets-sdk`: not involved
