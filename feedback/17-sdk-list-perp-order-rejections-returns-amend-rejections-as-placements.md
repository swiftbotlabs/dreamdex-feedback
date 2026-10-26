# SDK: `listPerpOrderRejections` returns `amendOrders` rejections (`AmendRejected`) as if they were batch-placement refusals. It drops the indexer's `isAmend` and `oldOrderId`, and its docs say amend rows (and reason `None`) cannot appear
Severity: normal
Area: SDK

> **Summary.** The indexer's `PerpOrderRejection` table holds two kinds of row. `placeOrders` refusals (`OrderRejected`)
> have `isAmend = false`. `amendOrders` / `amendOrdersFor` refusals (`AmendRejected`) have `isAmend = true` and an
> `oldOrderId`. SDK 0.32.1 `client.listPerpOrderRejections` selects neither column and has no filter for them. It returns
> amend rows as "orders refused inside a batch placement", which its own TSDoc says is the only thing the read holds. A
> caller cannot tell a refused placement from a refused amend. For an owner who re-quotes with `amendOrders`, every row
> returned is an amend row.

> **Checked 2026-10-26, 01:24–03:29 UTC, Somnia Tokyo testnet (chain 50383).** npm `latest` is still 0.32.1, and the local
> tarball's sha512 matches the registry. The canary `0.32.2-canary.38575926931.ge4550933d36d` has the same query and the
> same TSDoc. The live `https://app.dreamdex.io/llms-full.txt` (fetched 03:27 UTC) mentions neither `AmendRejected` nor
> `isAmend`. Step 2 below, re-run at 04:48 UTC, still returns both `0x440e…438b` rows with `isAmend: true`. Evidence: `evidence/17/recheck_2026-10-26T0327Z.txt`, `evidence/17/order_rejections_curl_2026-10-26T0329Z.txt`,
> `evidence/17/docs_sdk_check_2026-10-26T0327Z.txt`.

**Overlaps / first-seen:** a252937166 `feedback/003-amend-rejection-history.md` reports the same defect (the SDK dropping `isAmend`/`oldOrderId` from `listPerpOrderRejections`). Ours was filed first — 2026-10-26 05:30 UTC (commit `326d56c`) vs their 05:41 UTC — and adds the decoded on-chain `AmendRejected` logs and the whole-table counts.

`client.listPerpOrderRejections({ owner, pool, reason, limit, offset })` sends this query (`src/perp/history.ts:1189–1195`,
same select in `dist/perp/history.js:434`):

```graphql
query PerpOrderRejections($where: PerpOrderRejection_bool_exp!, $limit: Int, $offset: Int) {
  _sdkWatermark: chain_metadata { chain_id latest_processed_block }
  PerpOrderRejection(where: $where, order_by: [{blockNumber: desc}, {id: desc}], limit: $limit, offset: $offset) {
    id owner pool reason requestIndex timestamp blockNumber txHash
  }
}
```

The indexer entity also has `isAmend` and `oldOrderId`. The SDK's generated types know both columns
(`PerpOrderRejection_bool_exp`, `src/gql/graphql.ts:2091–2092`), but the read neither selects nor filters on them. The
TSDoc describes a placement-only history:

