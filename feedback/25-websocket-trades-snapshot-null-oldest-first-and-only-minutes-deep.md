# WebSocket API: on the documented testnet feed, the `trades` snapshot sends `"trades": null`, is oldest-first, and holds only the last ~1–3 minutes of trades whatever `limit` asks for
Severity: normal
Area: API

> **Summary.** The docs list `wss://stg.api.dreamdex.io/v0/ws/public` as the testnet public feed. On that host, the
> `trades:snapshot` frame breaks the documented message in three ways. (1) With `limit: 1`, and sometimes `limit: 3`, it
> sends `"trades": null`, although the docs and stg's own AsyncAPI spec make `trades` a required array. (2) Its trades are
> sorted oldest-first, although both say newest-first. (3) It holds only the last ~1–3 minutes of trades: `limit` 100,
> `limit` 500 and the default all return 7–20 trades, while REST `/trades` on the same host returns 100 rows covering
> ~17 minutes. Small limits also return fewer trades than exist: `limit: 3` returned `null` or 1 trade, while a
> `limit: 10` snapshot ~4 s later held older trades that `limit: 3` should have included. The docs tell clients to rebuild
> their state from this snapshot after every reconnect.

> **Checked 2026-10-26, 03:10–04:38 UTC, Somnia Shannon testnet (stg, chain 50312).** Last runs 04:32–04:38 UTC on
> SOMI:USDso and WETH:USDso, one fresh connection per subscribe. The live Real-Time Feed page and stg's
> `/.well-known/async.json` (both fetched 04:32 UTC) still say newest-first and still make `trades` a required array.
> The one-liner below, re-run at 04:52 UTC: `limit: 1` → `"trades":null`; `limit: 100` → 15 trades, oldest-first, spanning
> 04:50:18–04:52:38 UTC.
> Evidence: `evidence/25/stg_somi_2026-10-26T0433Z.txt`, `evidence/25/stg_weth_2026-10-26T0433Z.txt`,
> `evidence/25/oneliner_stg_somi_2026-10-26T0438Z.txt`, `evidence/25/docs_excerpts.txt`.

The Real-Time Feed page (`/docs/developers/websocket-api/real-time-feed.md`; the same text is in `llms-full.txt`,
lines 4541–4554) says this about the snapshot:

> Sends recent trade history immediately after a client subscribes to the trades channel. Contains the most recent trades
> up to the requested limit (default 100). Trades are ordered by timestamp descending (newest first).

Its message table lists `` `trades` | array<object> | ... | required ``. Its subscribe example sends `"limit": 100`. The
"Reconnecting and resuming" section (line 23) makes the snapshot the recovery path: "Market-data channels (`orderbook`,
`ohlcv`, `trades`) reply with a fresh `snapshot`, so your local state is rebuilt from scratch". The Connection table
(lines 62–65) gives `wss://stg.api.dreamdex.io/v0/ws/public` as the "Testnet (Somnia Shannon)" feed. stg's own AsyncAPI
document (`https://stg.api.dreamdex.io/.well-known/async.json`) describes the snapshot the same way. Its `TradesSnapshot`
is "sorted by timestamp descending (newest first)", `trades` has `"type": "array"` and is in `required`, and
`TradesParams.limit` is "Max number of historical trades (default 100)".

A client written to these docs breaks on stg:
- `for (const t of msg.trades)` throws `TypeError: msg.trades is not iterable` when `trades` is `null`.
- A client that reads `trades[0]` as the latest trade gets the oldest one in the snapshot.
- A client that reconnects and rebuilds its trade tape from the snapshot, as line 23 says, keeps only the last ~1–3
  minutes of trades, even though the same host's REST endpoint has the last 100.

For comparison, the same subscribe on `wss://api.testnet.dreamdex.io/v0/ws/public` (a host the docs do not list, which
serves the same `trades` channel) returns exactly 1, 3, 10, 100, 100 and 500 trades for `limit` 1, 3, 10, 100, the default
and 500. Every one of those snapshots is newest-first. So the documented behaviour exists. This report is not about the
two hosts behaving differently: on its own, the documented testnet host breaks the documented message and its own
published spec.

