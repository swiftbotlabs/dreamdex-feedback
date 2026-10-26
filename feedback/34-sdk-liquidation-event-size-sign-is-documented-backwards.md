# SDK: the `LiquidationEvent.size` TSDoc says the sign of a `PositionLiquidated` row "is the side being closed", but liquidating a long gives a negative size and a short a positive one (105 of 105 rows checked); `PositionTakenOver` / `PositionTransferred` rows in the same field carry the position's own sign instead
Severity: normal
Area: SDK

> **Summary.** `client.listLiquidations`, `client.listLiveLiquidations` and `useLiveLiquidations` return
> `LiquidationEvent` rows. The SDK documents their `size` field as "Signed, not absolute: `PositionLiquidated` emits a
> signed `sizeDelta`, and the sign is the side being closed." Everywhere else in the SDK a signed size means
> positive = long, negative = short. On chain it is the other way round: `sizeDelta` is the change to the position, so
> a liquidated LONG gives a NEGATIVE `size` and a liquidated short a positive one. Rows of kind `PositionTakenOver` and
> `PositionTransferred` in the same column carry the position's own signed size instead. The SDK documents neither
> real rule. A builder who follows the TSDoc labels every liquidated long as a short. The dreamDEX app's own bundle uses the
> opposite mapping for `PositionLiquidated`, and a different mapping for `PositionTakenOver`.

> **Checked 2026-10-26, 06:08–07:21 UTC.** npm `latest` is still 0.32.1 (dist-tags read at 07:18 UTC). The local
> tarball's sha512 matches the registry. The canary `0.32.2-canary.38575926931.ge4550933d36d` has the same sentence in
> the same four places. The dreamDEX docs (`llms-full.txt`, the contracts events page, the perps-testnet page) never
> mention `PositionLiquidated` or `sizeDelta`, so the TSDoc is the only definition a builder gets. Evidence:
> `evidence/34/check_rows_2026-10-26T0719Z.txt`, `evidence/34/cast_curl_2026-10-26T0721Z.txt`,
> `evidence/34/verify_sign_80_2026-10-26T0637Z.txt`, `evidence/34/sdk_docs_app_excerpts.txt`.

`LiquidationEvent.size` in `@somnia-chain/markets-sdk` 0.32.1 (`src/perp/history.ts:248–254`, shipped as
`dist/perp/history.d.ts:203–207`):

```ts
  /**
   *  Signed size for the leg, where the event carries one (raw base units).
   *
   *  Signed, not absolute: `PositionLiquidated` emits a signed `sizeDelta`, and the sign
   *  is the side being closed.
   */
  size: string | null;
```

The live store says the same where it builds these rows from `LiquidationEngine.PositionLiquidated`
(`src/perp/plane.ts:36–45`, shipped as `dist/perp/plane.js:26–28`):

```ts
    case "PositionLiquidated":
      // `sizeDelta` is a SIGNED int128 and the sign is the side being closed — pass it
      // through rather than taking a magnitude.
      writeLiquidation(
        ev,
        ev.eventName,
        ev.args.account,
        { pool: ev.args.perpPool, size: ev.args.sizeDelta, price: ev.args.markPrice },
        store,
      );
```

Neither read changes the value: `listLiquidations` returns the indexer's `size` as-is
(`src/perp/history.ts:817`), and the live store passes `ev.args.sizeDelta` through (`plane.ts:43`).

Every other signed size in the SDK is positive = long, negative = short. `PerpPosition.size` (`src/perp/state.ts:455`,
`461`, `530`), `src/perp/margin.ts:602` and `869`, the ADL queue (`src/perp/adl.ts:89`) and `sizeBefore` on position
updates (`src/perp/history.ts:1306`) all say so. So "the sign is the side being closed" reads as: positive = a long
was closed, negative = a short was closed.

The chain shows the reverse. `PositionLiquidated.sizeDelta` is `position after − position before`:

- A long reduced by liquidation gives a negative `size`, and a short gives a positive one. This held for the newest 80
  `PositionLiquidated` rows (13 pools) and the oldest 25 rows, 105 of 105.
- In all 105 rows, `size` equals `getPosition(account, pool)` at the block minus the same read at block − 1. On partial
  liquidations, `size` is the part closed, not the position. Example: HYPE row `0x7932ea62…_118`, position
  −674,680,000 → −214,400,000, `size` +460,280,000.
- The raw `PositionLiquidated` log decoded from each receipt matched the indexer row in every case (86 of 86 and 31 of 31
  rows, including the takeover and transfer rows), so this is the contract's convention, not an indexer error.

