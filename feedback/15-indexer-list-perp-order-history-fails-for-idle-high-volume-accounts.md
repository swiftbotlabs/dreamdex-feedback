# Indexer: the SDK's `listPerpOrderHistory(account)` (the guide's read for finished perp orders) fails with "database query error" after ~10.5 s for high-volume accounts that have stopped trading (7 of 7 tested, every pass on 2026-10-26); only a `placedAtTimestamp` sort answers
Severity: normal
Area: API

> **Summary.** `client.listPerpOrderHistory(account, { limit: 100 })` is the read the SDK Perps guide gives for finished
> orders. For 7 high-volume accounts (more than 50,000 orders each, last order placed 2026-10-14 13:25–13:28 UTC) the
> indexer answers its request with `database query error` after 10.2–10.9 s, on all 6 passes between 00:53 and 03:29 UTC
> on 2026-10-26. The same filter sorted by `placedAtTimestamp` (`orderBy: "placed"`) returns 100 rows in 0.2–2.1 s.
> Accounts with just as many orders that are still trading, and quiet accounts, get the default read in 0.2–2.3 s.

> **Checked 2026-10-26, 00:53–03:33 UTC, Somnia Tokyo testnet (chain 50383).** Last run 03:27:55–03:33:42 UTC,
> indexer `latest_processed_block` 33331318. The live SDK Perps guide still shows the call and the `"ended"` default at
> 03:30:43 UTC and mentions no timeout or size limit. Step 1's minimal pair, re-run at 04:48 UTC: 10.65 s `database query
> error`, then 100 rows in 1.31 s. Evidence: `evidence/15/order_history_recheck_2026-10-26T0327Z.txt`,
> `evidence/15/order_history_minimal_pair_2026-10-26T0333Z.txt`, `evidence/15/sdk_perps_guide_2026-10-26T0330Z.txt`.

**Distinct from report 04:** 04 is the `MarginEvent` entity and `getMarginEvents` (fix: an index on `MarginEvent`). This
report is the `Order` entity and `listPerpOrderHistory`, a different SDK method with a different fix (an `Order` index,
or a different SDK default sort). It is also not the unfiltered case (`Order` sorted by a block column with no `where`):
here the request carries the owner filter that the SDK always sends, and it still fails.

The SDK Perps guide (`https://somnia-platform-docs.vercel.app/markets/somnia-markets/typescript/perps`, "One-shot reads
(no watch)"; the same text is in the package's `docs/PERPS.md`) shows:

```ts
const hist = await client.listPerpOrderHistory(account, { limit: 100 }); // FINISHED orders
```

> `getPerpPortfolio` returns **open** orders only, so `listPerpOrderHistory` is the other half — finished orders,
> most-recently-ended first. [...] Sort axis is selectable — `orderBy: "ended"` (default) or `"placed"`.

SDK 0.32.1 (`src/perp/portfolio.ts` lines 398–428) builds
`where = { owner: {_eq: <account lowercased>}, market_id: {_in: <the 21 PERP pools>}, status: {_neq: "Open"} }` and,
by default, `order_by: [{lastUpdatedAtTimestamp: desc}, {id: desc}]` (lines 422–424), limit 100, offset 0. It sends
them with the `PerpOrderHistory` document (`src/gql/graphql.ts` line 9231):

```graphql
query PerpOrderHistory($where: Order_bool_exp!, $orderBy: [Order_order_by!], $limit: Int, $offset: Int) {
  _sdkWatermark: chain_metadata { chain_id latest_processed_block }
  Order(where: $where, order_by: $orderBy, limit: $limit, offset: $offset) { id orderId isBid price ... market { ... } }
}
```

Against the Hideki indexer this request fails for the accounts in the table below, every time, with:

```
{"errors":[{"message":"database query error","extensions":{"path":"$","code":"unexpected"}}]}
```

The response does not say it was a timeout. The SDK's own source says "the API role has a 10 s timeout"
(`src/graphqlBoundary.ts` lines 328–331), but `isEndpointFailure` (lines 339–351) only recognises Postgres's
`canceling statement due to statement timeout`. So the SDK throws an `IndexerError` with `database query error`
(line 264), does not retry it (line 617), and the caller cannot tell this deterministic failure from an outage
(read from source, not executed).