## Steps to reproduce
1. Read the newest 100 trades over REST:
   `curl -s 'https://stg.api.dreamdex.io/v0/markets/SOMI%3AUSDso/trades?limit=100'`. Note the row count, the order and
   the time range.
2. Open `wss://stg.api.dreamdex.io/v0/ws/public` and send
   `{"operation":"subscribe","channel":"trades","params":{"symbols":["SOMI:USDso"],"limit":N}}` for `N` = 1, 3, 10, 100
   and 500, and once without `limit`. Use a fresh connection for each one (the reconnect flow). Read the first frame with
   `"type":"snapshot"`: is `trades` an array? How many trades does it hold, in what order, over what time range?
3. Repeat steps 1–2 for `WETH:USDso`.
4. Optional: send one subscribe for `["SOMI:USDso","WETH:USDso","WBTC:USDso"]` with `limit` 3, 10, 30 and 100, and add up
   the per-symbol counts.
5. Comparison: repeat steps 1–2 on `wss://api.testnet.dreamdex.io/v0/ws/public` with `https://api.testnet.dreamdex.io/v0`.

A minimal check (Node.js 22, built-in `WebSocket`, no packages):

```
node -e 'const w=new WebSocket("wss://stg.api.dreamdex.io/v0/ws/public");w.onopen=()=>w.send(JSON.stringify({operation:"subscribe",channel:"trades",params:{symbols:["SOMI:USDso"],limit:1}}));w.onmessage=e=>{console.log(String(e.data));if(String(e.data).includes("\"snapshot\""))w.close()}'
```

Scripts (read-only; Node.js 22 built-in `WebSocket` and `fetch`):
- Steps 1–3 and 5: `node evidence/25/trades_snapshot_check.mjs <wsUrl> <restBase> <symbol> <raw.jsonl>`, for example
  `node evidence/25/trades_snapshot_check.mjs wss://stg.api.dreamdex.io/v0/ws/public https://stg.api.dreamdex.io/v0 SOMI:USDso raw.jsonl`.
- Step 4: `node evidence/25/trades_snapshot_multisymbol.mjs wss://stg.api.dreamdex.io/v0/ws/public <limit>`.
- `evidence/25/trades_snapshot_sameconnection.mjs` runs steps 1–2 on one connection, unsubscribing between subscribes. It
  gives the same result.

## Expected
`trades` is always an array (`[]` when there is nothing to send). It is sorted newest-first and holds the
`min(limit, available)` most recent trades of that symbol. For SOMI:USDso, where REST lists 100 trades from the last ~17
minutes, `limit: 100` and the default return 100 trades, and `limit: 3` returns the 3 newest.

## Actual
Run 2026-10-26 04:33:06–04:34:42 UTC, one fresh connection per row (`evidence/25/stg_somi_2026-10-26T0433Z.txt`,
`evidence/25/stg_weth_2026-10-26T0433Z.txt`, `evidence/25/apitestnet_somi_2026-10-26T0434Z.txt`):

| `limit` | stg SOMI:USDso | stg WETH:USDso | api.testnet SOMI:USDso (comparison) |
|---|---|---|---|
| 1 | `null` | `null` | 1 |
| 3 | 1 | `null` | 3, newest-first |
| 10 | 5, oldest-first | 2, oldest-first | 10, newest-first |
| 100 | 11, oldest-first | 7, oldest-first | 100, newest-first |
| (none) | 11, oldest-first | 7, oldest-first | 100, newest-first |
| 500 | 11, oldest-first | 8, oldest-first | 500, newest-first |
| REST `limit=100`, same host | 100 rows, newest-first | 100 rows, newest-first | 100 rows, newest-first |

The `limit: 1` frame, byte for byte (04:33:54.427Z, and again at 04:38:19.964Z with the one-liner above):

