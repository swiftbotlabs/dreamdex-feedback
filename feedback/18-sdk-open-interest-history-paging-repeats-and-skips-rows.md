# SDK: `getOpenInterestHistory` sorts only by `timestamp`, so paging it with `offset` (default page of 100) repeats some rows and never returns others
Severity: normal
Area: SDK

> **Summary.** `client.getOpenInterestHistory(pool, { limit, offset })` is documented as "newest first — paginated", but its
> query orders `OpenInterestSnapshot` by `timestamp` alone. One block can write several snapshots with the same
> timestamp, and the indexer returns those tied rows in a different order depending on `limit`/`offset`. Paging the PUMP
> pool's whole history in the SDK's default pages of 100 returns 2,992 rows but only 2,990 distinct ones: two snapshots
> come back twice and two are never returned. One of the lost rows is the pool's open interest at the end of its block. The
> SDK's own comment on the liquidation query describes this failure and fixes it there, but not here.

> **Checked 2026-10-26, 01:26–03:35 UTC, and again at 04:49 UTC.** By 04:49 UTC PUMP had a newer snapshot, so the
> three rows of block 31777970 sat one position lower (400–402). The page at `offset: 400, limit: 100` returned them as
> `_115`, `_103`, `_109`, and the single 1,000-row read as `_115`, `_109`, `_103`: the server again ordered the tied rows
> differently per request. npm `latest` is still 0.32.1.

`getOpenInterestHistory` (0.32.1, `src/perp/history.ts:1006–1018`, also `src/somniaMarketsClient.ts:3134–3135`):

```ts
/** A perp pool's open-interest history, newest first — paginated. */
export async function getOpenInterestHistory(pool, opts: { limit?: number; offset?: number } = {}, indexerUrl) {
  ... { pool: pool.toLowerCase(), limit: opts.limit ?? 100, offset: opts.offset ?? 0 } ...
```

Its query (`src/perp/history.ts:1097–1104`, the same text in `dist/gql/graphql.js` `OpenInterestHistoryDocument`):

```graphql
OpenInterestSnapshot(where: {pool: {_eq: $pool}}, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {
  id pool openInterest timestamp blockNumber
}
```

Higher up, the same file explains why that sort is not enough (`src/perp/history.ts:1041–1047`, above
`LiquidationsQuery`):

> ORDERED BY A TOTAL KEY, not by `timestamp` alone. Every row a block produces carries that block's timestamp, so a
> timestamp-only sort leaves ties in an order the server may choose differently per request - and an `offset` page
> boundary landing inside one block then skips or repeats a row, silently in the skip case.

The liquidation query uses `order_by: [{timestamp: desc}, {blockNumber: desc}, {id: desc}]` (line 1051), and the
funding-payments query uses `[{timestamp: desc}, {id: desc}]` (line 1024). The bundled `docs/PERPS.md` (lines 905–911)
names both history reads together: "`listFundingRateHistory` / `getOpenInterestHistory` are the append-only counterparts
[...] `listFundingRateHistory` sorts on `timestamp`, then `blockNumber`, then `id` [...] Rows that share a timestamp
therefore come back in the same order on every read." `getOpenInterestHistory` gets no such sort. npm `latest` is still
0.32.1, and the canary 0.32.2-canary.38575926931 sends the same query (`src/perp/history.ts:1100`).

On the documented Hideki indexer this happens in practice. Block 31777970 on PUMP wrote three snapshots (logs 103, 109
and 115 of one transaction), all with timestamp 1792829880. The page at `offset: 300` ends with log 103, and the page at
`offset: 400` starts with log 103 again, then log 109. Log 115 is on neither page. A single read of 1,000 rows lists the
same block as 115, 109, 103 at positions 399–401. So a client that pages the history counts one snapshot twice, never
sees the block's last value, and gets that block's rows oldest first.

Distinct from report 12: 12 is about the `MarginEvent` entity having no block column. This report is about the SDK's
`OpenInterestSnapshot` read. That entity already has `blockNumber`; the SDK query just doesn't sort on it.