- `history.ts:1108`: "`placeOrders` / `placeOrdersFor` ONLY."
- `history.ts:1138`: "**Batch placements only.**" (also `somniaMarketsClient.ts:3036–3041`: "Orders refused inside a
  BATCH placement ... `placeOrders` / `placeOrdersFor` only").
- `history.ts:1144` and `:1204`: "There is no `Order` row to join to: a rejected request never rested and never filled."
  It says to pair `requestIndex` "with the batch the caller submitted".
- `history.ts:1116–1117`: "Index 0 is `None`, which is NOT a rejection: it means the order rested or filled. It cannot
  appear on a PerpOrderRejection row".

The dreamDEX developer page (`/docs/developers/perps-testnet`, "An IOC that fills nothing reverts") presents this read
the same way. A refused batch entry's "`OrderRejected` log carries reason `5`, which `client.listPerpOrderRejections`
returns by name." The contract types page (`/docs/developers/contracts/types`) lists `None` | `0` as "never emitted; the
zero value".

On the deployed indexer, 16,856 rows are amend rows (`isAmend = true`), from 406 owners on 15 pools. In each of the
three rows checked below, the transaction called `amendOrders` or `amendOrdersFor` and logged `AmendRejected`, not
`OrderRejected`. The SDK returns these rows with nothing to mark them as amends:

- Their `requestIndex` is a position in the `amendments` array of an `amendOrders` call (`docs/SPOT.md:215`). It is not a
  position in a placement batch, so a caller who pairs it with its `placeOrders` call, as the TSDoc says, maps it to the
  wrong request.
- When `oldOrderId` is non-zero (all but 80 of the 16,856 amend rows), it names an existing `Order` row: the order the
  amend tried to replace.
- Their `reason` code is named with the placement table `PERP_ORDER_REJECTION_REASON`. The SDK's own `docs/SPOT.md:216`
  says that for `AmendRejected` "the SDK does not export a name table for it".
- The only row in the whole table with reason `0` is an amend row. The SDK returns it as `reason: "None"`.

The `reason` filter does not help a caller split the two kinds: reason 3 (`PostOnlyWouldCross`) is the most common reason
in both.

This report is about the read and its docs, not about what `amendOrders` does on-chain. Whatever the pool does with a
refused amendment, the indexer stores `isAmend` and `oldOrderId` for it, and the SDK drops both.

## Steps to reproduce
1. Send the SDK's query document with the variables `listPerpOrderRejections({ owner: "0x440e03bb3aadbe65d5bf2ad7f84a64c509ff438b" })`
   builds (`limit 50`, `offset 0`):

```
curl -s https://hideki-dev.smk.somnia.host/v1/graphql -H 'content-type: application/json' --data '{"query":"query PerpOrderRejections($where: PerpOrderRejection_bool_exp!, $limit: Int, $offset: Int) { _sdkWatermark: chain_metadata { chain_id latest_processed_block } PerpOrderRejection(where: $where, order_by: [{blockNumber: desc}, {id: desc}], limit: $limit, offset: $offset) { id owner pool reason requestIndex timestamp blockNumber txHash } }","variables":{"where":{"owner":{"_eq":"0x440e03bb3aadbe65d5bf2ad7f84a64c509ff438b"}},"limit":50,"offset":0}}'
```

2. Read the same rows with the two columns the SDK leaves out:

```
curl -s https://hideki-dev.smk.somnia.host/v1/graphql -H 'content-type: application/json' --data '{"query":"{ PerpOrderRejection(where: {owner: {_eq: \"0x440e03bb3aadbe65d5bf2ad7f84a64c509ff438b\"}}, order_by: [{blockNumber: desc}, {id: desc}]) { id reason requestIndex blockNumber isAmend oldOrderId } }"}'
```

3. Look up both transactions on the RPC `https://api.hideki2.infra.testnet.somnia.network` (`eth_getTransactionByHash`
   and `eth_getTransactionReceipt`). Compare them with a real placement refusal, tx
   `0xacc5d5e968716e67d5359d71fde00d7b67bef6022a711ae187909859023bb128`. Selectors: `0xddb300e4` = `amendOrders(...)`,
   `0xd89b1396` = `amendOrdersFor(...)` and `0x24ea3d1f` = `placeOrders(...)`. Topics: `0x301df543…` =
   `AmendRejected(address,uint128,uint8,uint256)` and `0xa8d29afa…` = `OrderRejected(address,uint8,uint256)`.
4. Repeat step 2 for owner `0xdba45e5480fc0f365d36e79a2e9eacdb98ac44f9` with `limit: 50` (the SDK default), and again with
   `isAmend: {_eq: false}` added to `where`.
5. Read SDK 0.32.1 `src/perp/history.ts` lines 1106–1145, 1189–1195, 1200–1205 and 1225–1250, and `docs/SPOT.md` lines
   212–216.

`bash evidence/17/order_rejections_curl.sh` runs steps 1–4 (curl and jq, read-only). `node evidence/17/recheck_order_rejections.mjs`
(viem 2.57.7) also decodes the calldata and logs, applies the SDK's name mapping and counts the amend rows.

## Expected
`listPerpOrderRejections` returns only `placeOrders` / `placeOrdersFor` refusals, as its TSDoc and the developer page
say. Or it returns `isAmend` and `oldOrderId` for each row, can filter on them, and the docs say that amend refusals are
included.

## Actual
Run 2026-10-26 03:27–03:29 UTC (`evidence/17/recheck_2026-10-26T0327Z.txt`, indexer `latest_processed_block` 33330933).

Owner `0x440e…438b`: the SDK query returns 2 rows. As the SDK maps them, and with the hidden columns added:

| row id | SDK `reason` (`reasonRaw`) | `requestIndex` | block | `isAmend` | `oldOrderId` |
|---|---|---|---|---|---|
| `0xa1b322ee…a887c_42` | `None` (0) | 0 | 28950329 | true | 14941862699704743729270 |
| `0xd4ca61aa…8382bab_63` | `PostOnlyWouldCross` (3) | 0 | 28950325 | true | 14941862699704743729270 |

On-chain, both are amends, not placements:

```
TX 0xd4ca61aada9f748782097974553b72cf00c5a83624c2a6e3510c8ca8d8382bab
  block 28950325 status success from 0x440e03bb3aadbe65d5bf2ad7f84a64c509ff438b to 0xb483ec1fb34996638677c20ab087b16f1896fa53 selector 0xddb300e4
  decoded: amendOrders requests [{"oldOrderId":"14941862699704743729270","alwaysPlace":false,"orderType":3,"isBid":true}]
  log 62 addr 0xb483ec1fb34996638677c20ab087b16f1896fa53 OrderCancelled(uint128) orderId 14941862699704743729270
  log 63 addr 0xb483ec1fb34996638677c20ab087b16f1896fa53 AmendRejected(address,uint128,uint8,uint256) owner 0x440e03bb3aadbe65d5bf2ad7f84a64c509ff438b oldOrderId 14941862699704743729270 reason 3 requestIndex 0
TX 0xa1b322ee5a1c8883e08ec196bfa49bc3e06857cf8444d72b5ab83f9d206a887c
  block 28950329 status success from 0x440e03bb3aadbe65d5bf2ad7f84a64c509ff438b to 0xb483ec1fb34996638677c20ab087b16f1896fa53 selector 0xddb300e4
  decoded: amendOrders requests [{"oldOrderId":"14941862699704743729270","alwaysPlace":false,"orderType":0,"isBid":true}]
  log 42 addr 0xb483ec1fb34996638677c20ab087b16f1896fa53 AmendRejected(address,uint128,uint8,uint256) owner 0x440e03bb3aadbe65d5bf2ad7f84a64c509ff438b oldOrderId 14941862699704743729270 reason 0 requestIndex 0
```

The `oldOrderId` is an existing `Order` row (the TSDoc says there is none to join to):
`{"id":"0xb483ec1fb34996638677c20ab087b16f1896fa53_14941862699704743729270","owner":"0x440e03bb3aadbe65d5bf2ad7f84a64c509ff438b","status":"Cancelled","fullQuantity":"100000000","filledQuantity":"0","placedAtBlock":"28950307","lastUpdatedAtBlock":"28950325"}`.
The first amend cancelled that order (log 62). The second amend targeted the same, already cancelled order with
`alwaysPlace: false`, and the pool logged `AmendRejected` with reason 0. That is the only reason-0 row in the table, and
the SDK names it `None`, which its TSDoc says "means the order rested or filled". Pool `0xb483ec1f…` is the SOL/USDso perp
market.

Control (a real batch-placement refusal): tx `0xacc5d5e9…` (block 33232851) calls `placeOrders` (`0x24ea3d1f`). Its log 15
is `OrderRejected` reason 5, and its row `…_15` has `isAmend: false`, `oldOrderId: null`.

Owner `0xdba45e…44f9`: the newest 50 rows (the SDK default page) are `isAmend: true` 50 of 50. The owner has 0 rows with
`isAmend: false`. Its newest row comes from tx `0x58778fdc…31a2` (block 30509340), which calls `amendOrdersFor`
(`0xd89b1396`) and logs two `AmendRejected` (reason 3, `requestIndex` 0 and 1).

Whole table: `isAmend = true` has 16,856 rows, by reason `{0: 1, 1: 6, 2: 2, 3: 16847}`. 80 of them have `oldOrderId` `"0"`.
They come from 406 owners on 15 pools. The 16,856 total was the same at 01:24, 01:48 and 03:27 UTC. A full count at 01:25 UTC found
204,024 `isAmend = false` rows, by reason `{1: 3, 2: 186, 3: 188554, 4: 1, 5: 15280}`
(`evidence/17/order_rejections_table_counts_2026-10-26T0124Z.txt`).

## Evidence
- `evidence/17/recheck_2026-10-26T0327Z.txt`: the SDK query and its mapped output, the hidden columns, owner `0xdba45e`, the
  control row, the `Order` row, the reason-0 rows, the amend-row count and the four decoded transactions. The script that
  produced it is `evidence/17/recheck_order_rejections.mjs` (read-only).
- `evidence/17/order_rejections_curl_2026-10-26T0329Z.txt`: the output of `evidence/17/order_rejections_curl.sh` (steps 1–4).
- `evidence/17/order_rejections_table_counts_2026-10-26T0124Z.txt`: the first run (01:24–01:25 UTC), with both whole-table counts.
- `evidence/17/docs_sdk_check_2026-10-26T0327Z.txt`: the live `llms-full.txt` (line 3799 for `listPerpOrderRejections`, line
  2321 for `None`; 0 matches for `AmendRejected` and `isAmend`), npm dist-tags, the tarball integrity, and the quoted
  SDK lines in 0.32.1 and in the canary.
- SDK 0.32.1 source: `src/perp/history.ts` 1108, 1116–1117, 1138, 1144, 1192, 1204, 1232; `src/somniaMarketsClient.ts`
  3036–3041; `src/gql/graphql.ts` 2091–2092; `dist/perp/history.js` 434; `docs/SPOT.md` 212–216.

## Suggested fix
1. Select `isAmend` and `oldOrderId` in `PerpOrderRejectionsQuery` and return them on `PerpOrderRejection`, for example as
   `kind: "placement" | "amend"` plus `oldOrderId`.
2. Add an `isAmend` option to `listPerpOrderRejections`. Either default it to `false`, which keeps the documented
   placement-only contract, and add a separate amend read, or document that both kinds come back.
3. Update the TSDoc (`history.ts` 1106–1145, 1200–1205, 1232; `somniaMarketsClient.ts` 3036–3046) and the developer docs.
   Say that amend rows exist, that their `requestIndex` indexes the `amendments` array, and that `oldOrderId` points at an
   `Order` row. Say which name table applies to an `AmendRejected` reason, and what reason `0` means there (the types page
   says `None` is never emitted).

## Environment
- Indexer `https://hideki-dev.smk.somnia.host/v1/graphql` (`chain_metadata.chain_id` 50383, `latest_processed_block`
  33330933 at 03:27 UTC)
- RPC `https://api.hideki2.infra.testnet.somnia.network`; Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and SDK)
- `@somnia-chain/markets-sdk` 0.32.1 (npm `latest`; tarball sha512 matches the registry) and
  `0.32.2-canary.38575926931.ge4550933d36d`. We read the source and sent its query document as-is; we did not run the package.
- Docs: `https://app.dreamdex.io/llms-full.txt`, pages `/docs/developers/perps-testnet` and `/docs/developers/contracts/types`,
  fetched 2026-10-26 03:27 UTC
- Date: 2026-10-26, 01:24–03:29 UTC
- Wallet: n/a (read-only). The rows shown belong to other accounts (`0x440e…438b`, `0xdba45e…44f9`, and `0x8239…2e68` for the control row).