What the failing accounts share is that they have stopped trading, not their size. All 7 have more than 50,000 orders
and placed their last order on 2026-10-14 between 13:25:56 and 13:28:16 UTC (all `Cancelled`). Two accounts with more
than 50,000 orders that are still trading (`0x4753…8bff`, `0x6c29…1ce4`, last order seconds before each check) answer the
same read in about 1 s. One active account placed its last 50,000 orders between 02:58:18 and 03:31:40 UTC today. So for
an account whose last order ended 12 days ago, any plan that walks the `lastUpdatedAtTimestamp` (or `id`) order from the
newest row has a very large number of other accounts' orders to skip. That would explain the timings, but we have not
seen the query plan. If this reading is right, other high-volume bots would start failing the same way once they stop
trading, and those are the accounts whose history a reconciliation or post-mortem needs most.

## Steps to reproduce
1. Minimal pair, same filter, two sorts (account `0x3024ad2acd22f31ce2c8ea37b7837d530ca46e50`):

```
curl -s -w ' %{time_total}s\n' https://hideki-dev.smk.somnia.host/v1/graphql -H 'content-type: application/json' --data '{"query":"{ Order(where:{owner:{_eq:\"0x3024ad2acd22f31ce2c8ea37b7837d530ca46e50\"}, status:{_neq:\"Open\"}}, order_by:[{lastUpdatedAtTimestamp:desc},{id:desc}], limit:100) { id status lastUpdatedAtTimestamp } }"}'
```

   Then send the same query with `order_by:[{placedAtTimestamp:desc},{id:desc}]`.
2. The exact SDK request: `curl -s -w ' %{time_total}s\n' -H 'content-type: application/json' https://hideki-dev.smk.somnia.host/v1/graphql --data @evidence/15/sdk_body_ended_0x3024.json`,
   then the same with `evidence/15/sdk_body_placed_0x3024.json` (`orderBy: "placed"`). The bodies are the `PerpOrderHistory`
   document from the SDK with the variables `portfolio.ts` builds for `listPerpOrderHistory("0x3024…6e50", { limit: 100 })`.
   The 21 `market_id`s are the PERP pools returned by the SDK's own `PoolsByType` query. In application code this is
   `await client.listPerpOrderHistory("0x3024ad2acd22f31ce2c8ea37b7837d530ca46e50", { limit: 100 })`. We sent the request
   with curl rather than running the package.
3. All accounts: `bash evidence/15/order_history_recheck.sh <account…>` (read-only). For each account it sends the SDK
   request with the default sort and the account's most recent order; for the first account it also sends the minimal pair
   and the `"placed"` body.

## Expected
A page of up to 100 finished orders, newest-ended first, well inside the 10 s limit, for any account, as the guide
describes. The same filter with the other documented sort already answers in about 1 s.

## Actual
SDK default read (`"ended"`), 6 passes on 2026-10-26: 00:53, 01:02 and 01:20 UTC, then about 01:52–01:56, about
02:02–02:06 and about 03:28–03:30 UTC. Each cell is one request per pass, using the document text with `_sdkWatermark`.
"Orders" means the owner-only `placedAtTimestamp` query with `offset: 50000` returned a row.