```
{"channel":"trades","type":"snapshot","symbol":"SOMI:USDso","trades":null}
```

Time ranges for stg SOMI:USDso:
- REST at 04:33:52.041Z returned 100 rows, from 04:16:58.383 to 04:33:48.571, newest first.
- The `limit: 100` snapshot at 04:34:05.037Z held 11 trades, from 04:32:18.572 to 04:33:58.572, oldest first.

The one-liner with `limit: 100` at 04:38:24.494Z got 18 trades, from 04:35:28.731 up to 04:38:18.732. A short raw excerpt
(`evidence/25/oneliner_stg_somi_2026-10-26T0438Z.txt`):

```
{"channel":"trades","type":"snapshot","symbol":"SOMI:USDso","trades":[{"id":"1792989328905-0","price":"0.1757","quantity":"25","side":"sell","timestamp":1792989328731},{"id":"1792989338907-0","price":"0.1756","quantity":"25","side":"sell","timestamp":1792989338733},...
```

On stg, small limits return fewer trades than exist. They do not return the newest N:
- SOMI: the `limit: 3` snapshot at 04:33:57.742Z held one trade (04:33:48.571). The `limit: 10` snapshot 3.6 s later
  (04:34:01.371Z) held trades at 04:33:18.573, 04:33:28.572, 04:33:38.571, 04:33:48.571 and 04:33:58.572. The first four
  already existed at 04:33:57, so a correct `limit: 3` would have returned 04:33:48.571, 04:33:38.571 and 04:33:28.572.
- WETH: the `limit: 3` snapshot at 04:33:11.893Z was `null`. REST at 04:33:06.623Z already listed a trade at
  04:32:54.572, and the `limit: 10` snapshot at 04:33:15.622Z contained it.

The same pattern shows up in every run. In each one, `limit: 1` gave `null`, and the `limit: 100` or default snapshot was
oldest-first with 7–20 trades:
- 03:10 UTC, one connection (`evidence/25/stg_somi_sameconnection_2026-10-26T0310Z.txt`): `limit: 100` gave 19 trades and
  the default gave 20. REST had 100 rows from 02:53:58 to 03:10:38.
- 04:19–04:20 UTC (`evidence/25/stg_somi_2026-10-26T0419Z.txt`, `evidence/25/stg_weth_2026-10-26T0420Z.txt`): 11, 11 and 10
  trades for SOMI, and 11, 12 and 12 for WETH (`limit: 100`, the default and `limit: 500`).
- api.testnet comparison at 04:20–04:21 UTC (`evidence/25/apitestnet_somi_2026-10-26T0420Z.txt`,
  `evidence/25/apitestnet_weth_2026-10-26T0421Z.txt`): exact counts, newest-first, on both markets.

Possible cause (an observation, not confirmed). With one subscribe for all three stg markets, the per-symbol counts never
add up to more than `limit`. Run 04:34:55–04:35:17 UTC (`evidence/25/stg_multisymbol_2026-10-26T0434Z.txt`):

| `limit` | SOMI | WETH | WBTC | sum |
|---|---|---|---|---|
| 3 | 1 | `null` | 1 | 2 |
| 10 | 5 | `null` | 3 | 8 |
| 30 | 6 | 3 | 8 | 17 |
| 100 | 14 | 7 | 14 | 35 |

An earlier run at 04:22 UTC (`evidence/25/stg_multisymbol_2026-10-26T0422Z.txt`) gave sums of 1, 7, 22 and 40. This fits a
`limit` applied to a short, cross-market buffer of recent trades before the symbol filter, with an empty result sent as
`null`. That would explain `null` for small limits (the newest trades belong to other markets) and the ~1–3 minute
ceiling for large ones.

