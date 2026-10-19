# Indexer: the SDK's `MarginEvents` query (account + `kinds` filter, newest first) fails with "database query error" for an active account
Severity: major
Area: API | SDK

`client.getMarginEvents(account, { kinds: [...] })` sends this query (src/perp/history.ts:1032):

```graphql
query MarginEvents($where: MarginEvent_bool_exp!, $limit: Int, $offset: Int) {
  _sdkWatermark: chain_metadata { chain_id latest_processed_block }
  MarginEvent(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {
    id account kind pool amount granter timestamp txHash
  }
}
```

with `where = { account: {_eq: <addr>}, kind: {_in: [...]} }`. Against the Hideki indexer this request
fails 5 out of 5 times after ~10.5 s with `database query error` for an account with a large
MarginEvent history, so the documented portfolio-return recipe (`kinds: ["Deposit","Credited","Withdraw"]`)
cannot be run for exactly the accounts it is meant for. The same filter without `order_by`, or
ordered by `id`, completes (3–4.5 s), and the account alone (no `kinds`) returns in 0.5 s, which
points at a missing index covering (account, kind, timestamp) and a ~10 s statement timeout.
Two related shapes fail every time regardless of account: `MarginEvent(distinct_on: kind)` and
`MarginEvent_aggregate(where: {account: ...}) { aggregate { count } }`.

## Steps to reproduce
1. Pick an active account, e.g. `0x420691db9d2b5a79210fda48c177471386b6dfd1` (a market maker that
   produces many `Locked`/`Unlocked` rows).
2. POST the SDK's query to `https://hideki-dev.smk.somnia.host/v1/graphql`:

```
curl -s -m 60 -H 'content-type: application/json' https://hideki-dev.smk.somnia.host/v1/graphql --data '{"query":"query MarginEvents($where: MarginEvent_bool_exp!, $limit: Int, $offset: Int) { MarginEvent(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { id account kind pool amount granter timestamp txHash } }","variables":{"where":{"account":{"_eq":"0x420691db9d2b5a79210fda48c177471386b6dfd1"},"kind":{"_in":["Deposit","Credited","Withdraw"]}},"limit":50,"offset":0}}'
```

3. Repeat a few times; then vary the shape (no `order_by`; `order_by: {id: desc}`; no `kind`).
4. Also try `query { MarginEvent(distinct_on: kind) { kind } }` and
   `query { MarginEvent_aggregate(where:{account:{_eq:"0x4206…dfd1"}}) { aggregate { count } } }`.

## Expected
A page of at most 50 rows in well under the SDK's request timeout, like the other filters.

## Actual
```
{"errors":[{"message":"database query error","extensions":{"path":"$","code":"unexpected"}}]}
```

Timings measured 2026-10-19 09:20–09:30 UTC (each line one request):

| query shape | result |
|---|---|
| account + `kind _in [Deposit,Credited,Withdraw]` + `order_by timestamp desc` (SDK) | 10.76 s ERROR, 10.54 s ERROR, 10.70 s ERROR, 10.50 s ERROR, 10.71 s ERROR |
| same filter, `order_by {id: desc}` | 4.43 s ok |
| same filter, no `order_by` | 2.97 s ok |
| account only, `order_by timestamp desc` | 0.48 s ok |
| account + `kind _in [Locked]`, `order_by timestamp desc` | 0.70 s ok |
| quiet account `0x567476bd…3f45`, same SDK shape | 0.59 s ok |
| `MarginEvent(distinct_on: kind)` | ERROR (3/3) |
| `MarginEvent_aggregate(where account) count` | 0.52 s ERROR |

The SDK wraps the failure as an indexer error; nothing in the response says "timeout", so a caller
cannot tell a transient outage from this deterministic failure.

### Re-check 2026-10-19 15:04 UTC: still failing, and shown against an account with real events of our own
`scripts/indexer_timing.sh` re-run (`evidence/indexer_timing_2026-10-19T1504Z.txt`):

| query shape | `0x4206…dfd1` (active) | `0x2A11…bF08` (ours, 2 rows) |
|---|---|---|
| SDK shape: account + kinds D/C/W + `order_by timestamp desc` | 10.79 s ERROR, 11.20 s ERROR, 11.12 s ERROR | 2.44 s ok, 1.79 s ok, 1.09 s ok |
| account only, ts desc | 1.54 s ok | 1.67 s ok |
| same filter, `order_by {id: desc}` / no `order_by` | 5.85 s ok / 3.89 s ok | — |
| `distinct_on kind` / `MarginEvent_aggregate` count | 11.70 s ERROR / 1.81 s ERROR | — |

To check that the failing shape returns correct rows when it does finish, our own account made real
MarginBank movements (Hideki, see `evidence/onchain_txs_2026-10-19.txt`): `deposit(3.3948 USDso)` in tx
`0x50811a18373415fd960f73c2dbce1d12c247a61fc4f2b1275fbd427cf46fec82` (block 27699377), then a resting
ETH-PERP PostOnly bid (orderId `10367070169424774406286`, tx
`0x39ca9dd7b0f749ad37703072ddbce9ef4e798ed37080d91c47bd5486a8390aac`), cancelled in tx
`0x87f105cccaa5560b975c04b586321838b9de2d22c1790221a608201542ae403d`. The indexer showed the `Deposit`,
`Locked` and `Unlocked` rows when we queried ~30 s after each transaction (`evidence/indexer_bot_account_2026-10-19.json`), and the SDK
shape with `kinds: ["Deposit","Credited","Withdraw"]` returns the one `Deposit` row for this account. So
the failure depends on how much history the account has, not on the query being malformed. The accounts
that fail are the ones a portfolio-return calculation is most useful for.

## Evidence
- Request/response above; `scripts/indexer_timing.sh` in this repo re-runs the table.
- SDK query text: `src/perp/history.ts` lines 1032–1037 (0.32.1).

## Suggested fix
Add a composite index on `MarginEvent (account, kind, timestamp DESC, id)` (or order the SDK query by
the primary key as `LiquidationsQuery` already does, see the comment at history.ts:1041), and return
a distinguishable error (`statement timeout`) instead of the generic `database query error`.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (query text read from source; the request was sent with curl)
- Indexer `https://hideki-dev.smk.somnia.host/v1/graphql`, `chain_metadata.latest_processed_block` ≈ 27,50x,xxx (at chain head)
- Somnia Hideki testnet, chain id 50383
- Date: 2026-10-19, 09:20–09:30 UTC
- Wallet: n/a (read-only); account queried `0x420691db9d2b5a79210fda48c177471386b6dfd1`