| account | orders | last order placed (UTC) | SDK default (`"ended"`) | `orderBy: "placed"` |
|---|---|---|---|---|
| `0x3024ad2acd22f31ce2c8ea37b7837d530ca46e50` | > 50,000 | 2026-10-14 13:28:16 | 6 of 6 ERROR, 10.16–10.72 s | 4 of 4 ok, 0.20–1.92 s |
| `0x72b1b17dcb3655a7872c5fa1b8723bfd1a0054d2` | > 50,000 | 2026-10-14 13:27:23 | 6 of 6 ERROR, 10.16–10.54 s | 3 of 3 ok, 0.20–1.61 s |
| `0x44718499bcd05ccf9a9d9fc9c32b5ae4b8013f6d` | > 50,000 | 2026-10-14 13:26:02 | 6 of 6 ERROR, 10.16–10.65 s | 3 of 3 ok, 0.30–2.06 s |
| `0x79b3372680cc5f7b626947e6e09eef3c646af7ac` | > 50,000 | 2026-10-14 13:25:56 | 6 of 6 ERROR, 10.16–10.95 s | 3 of 3 ok, 0.40–1.10 s |
| `0x4e42d094f9d066a013a98a61b34690c882d1f896` | > 50,000 | 2026-10-14 13:26:08 | 6 of 6 ERROR, 10.16–10.67 s | 3 of 3 ok, 0.50–1.56 s |
| `0xd0e04f285b63b8655678f1fa39923727f1889140` | > 50,000 | 2026-10-14 13:27:31 | 6 of 6 ERROR, 10.16–10.63 s | 3 of 3 ok, 0.20–1.07 s |
| `0x3299e48c454a8084ad37011353c6e14f2622d3c5` | > 50,000 | 2026-10-14 13:27:03 | 6 of 6 ERROR, 10.16–10.64 s | 3 of 3 ok, 0.20–1.20 s |
| `0x47537e3a3ea6e9391f3b26ea45618db6828c8bff` (trading) | > 50,000 | 2026-10-26 03:29:55 | 5 of 5 ok, 0.18–1.23 s | 3 of 3 ok |
| `0x6c2986a550dc4212b49a1710d8466553e3761ce4` (trading) | > 50,000 | 2026-10-26 03:30:03 | 5 of 5 ok, 0.20–1.12 s | 2 of 2 ok |
| `0xfa5f80c0…1fb5a`, `0xab8b6125…10b2`, `0xe8c0d36d…a984`, `0x85c69563…a831`, `0x8239544d…2e68` (trading) | not measured | 2026-10-26 03:29:57–03:30:10 | 4–5 of 4–5 ok each, 0.18–2.25 s | ok |
| `0x0e7e8df6…3817` (33 rows), `0x2a11e738…bf08` (ours, 5 rows), `0x567476bd…3f45` (0 rows) | small | — | ok on every pass, 0.16–1.62 s | ok |

So 42 of 42 default requests for the 7 stopped accounts failed, and none of the 44 requests for the other 10 accounts did.
The other document text the SDK can send (without `_sdkWatermark`, chosen in `src/indexerRead.ts` line 124) behaves the
same: 13 of 14 requests for the 7 stopped accounts failed with `database query error`. The 14th was a transport failure
(no HTTP response after 14.56 s, `0xd0e0…9140` at 01:55:30 UTC), not counted either way.

Shape variants for `0x3024…6e50` (01:58:59–02:00:24 UTC, `evidence/15/order_history_variants_0x3024_2026-10-26T0158Z.txt`):

| query shape | result |
|---|---|
| SDK default (`"ended"`) | 10.75 s ERROR |
| SDK, `pool: BTC` (`market_id _eq`) | 10.50 s ERROR |
| SDK, `status: ["Filled"]` | 10.75 s ERROR |
| owner + `status _neq Open`, no `market_id`, `"ended"` sort | 10.52 s ERROR |
| owner only, `"ended"` sort | 10.60 s ERROR |
| SDK `where`, `order_by: {id: desc}` only | 10.53 s ERROR |
| SDK `where`, no `order_by` | 7.72 s ok (the same shape failed at 01:04 UTC after 10.21 s) |
| SDK `orderBy: "placed"` | 5.73 s ok |
| `client.getOrders(owner)` (`placedAtTimestamp` desc, limit 200) | 4.59 s ok |

So the column itself is not the whole cause: on these accounts, an owner-filtered `Order` read is reliably fast only when
it is sorted by `placedAtTimestamp`. The rows exist and are correct. The `"placed"` page's first row,
`0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0_7766079255031725464281` (`Cancelled`, `lastUpdatedAtTimestamp` 1791984497 =
2026-10-14 13:28:17 UTC), is a 12-day-old order, so the default read has an answer to return. It cannot reach it within
the timeout.

