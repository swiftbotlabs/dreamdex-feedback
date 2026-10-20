# Indexer: the SDK's `MarginEvents` query (account + `kinds` filter, newest first) fails with "database query error" for half of the high-activity accounts
Severity: major
Area: API

> **Summary.** `client.getMarginEvents(account, { kinds })`, the read behind the documented portfolio-return recipe, fails
> every time after ~10.5 s with a generic `database query error` for 5 of the 10 busiest accounts we tested (all >100k rows).

**Distinct from report 05:** this is indexer performance (the query is valid and returns correct rows for small
accounts; fix: an index or a different sort). Report 05 is a docs-vs-SDK mismatch in the recipe's options (fix: the docs
or the SDK's option types). Different component, different fix.

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
Ordinary traders with a few rows are not affected; market makers and long-running bots, the users
the bounty targets, are (see the account table below).

## Steps to reproduce
1. Pick an active account, e.g. `0x420691db9d2b5a79210fda48c177471386b6dfd1` (a market maker that
   produces many `Locked`/`Unlocked` rows).
2. POST the SDK's query to `https://hideki-dev.smk.somnia.host/v1/graphql`:

```
curl -s -m 60 -H 'content-type: application/json' https://hideki-dev.smk.somnia.host/v1/graphql --data '{"query":"query MarginEvents($where: MarginEvent_bool_exp!, $limit: Int, $offset: Int) { MarginEvent(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { id account kind pool amount granter timestamp txHash } }","variables":{"where":{"account":{"_eq":"0x420691db9d2b5a79210fda48c177471386b6dfd1"},"kind":{"_in":["Deposit","Credited","Withdraw"]}},"limit":50,"offset":0}}'
```

3. Repeat a few times; then vary the shape (no `order_by`; `order_by: {id: desc}`; no `kind`).
4. Run the same query for other busy accounts: `bash scripts/indexer_accounts.sh <account...>` (table below).

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

The SDK wraps the failure as an indexer error; nothing in the response says "timeout", so a caller
cannot tell a transient outage from this deterministic failure.

### Re-check 2026-10-19 15:04 UTC: still failing, and shown against an account with real events of our own
`scripts/indexer_timing.sh` re-run (`evidence/indexer_timing_2026-10-19T1504Z.txt`):

| query shape | `0x4206…dfd1` (active) | `0x2A11…bF08` (ours, 2 rows) |
|---|---|---|
| SDK shape: account + kinds D/C/W + `order_by timestamp desc` | 10.79 s ERROR, 11.20 s ERROR, 11.12 s ERROR | 2.44 s ok, 1.79 s ok, 1.09 s ok |
| account only, ts desc | 1.54 s ok | 1.67 s ok |
| same filter, `order_by {id: desc}` / no `order_by` | 5.85 s ok / 3.89 s ok | — |

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

### Added 2026-10-20: which accounts fail
We took the 10 most active accounts in 6,000 `MarginEvent` rows sampled over the last 14 days, plus two quiet accounts,
and ran the SDK query (`kinds` Deposit/Credited/Withdraw, `order_by timestamp desc`, limit 50) for each, twice
(03:28 and 03:34 UTC, `bash scripts/indexer_accounts.sh`, output in `evidence/indexer_accounts_2026-10-20T0328Z.txt`).
"> 100k rows" means `offset: 100000` returned a row.

| account | rows | SDK query, pass 1 | SDK query, pass 2 |
|---|---|---|---|
| `0x420691db9d2b5a79210fda48c177471386b6dfd1` | > 100k | 13.67 s ERROR | 10.40 s ERROR |
| `0x47537e3a3ea6e9391f3b26ea45618db6828c8bff` | > 100k | 10.48 s ERROR | 10.82 s ERROR |
| `0x3024ad2acd22f31ce2c8ea37b7837d530ca46e50` | > 100k | 10.90 s ERROR | 10.64 s ERROR |
| `0x72b1b17dcb3655a7872c5fa1b8723bfd1a0054d2` | > 100k | 10.65 s ERROR | 10.56 s ERROR |
| `0x44718499bcd05ccf9a9d9fc9c32b5ae4b8013f6d` | > 100k | 10.57 s ERROR | 10.50 s ERROR |
| `0xfa5f80c0bb94e4a5016f883a7e86070ae7e1fb5a` | > 100k | 3.45 s ok | 2.62 s ok |
| `0x79b3372680cc5f7b626947e6e09eef3c646af7ac` | > 100k | 1.61 s ok | 1.30 s ok |
| `0xab8b612548cc3f5f9f7e723823be37058d0110b2` | > 100k | 3.49 s ok | 2.12 s ok |
| `0xe8c0d36d69a10bea8d00fe45a2fde45527eda984` | > 100k | 2.15 s ok | 2.22 s ok |
| `0x4e42d094f9d066a013a98a61b34690c882d1f896` | > 100k | 1.09 s ok | 1.13 s ok |
| `0x567476bd43ff20e6aa44e18abfbdb58280563f45` (quiet) | 2 | 0.64 s ok | 0.55 s ok |
| `0x2a11e7388d1d2f9690f2636846d44b478f61bf08` (ours) | 3 | 0.48 s ok | 0.51 s ok |

So 5 of the 10 busy accounts fail on both passes, the other 5 and both quiet accounts succeed on both. Workarounds exist
(`order_by: {id: desc}`, or filtering `kind` on the client), but the SDK offers neither.

Related, same family: `MarginEvent(distinct_on: kind)` and `MarginEvent_aggregate(where: {account: …}) { aggregate { count } }`
also return `database query error` (2026-10-19 09:2x UTC: 3/3 and 0.52 s; 15:04 UTC: 11.70 s and 1.81 s,
`evidence/indexer_timing_2026-10-19T1504Z.txt`). The SDK does not send these shapes.

## Evidence
- Request/response above; `scripts/indexer_timing.sh` in this repo re-runs the first table, `scripts/indexer_accounts.sh`
  the account table.
- Re-check 2026-10-20 02:35 UTC: 3/3 `ERROR` at ~10.5 s for `0x4206…dfd1` (`evidence/recheck_2026-10-20T0235Z.txt`).
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
- Wallet: n/a (read-only); accounts queried: `0x420691db9d2b5a79210fda48c177471386b6dfd1` and the 11 in the account table

## Corrections
- **Corrected 2026-10-20.** Added the 12-account table (5 of 10 busy accounts fail, measured twice) and stated the scope
  honestly: quiet accounts are not affected. Changed the title from "for an active account" to match. Area is now `API`
  only (the SDK only sends the query). Moved the `distinct_on` / `_aggregate` results into one "Related" note, since the SDK
  does not use them. Added the summary and the "Distinct from report 05" paragraph.