The same column uses a different rule for the stage-4 legs. The indexer holds 3 `PositionTakenOver` and 3
`PositionTransferred` rows (all of them, read at 06:37 UTC). All 6 closed SHORT positions, and all carry a NEGATIVE
`size`: the position's own signed size, not the change. For tx `0x170891a3…`, `getPosition` before is −227,770,000,000,
after is 0, and both rows have `size` −227,770,000,000 (a delta would be +227,770,000,000). So within one field, a
negative `size` means "a long was closed" on a `PositionLiquidated` row and "a short was closed" on a
`PositionTakenOver` row. The SDK's Perps guide recommends reading these kinds together for a wallet view
(`docs/PERPS.md:1070–1077`: `kinds: ["PositionLiquidated", "PositionTakenOver", "AutoDeleveraged"]`) and does not say
that their signs mean different things.

The dreamDEX app knows both rules. Its liquidation-leg code in
`https://app.testnet.dreamdex.io/_next/static/immutable/chunks/3w46wu70iystk.js` (fetched 06:40 UTC, sha256
`7676aa31…a32a7d`) maps `size > 0` per kind:

```js
closedSide:function(e,t,r){if("PositionLiquidated"===e)return t?"short":"long";if("PositionTakenOver"===e)return t?"long":"short";let n=t?"short":"long";return"liquidated"===r?n:"short"===n?"long":"short"}(e.kind,s>0n,n)
```

and labels the leg from it (`"long"===e.closedSide?"Close Long":"Close Short"`, then `Liquidation: ${t}` for
`PositionLiquidated`). So for BTC row `0x3d5d323c…_95` (`size` −24,010,000, a long), the app's code computes
"Liquidation: Close Long". A builder who follows the SDK's TSDoc computes "short".

A reader could take "the side being closed" to mean the direction of the closing trade (a sell is negative). That
reading fits `PositionLiquidated`, but not `PositionTakenOver` / `PositionTransferred`, whose shorts are negative too.
It also conflicts with the SDK's positive = long rule for every other signed size. The app needed a per-kind rule to get
this right, and the SDK documents no correct rule for either kind.

## Steps to reproduce
Read-only. No transactions are needed.

1. `npm pack @somnia-chain/markets-sdk@0.32.1` into an empty directory. Read `package/src/perp/history.ts` lines
   248–254, `package/dist/perp/history.d.ts` line 206, `package/src/perp/plane.ts` lines 36–45 and
   `package/docs/PERPS.md` lines 1070–1082.
2. Read one liquidation row from the indexer the SDK uses for Tokyo:
   ```
   curl -s https://hideki-dev.smk.somnia.host/v1/graphql -H 'content-type: application/json' --data '{"query":"{ LiquidationEvent(where:{id:{_in:[\"0x3d5d323c5a051b2ff6f822893483468e1ebf3b2dc8ceed0f6750c98f29b93247_95\",\"0x7932ea624f435573a64180d769f5031f151e4c583b5c30ff0f0e33b3c55df5b1_118\",\"0x170891a3829d9362c44805fbbcf3ea8b02747c7c129a1cf57eeb1d00927f855e_87\"]}}, order_by:{blockNumber:desc}){ id kind account pool size price blockNumber } }"}'
   ```
3. Read the liquidated account's position just before and at that block (MarginBank on the perps-testnet page):
   ```
   RPC=https://api.hideki2.infra.testnet.somnia.network
   MB=0x478769E1177C0773c43A593DCCc4Ad15F15F1394
   cast call --block 33346995 $MB 'getPosition(address,address)((int128,uint128,int256,uint64))' 0xea377c343ea8b4d2c718b71f4fe7a09e2a95931b 0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0 --rpc-url $RPC
   cast call --block 33346996 $MB 'getPosition(address,address)((int128,uint128,int256,uint64))' 0xea377c343ea8b4d2c718b71f4fe7a09e2a95931b 0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0 --rpc-url $RPC
   cast call --block 28537566 $MB 'getPosition(address,address)((int128,uint128,int256,uint64))' 0x671846a0c593e8685342dae71da9c25fd8b8ce16 0xB483ec1fb34996638677c20ab087b16F1896FA53 --rpc-url $RPC
   ```
4. Optionally decode the raw log. In tx `0x3d5d323c…b93247`, log index 95 (`0x5f`) comes from LiquidationEngine
   `0xA66d3C24Ad4a389d863846905D8173e1017e9F4D`, with topic0 `0x93081d01…` = `PositionLiquidated(address,address,int128,uint256)`.
   `cast decode-abi --input 'x(int128,uint256)' <data>` gives `sizeDelta` −24010000.