Footnote, `0x420691db9d2b5a79210fda48c177471386b6dfd1`: this account also fails the default read (6 of 6, 10.17–10.64 s).
Unlike the 7 above, it also fails `orderBy: "placed"` (3 of 3), `client.getOrders(owner)` (01:02, 01:20 and 02:02 UTC) and
an owner-only `placedAtTimestamp` query with `limit: 1` (03:29:42 UTC, 11.96 s), so we could not read when it last
traded. Narrower reads did answer: `getOrders` with `status: Filled` or with one pool at 01:20 UTC, and the SDK `where`
with no `order_by` once at 00:55 UTC (not at 02:01 UTC). Its case is wider than this report, and we list it only for
completeness (`evidence/15/order_history_variants_0x420691_2026-10-26T0200Z.txt`,
`evidence/15/order_history_first_runs_2026-10-26T0053Z-0125Z.txt`).

## Evidence
- `evidence/15/order_history_minimal_pair_2026-10-26T0333Z.txt` (step 1 as written: 10.62 s ERROR, then 100 rows in
  1.29 s) and `evidence/15/order_history_minimal_pair_2026-10-26T0151Z.txt` (10.52 s ERROR, then 100 rows in 0.62 s).
- `evidence/15/order_history_recheck_2026-10-26T0327Z.txt`: the SDK default for 18 accounts plus each account's last order,
  03:27:55–03:30:15 UTC. `evidence/15/order_history_recheck.sh` reruns it.
- `evidence/15/order_history_first_runs_2026-10-26T0053Z-0125Z.txt` (passes at 00:53, 01:02 and 01:20 UTC, and the exact SDK
  body at 01:25:27 UTC: 10.52 s ERROR), `evidence/15/order_history_matrix_2026-10-26T0152Z.txt` and
  `evidence/15/order_history_matrix_2026-10-26T0202Z.txt` (both document texts and the `"placed"` body for every account).
- `evidence/15/order_lastactive_2026-10-26T0153Z.txt`, `evidence/15/order_rowcount_probe_2026-10-26T0331Z.txt` and
  `evidence/15/order_rowcount_probe_0x3024_2026-10-26T0207Z.txt`: last order per account and the `offset: 50000` probes.
- `evidence/15/sdk_body_ended_0x3024.json`, `evidence/15/sdk_body_placed_0x3024.json`: the exact request bodies.
- `evidence/15/sdk_perps_guide_2026-10-26T0330Z.txt`: the guide's call, prose and default, fetched 03:30:43 UTC.
- SDK 0.32.1 source: `src/perp/portfolio.ts` lines 358–428 (doc comment, `where`, default sort at 422–424),
  `src/gql/graphql.ts` line 9231, `src/graphqlBoundary.ts` lines 328–351. The npm tarball's sha512 matches
  `dist.integrity`. 0.32.2-canary.38575926931 has the same default sort.

## Suggested fix
- Indexer: add an index that serves the SDK's default read, `Order (owner, lastUpdatedAtTimestamp DESC, id DESC)`.
  An `(owner, id)` index would cover the `id`-only sort, which fails today as well. The `placedAtTimestamp` sort with the
  same filter answers in about 1 s, which suggests the owner + placement path is already covered.
- Indexer: return a distinguishable error (`statement timeout`, as Postgres words it) instead of the generic
  `database query error` / `unexpected`, so the SDK's existing timeout handling (`isEndpointFailure`) can see it.
- SDK, until then: either note in the guide that `"ended"` can time out for large accounts with old activity (with
  `orderBy: "placed"` as the working alternative), or make `"placed"` the default.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (npm `latest`); source read as text from the tarball, not executed; requests sent
  with curl, both document texts the SDK can send
- Indexer `https://hideki-dev.smk.somnia.host/v1/graphql` (as listed on `app.dreamdex.io/docs/developers/perps-testnet`),
  `chain_metadata.chain_id` 50383, `latest_processed_block` 33331318 at 03:27:55 UTC
- Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and SDK)
- Date: 2026-10-26, 00:53–03:33 UTC
- Wallet: n/a (read-only; no transactions sent); accounts queried: the 18 in the table
