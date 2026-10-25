# Indexer: `MarginEvent` rows have no block number (or log index), so margin flows cannot be read by block, unlike fills, orders and liquidations
Severity: normal
Area: API

> **Summary.** The indexer's `MarginEvent` entity has no `blockNumber` or `logIndex` field, only a seconds `timestamp`.
> At ~10 Hideki blocks per second, the SDK docs' block-windowed flow read cannot be done from the indexer.

> **Re-verified 2026-10-25, 22:44 UTC, Somnia Tokyo testnet (chain 50383).** Introspection still lists `MarginEvent` as `account amount granter id kind pool timestamp txHash`. Selecting or filtering `blockNumber` fails with `field 'blockNumber' not found in type: 'MarginEvent'` / `'MarginEvent_bool_exp'`, while `Fill`, `Order` and `LiquidationEvent` carry block fields. Ten blocks still share one timestamp second. Evidence: `evidence/margin_event_fields_2026-10-25T2244Z.txt`.

**Distinct from report 05:** 05 is the docs recipe passing options that SDK 0.32.1 does not have (fix: the docs or the
SDK's option types). This report is the indexer schema: even an SDK that accepted `sinceBlock`/`toBlock` would have no
column to filter on (fix: add `blockNumber` and `logIndex` to the `MarginEvent` entity). Different component, different fix.

The SDK's Perps guide ("Account equity for scoring is one read", `/markets/somnia-markets/typescript/perps`, also in
`llms-full.txt`) builds competition scoring on block-exact margin flows:

> Each snapshot carries `asOfBlock`, and the read at block `a` already includes every flow in block `a`, so the flows to
> remove are those in blocks `a + 1` to `b`, both included.

> The margin events come back in block, then log index order [...] so the reads are stable

The same page shows why the block field matters, for other rows: "A liquidation row carries its `blockNumber`, so keep
the rows in `a + 1` to `b`. A fee row carries only a `timestamp`, so a builder fee close to either snapshot cannot be
placed exactly." On the deployed indexer, `MarginEvent` is in the fee-row situation. Its fields are `account amount
granter id kind pool timestamp txHash`, while `Fill` has `blockNumber` and `logIndex`, `Order` has `placedAtBlock` and
`lastUpdatedAtBlock`, and `LiquidationEvent` has `blockNumber`. (The log index survives only as the suffix of the `id`
string, `${txHash}_${logIndex}`, which a query cannot sort numerically.) Hideki makes about 10 blocks per second (blocks
27699368–27699377 all have timestamp 1792421765), so a timestamp filter cannot put a deposit made in the same second as a
snapshot block on the right side of it. The only exact route is one `eth_getTransactionReceipt` per row (txHash →
block), which does not scale to accounts with more than 100k rows (see report 04).

## Steps to reproduce
1. Introspect the entity on `https://hideki-dev.smk.somnia.host/v1/graphql`:
   `{ __type(name:"MarginEvent") { fields { name } } }`, and the same for `Fill`, `Order` and `LiquidationEvent`.
2. Select and filter by block:
   `{ MarginEvent(limit:1) { id blockNumber } }` and `{ MarginEvent(where:{blockNumber:{_gte:27700000}}, limit:1) { id } }`.
3. Take a real row (our deposit, tx `0x50811a18…ec82`), read its block from the RPC (`eth_getTransactionReceipt` on
   `https://api.hideki2.infra.testnet.somnia.network`), and count the blocks that share its timestamp.

`bash scripts/margin_event_fields.sh` runs all three (read-only).

## Expected
`MarginEvent` rows carry `blockNumber` (and `logIndex`) and accept a `blockNumber` filter, like `Fill` and
`LiquidationEvent`, so margin flows can be read for blocks `a + 1` to `b` and ordered by block, then log index, as the
docs describe.

## Actual
Run 2026-10-20 03:36 UTC (`evidence/margin_event_fields_2026-10-20T0337Z.txt`):

| entity | block / ordering fields |
|---|---|
| `MarginEvent` | none (fields: `account amount granter id kind pool timestamp txHash`) |
| `Fill` | `blockNumber`, `logIndex` |
| `Order` | `placedAtBlock`, `lastUpdatedAtBlock` |
| `LiquidationEvent` | `blockNumber` |

```
{"errors":[{"message":"field 'blockNumber' not found in type: 'MarginEvent'","extensions":{"path":"$.selectionSet.MarginEvent.selectionSet.blockNumber","code":"validation-failed"}}]}
{"errors":[{"message":"field 'blockNumber' not found in type: 'MarginEvent_bool_exp'","extensions":{"path":"$.selectionSet.MarginEvent.args.where.blockNumber","code":"validation-failed"}}]}
```

Our `Deposit` row: `id 0x50811a18…ec82_10`, `timestamp 1792421765`, no block. The RPC receipt puts it in block
27699377, and blocks 27699368–27699377 (10 blocks) share that timestamp.

## Evidence
- `evidence/margin_event_fields_2026-10-20T0337Z.txt`: the introspection, both validation errors, the row, the receipt and
  the block count.
- SDK 0.32.1 `src/perp/history.ts`: the `MarginEvent` type (lines 123–144, "mirror of the indexer `MarginEvent` entity")
  has no block field, while `LiquidationEvent` has `blockNumber` (line 379). `MarginEventsQuery` orders by `timestamp`
  only (line 1034), while the liquidation query orders by `timestamp`, `blockNumber`, `id` (line 1051).
- Docs quotes above: `https://somnia-platform-explorer.vercel.app/markets/llms-full.txt`, fetched 2026-10-20 03:30 UTC.

## Suggested fix
Add `blockNumber` and `logIndex` columns to the `MarginEvent` entity (the handler already uses the log index to build the
`id`) and allow filtering and ordering on them. Then the SDK can add `sinceBlock`/`toBlock` to `getMarginEvents` (report 05) and order its
query by block and log index, as the docs already describe.

## Environment
- Indexer `https://hideki-dev.smk.somnia.host/v1/graphql` (`chain_metadata.chain_id` 50383, at the chain head)
- RPC `https://api.hideki2.infra.testnet.somnia.network`; Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and SDK)
- `@somnia-chain/markets-sdk` 0.32.1 (types read from source; not executed)
- Date: 2026-10-20, 03:20–03:40 UTC
- Wallet: n/a (read-only); row shown belongs to `0x2A11e7388D1D2F9690f2636846d44b478f61bF08`
- Re-verified 2026-10-25 UTC on Somnia Tokyo testnet (see the note under the summary)