## Steps to reproduce
All steps are read-only. Pool PUMP = `0x76c981a52530cdf9497559140aafcd8cd16836e7`. Its newest snapshot was
`…_33195496_44` at every run from 01:26 to 03:34 UTC on 2026-10-26, so its row offsets did not move during these tests.
1. Send the SDK's query to `https://hideki-dev.smk.somnia.host/v1/graphql` three times: `offset: 300, limit: 100`,
   then `offset: 400, limit: 100`, then `offset: 0, limit: 1000`. In each result, find the rows with timestamp
   `1792829880`. `bash evidence/18/oi-paging_curl.sh` does this with curl and jq.
2. Compare one read of 1,000 rows with ten pages of 100 by id, then repeat the paging with a total order as a control:
   `node evidence/18/oi-paging_check.mjs 0x76c981a52530cdf9497559140aafcd8cd16836e7 1000 100 control` (Node 18+, no
   dependencies; the query text is copied verbatim from the 0.32.1 `dist`).
3. Walk the whole PUMP history in SDK-default pages of 100 until a page comes back empty:
   `node evidence/18/oi-paging_check.mjs 0x76c981a52530cdf9497559140aafcd8cd16836e7 walk`.
4. Read the block's `OpenInterestUpdated` logs and `getOpenInterest()` at that block from the RPC:
   `node evidence/18/oi-paging_chain_block.mjs 0x76c981a52530cdf9497559140aafcd8cd16836e7 31777970` (viem 2.x).

If PUMP has new snapshots by the time you run this, the offsets above shift. Step 2 works on any pool whose newest row
stays the same during the run (the script prints it before and after). Whether a pool shows a hit depends on where the
page boundaries fall.

## Expected
Every snapshot comes back exactly once across the pages, in the same newest-first order as a single read.

## Actual
Run 2026-10-26 03:32–03:35 UTC (`evidence/18/oi-paging_run_2026-10-26T0332Z.txt`, `evidence/18/oi-paging_curl_2026-10-26T0335Z.txt`):

```
offset 300 limit 100:   row 99 (absolute 399) …_31777970_103 oi 5353500000000
offset 400 limit 100:   row 0  (absolute 400) …_31777970_103 oi 5353500000000
                        row 1  (absolute 401) …_31777970_109 oi 5826800000000
offset 0   limit 1000:  row 399 …_31777970_115 oi 5858200000000
                        row 400 …_31777970_109 oi 5826800000000
                        row 401 …_31777970_103 oi 5353500000000
```

One read of 1,000 rows against ten pages of 100, the same query, with ids compared:

| pool | order_by | rows paged | distinct | repeated | never returned |
|---|---|---|---|---|---|
| PUMP | SDK `{timestamp: desc}` | 1000 | 998 | `…_31777970_103`, `…_30362653_59` | `…_31777970_115`, `…_30362653_49` |
| PUMP | control `[{timestamp: desc}, {blockNumber: desc}, {id: desc}]` | 1000 | 1000 | none | none |
| 1000PEPE `0xfa9b9e50cc1745113d57893991af200a74c86b6f` | SDK | 1000 | 998 | `…_31439536_100`, `…_30679030_107` | `…_31439536_106`, `…_30679030_101` |
| 1000PEPE | control | 1000 | 1000 | none | none |
| PUMP, 300 rows in pages of 7 | SDK | 300 | 298 | `…_31960996_27`, `…_31960120_74` | `…_31960996_17`, `…_31960120_86` |
| PUMP, 300 rows in pages of 7 | control | 300 | 300 | none | none |

The full walk of PUMP at 03:33 UTC returned 30 pages, 2,992 rows and 2,990 distinct ids. `…_31777970_103` and
`…_30362653_59` came back twice each, and `…_31777970_115` and `…_30362653_49` were never returned.

On chain (`evidence/18/oi-paging_chain_2026-10-26T0334Z.txt`, RPC `https://api.hideki2.infra.testnet.somnia.network`, chain 50383):

```
PUMP block 31777970 (timestamp 1792829880), tx 0xc7b9615d5f2bd50f6c7c4e6661a234be7699606d9f4cdbdd08bb926eedede08a
  logIndex 103 openInterest 5353500000000
  logIndex 109 openInterest 5826800000000
  logIndex 115 openInterest 5858200000000
  getOpenInterest() at end of block 31777970: 5858200000000
1000PEPE block 31439536 (timestamp 1792796026), tx 0x500d40437f93fb8a4d3d94338d0a45468c4ef798c0764a0e2d3d8343ea715c0b
  logIndex 100 openInterest 2285700000000000000000000
  logIndex 106 openInterest 2726200000000000000000000
  getOpenInterest() at end of block 31439536: 2726200000000000000000000
```