5. To check every row and not just one: `node evidence/34/check_rows.mjs <txHash>…` decodes one tx's liquidation legs.
   `node evidence/34/verify_sign.mjs 80` and `node evidence/34/verify_sign_oldest.mjs 25` tally the newest 80 and the oldest
   25 `PositionLiquidated` rows plus all takeover/transfer rows. All scripts use viem 2.57.7 and make only
   `eth_getTransactionReceipt`, `eth_call` and indexer GraphQL reads.
6. Fetch `https://app.testnet.dreamdex.io/_next/static/immutable/chunks/3w46wu70iystk.js` and search for `closedSide`.

## Expected
The `size` TSDoc (and the `plane.ts` comment) state the convention the chain uses. On `PositionLiquidated` rows,
`size` is the signed change to the position: negative when a long is reduced, positive when a short is reduced. On
`PositionTakenOver` / `PositionTransferred` rows, `size` is the position's own signed size. (All six such rows the indexer
holds are shorts, so a long takeover could not be checked; the app's code reads `size > 0` on a `PositionTakenOver` row
as a long.) Or the SDK returns a derived closed side, so callers do not need a per-kind sign rule.

## Actual
The TSDoc says "the sign is the side being closed". Under the SDK's positive = long rule, that is wrong for every
`PositionLiquidated` row, and it says nothing about the other kinds in the column.

Single rows (`evidence/34/check_rows_2026-10-26T0719Z.txt`, run 07:19:42 UTC; `cast` output in
`evidence/34/cast_curl_2026-10-26T0721Z.txt`, 07:21:12 UTC):

| row id | kind | pool | position at block − 1 | position at block | row `size` |
|---|---|---|---|---|---|
| `0x3d5d323c…b93247_95` (block 33346996) | PositionLiquidated | BTC `0x4181…94C0` | +24,010,000 (long) | 0 | **−24,010,000** |
| `0x7932ea62…5df5b1_118` (block 33422553) | PositionLiquidated | HYPE `0x63B4…297A` | −674,680,000 (short) | −214,400,000 | **+460,280,000** |
| `0x170891a3…7f855e_87` (block 28537567) | PositionTakenOver | SOL `0xB483…FA53` | −227,770,000,000 (short) | 0 | **−227,770,000,000** |
| `0x170891a3…7f855e_86` (block 28537567) | PositionTransferred | SOL `0xB483…FA53` | −227,770,000,000 (short) | 0 | **−227,770,000,000** |

```
$ cast call --block 33346995 $MB 'getPosition(address,address)((int128,uint128,int256,uint64))' 0xea377c343ea8b4d2c718b71f4fe7a09e2a95931b 0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0 --rpc-url $RPC
(24010000 [2.401e7], 81809967305289462723865 [8.18e22], 2648176135383958687884594870009559031250 [2.648e39], 0)
$ cast call --block 33346996 ... same account and pool
(0, 0, 0, 0)
indexer: {"id":"0x3d5d323c5a051b2ff6f822893483468e1ebf3b2dc8ceed0f6750c98f29b93247_95","kind":"PositionLiquidated","account":"0xea377c343ea8b4d2c718b71f4fe7a09e2a95931b","pool":"0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0","size":"-24010000","price":"79247006744658869500000","blockNumber":"33346996"}
raw log 95: sizeDelta -24010000, markPrice 79247006744658869500000
```

In that tx, the account's `PositionUpdated` `newSize` values run 8,868,000 → 5,083,000 → 0: the long was sold down to
flat.

Tallies (`evidence/34/verify_sign_80_2026-10-26T0637Z.txt`, 06:37:23–06:39:22 UTC; indexer total 1,396
`PositionLiquidated` rows):

```
  11  PositionLiquidated: held short, row.size + (opposite-sign-to-position)
  69  PositionLiquidated: held long, row.size - (opposite-sign-to-position)
   3  PositionTakenOver: held short, row.size - (same-sign-as-position)
   3  PositionTransferred: held short, row.size - (same-sign-as-position)
  86  mm:chainlog==row
```