Also seen (not part of the claim, since no doc promises shared ids): stg's WS trade ids (`1792989228720-0`) never match
its REST ids (`627189298506150293511:1272825341085984600061`). In each run, 0 of the snapshot's ids appeared in the REST
rows, although all but the newest one or two matched a REST row by timestamp, price, quantity and side. On api.testnet,
WS and REST share ids (`524150567_3`, 99 of 100). On stg, a client cannot merge the snapshot with a REST backfill by id.

## Evidence
- `evidence/25/stg_somi_2026-10-26T0433Z.txt`, `evidence/25/stg_weth_2026-10-26T0433Z.txt`: the last stg runs (REST before
  and after, then every snapshot's count, order, time range, ids, id matches and content matches). Raw frames:
  `evidence/25/raw_stg_somi_2026-10-26T0433Z.jsonl`, `evidence/25/raw_stg_weth_2026-10-26T0433Z.jsonl`.
- `evidence/25/apitestnet_somi_2026-10-26T0434Z.txt` (raw: `evidence/25/raw_apitestnet_somi_2026-10-26T0434Z.jsonl`),
  `evidence/25/apitestnet_somi_2026-10-26T0420Z.txt`, `evidence/25/apitestnet_weth_2026-10-26T0421Z.txt`: the comparison runs.
- `evidence/25/oneliner_stg_somi_2026-10-26T0438Z.txt`: the minimal check, with `limit` 1 and 100.
- `evidence/25/stg_somi_2026-10-26T0419Z.txt`, `evidence/25/stg_weth_2026-10-26T0420Z.txt`,
  `evidence/25/stg_somi_sameconnection_2026-10-26T0310Z.txt`: earlier runs.
- `evidence/25/stg_multisymbol_2026-10-26T0434Z.txt`, `evidence/25/stg_multisymbol_2026-10-26T0422Z.txt`: the three-market
  subscribes.
- `evidence/25/docs_excerpts.txt`: the quoted docs lines with line numbers (Real-Time Feed page, `llms-full.txt`) and the
  stg AsyncAPI `TradesSnapshot` and `TradesParams` schemas. Full copies: `evidence/25/real-time-feed_live.md`,
  `evidence/25/stg_async_live.json`.
- Scripts: `evidence/25/trades_snapshot_check.mjs`, `evidence/25/trades_snapshot_multisymbol.mjs`,
  `evidence/25/trades_snapshot_sameconnection.mjs`.

## Suggested fix
1. Send the snapshot newest-first, as the docs and the spec say.
2. Apply `limit` per symbol, after the symbol filter. Serve the snapshot from the same trade history as REST
   `/markets/{symbol}/trades`, so that `limit: 100` returns 100 trades when REST has them. If stg has to keep a short
   buffer, state the window on the Real-Time Feed page next to "up to the requested limit".
3. Send `"trades": []` when the snapshot is empty, never `null`.
4. Optional: use the REST trade ids on the WebSocket, as api.testnet does, so that a client can de-duplicate the
   snapshot against a REST backfill.

## Environment
- WebSocket `wss://stg.api.dreamdex.io/v0/ws/public` and REST `https://stg.api.dreamdex.io/v0`: the "Testnet (Somnia
  Shannon)" hosts in the docs (chain id 50312), with spot markets SOMI:USDso, WETH:USDso and WBTC:USDso
- Comparison: `wss://api.testnet.dreamdex.io/v0/ws/public` and `https://api.testnet.dreamdex.io/v0` (not in the docs)
- Docs: `https://app.dreamdex.io/docs/developers/websocket-api/real-time-feed.md` and `https://stg.api.dreamdex.io/.well-known/async.json`,
  fetched 2026-10-26 04:32 UTC; `https://app.dreamdex.io/llms-full.txt`, fetched 04:35 UTC
- Client: Node.js v22.22.1, with the built-in `WebSocket` and `fetch`. `@somnia-chain/markets-sdk` 0.32.1 has no client
  for this channel (its source has no reference to these hosts), so no SDK was involved.
- Date: 2026-10-26, 03:10–04:38 UTC
- Wallet: n/a (read-only, public market data; no on-chain writes)