In two of the three blocks we checked, the snapshot that paging never returns is the pool's open interest at the end of
the block (PUMP `_115`, 1000PEPE `_106`). In the third (PUMP block 30362653) the lost row is the block's first update,
`_49`, and the end-of-block value `_59` comes back twice.

The result is the same on every run. Earlier runs on 2026-10-26 at 01:26 and 01:53–01:55 UTC gave the same PUMP ids
(`evidence/18/oi-paging_run_2026-10-26T0126Z.txt`, `evidence/18/oi-paging_run_2026-10-26T0153Z.txt`). Those runs also showed
2 repeated / 2 missing on ZRO (`0x2a1822b02039ddf0e293f3f7243673fc03eaf16c`: `…_31751887_27`, OI 13243000000000000000000,
never returned) and 1 / 1 on 1000PEPE, with the control order clean on all three pools. By 03:33 UTC both of those pools
had new rows, which moved the page boundaries. ZRO then came out clean at this page size, and 1000PEPE showed the two
different blocks in the table.

`OpenInterestSnapshot` has no log-index column (fields: `blockNumber id openInterest pool timestamp`,
`evidence/18/oi-paging_schema_2026-10-26T0335Z.txt`). The log index exists only as the suffix of the `id` string
`${pool}_${block}_${logIndex}`.

## Evidence
- `evidence/18/oi-paging_run_2026-10-26T0332Z.txt`: the comparisons, controls, block view and full walk above.
- `evidence/18/oi-paging_curl_2026-10-26T0335Z.txt`: output of `evidence/18/oi-paging_curl.sh` (curl + jq version of step 1).
- `evidence/18/oi-paging_chain_2026-10-26T0334Z.txt`: the on-chain logs and `getOpenInterest()` for the three blocks.
- `evidence/18/oi-paging_run_2026-10-26T0126Z.txt` and `evidence/18/oi-paging_run_2026-10-26T0153Z.txt`: the earlier runs,
  including ZRO.
- `evidence/18/oi-paging_schema_2026-10-26T0335Z.txt`: introspection of `OpenInterestSnapshot`.
- `evidence/18/oi-paging_sdk-source_0.32.1.txt`: `src/perp/history.ts` lines 1006–1018, 1040–1056 and 1095–1104,
  `src/somniaMarketsClient.ts` 3134–3135, `docs/PERPS.md` 905–911, canary line 1100, and `history.ts` line 1024.
  `evidence/18/oi-paging_sdk-0.32.1_dist_OpenInterestHistoryDocument.txt`: the compiled query the SDK sends.
- Scripts: `evidence/18/oi-paging_check.mjs`, `evidence/18/oi-paging_curl.sh`, `evidence/18/oi-paging_chain_block.mjs`.
- The indexer URL is the one the developer page lists for Hideki ("Indexer (GraphQL)",
  `evidence/18/oi-paging_dreamdex-perps-testnet-README_2026-10-26T0331Z.md`, line 12).
- The 0.32.1 tarball's sha512 matched npm `dist.integrity` (`sha512-RfshQP8X…F0Og==`).

## Suggested fix
In `OpenInterestHistoryQuery`, order by a total key, as `LiquidationsQuery` already does:
`order_by: [{timestamp: desc}, {blockNumber: desc}, {id: desc}]`. With that order, the paging in step 2 gave no repeated
and no missing rows on PUMP and 1000PEPE (and on ZRO at 01:54 UTC). The `id` tie-break compares strings, so inside one
block it does not always follow the log index (with `id: desc`, `…_99` comes before `…_103`). Adding a numeric `logIndex` column to `OpenInterestSnapshot`
and sorting on it would let rows within a block come back truly newest first.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (npm `latest`) and 0.32.2-canary.38575926931 (tarballs read as text; not executed;
  the query was sent with Node `fetch` and curl)
- Indexer `https://hideki-dev.smk.somnia.host/v1/graphql` (watermark 33,334,005–33,335,076 during the 03:32–03:34 UTC run)
- RPC `https://api.hideki2.infra.testnet.somnia.network`; Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and SDK)
- Date: 2026-10-26, 01:26–03:35 UTC
- Wallet: n/a (read-only)