That covers the newest 80 rows, blocks 32,028,822–33,422,553, on 13 pools. All 80 have `size == post − pre`. The oldest
25 rows (`evidence/34/verify_sign_oldest25_2026-10-26T0641Z.txt`, blocks 10,360,563–13,165,975, 06:41 UTC) give 15 shorts
with `+` and 10 longs with `−`. All 25 have `size == post − pre`, and the raw log matched the row in 31 of 31.
An earlier independent run of `evidence/34/repro_size_sign.mjs` at 06:08:43 UTC gave the same 69 / 11 / 3 / 3 split
(`evidence/34/repro_size_sign_2026-10-26T0608Z.txt`).

## Evidence
- `evidence/34/check_rows.mjs` and `evidence/34/check_rows_2026-10-26T0719Z.txt`: per-tx decode of the raw liquidation logs,
  the indexer row, and `getPosition` at block − 1 and at the block, for the three txs in the table.
- `evidence/34/cast_curl_2026-10-26T0721Z.txt`: the curl in step 2, the `cast call`s in step 3, and the raw log decode in
  step 4, with output.
- `evidence/34/verify_sign.mjs` + `evidence/34/verify_sign_80_2026-10-26T0637Z.txt` and `evidence/34/verify_sign_oldest.mjs` +
  `evidence/34/verify_sign_oldest25_2026-10-26T0641Z.txt`: one line per row (id, account, pool, position before/after,
  row size, raw-log match, `post − pre` check, `PositionUpdated` sequence) and the tallies.
- `evidence/34/repro_size_sign.mjs` + `evidence/34/repro_size_sign_2026-10-26T0608Z.txt`: the first, simpler tally (indexer
  rows and `getPosition` at block − 1 only).
- `evidence/34/sdk_docs_app_excerpts.txt`: the SDK lines quoted above from 0.32.1 and the canary, the tarball integrity,
  npm dist-tags, the docs-snapshot counts (0 mentions of `PositionLiquidated` / `sizeDelta` in
  `app.dreamdex.io/llms-full.txt`, `app.testnet.dreamdex.io/llms-full.txt`, the contracts events page and the
  perps-testnet page), and the app's `liquidationLegLabel` / `closedSide` code.
- `evidence/34/app_chunk_3w46wu70iystk_2026-10-26T0640Z.js`: the app chunk as fetched (sha256
  `7676aa31feaed15e9bdeeade3429045608a0ac24d62440e056c03e8567a32a7d`).

## Suggested fix
1. Replace the `size` TSDoc (`src/perp/history.ts:249–252`) with the real per-kind rule, for example: "`PositionLiquidated`:
   the signed change to the position (`sizeDelta` = after − before), so negative when a long was reduced and positive
   when a short was reduced; on a partial liquidation it is the part closed. `PositionTakenOver` / `PositionTransferred`:
   the position's own signed size at takeover (positive = long)." Also state the rule for the other kinds that fill
   `size` (`AutoDeleveraged`, `PositionSkipped`, `AdlCapacityShortfall`).
2. Fix the comment in `src/perp/plane.ts:37` the same way.
3. Consider adding a derived `closedSide: "long" | "short"` (and an unsigned size) to `LiquidationEvent`, as the app
   already computes, so wallet views built from the `docs/PERPS.md:1074–1077` example do not need per-kind sign rules.
4. In `docs/PERPS.md`, next to the `positionLegs` example, say that the sign of `size` differs between the kinds it
   selects.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (npm `latest`; tarball sha512
  `RfshQP8X6m/wrE6TocmiOPajbw/Vstmkvn+AP/ztK19QgcrPn1lR7A4Pp8xVm6MuOXOpBwTBrFO0W34neQF0Og==` matches the registry) and
  `0.32.2-canary.38575926931.ge4550933d36d`. We read the source as text and did not run the package.
- Indexer `https://hideki-dev.smk.somnia.host/v1/graphql` (`LiquidationEvent`, the table `listLiquidations` reads)
- Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and SDK), RPC `https://api.hideki2.infra.testnet.somnia.network`.
  MarginBank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` and LiquidationEngine `0xA66d3C24Ad4a389d863846905D8173e1017e9F4D`,
  as listed on `app.dreamdex.io/docs/developers/perps-testnet`.
- App chunk `https://app.testnet.dreamdex.io/_next/static/immutable/chunks/3w46wu70iystk.js`, fetched 06:40 UTC
- Tools: viem 2.57.7, `cast` 1.8.5, curl
- Date: 2026-10-26, 06:08–07:21 UTC (read-only: receipts, `eth_call` at historical blocks, indexer queries; no
  transactions sent)
- Wallet: n/a (read-only). The rows shown belong to other accounts (`0xea37…931b`, `0x5521…1e69`, `0x6718…ce16`).
