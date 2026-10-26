# Indexer: the `PerpPosition.entryFundingIndex` description gives a funding recipe that multiplies by the unsigned `size`, so it gives every short the wrong sign, and it leaves out the ÷ (1e18 × oneBase) the MarginBank applies
Severity: normal
Area: API

> **Summary.** The perps developer page gives the indexer only as a URL, so its GraphQL field descriptions are the
> per-field reference. The description of `PerpPosition.entryFundingIndex` says an account's unsettled funding is
> "reconstructible as (getProjectedCumulativeFundingPerUnit() - entryFundingIndex) * size". On the same entity, `size` is
> "Absolute position size in base units (sign carried by isLong)". Used as written, the recipe gives a long and a short
> the same sign for the same index move, so every short gets the wrong sign: a short that receives funding shows as paying,
> and one that pays shows as receiving. It also leaves out the division by 1e18 × `oneBase` that the MarginBank applies.
> "1e18-scaled" hints at the 1e18, but `oneBase` (1e6 to 1e24 across the pools checked) is never mentioned.
> The data itself is correct: all 12 rows checked match `MarginBank.getPosition`. In 25 `FundingSettled` events across 20 transactions,
> the payment equals `ceil(signedSize × (index − entry) / (1e18 × oneBase))` to the wei, and the recipe has the wrong sign for all 12 shorts.

> **Checked 2026-10-26, 07:33–07:39 UTC, Somnia Tokyo testnet (chain 50383).** `hideki-dev.smk.somnia.host`,
> `dev.smk.somnia.host` and `prd.smk.somnia.host` all serve the same description. The live dreamDEX docs
> (`https://app.dreamdex.io/llms-full.txt`) mention neither `entryFundingIndex` nor `getProjectedCumulativeFundingPerUnit`,
> so the docs give no other recipe to correct this one. Evidence: `evidence/32/introspect_perpposition_2026-10-26T0733Z.txt`,
> `evidence/32/entryidx_recipe_check_2026-10-26T0734Z.txt`, `evidence/32/funding_settled_summary.txt`,
> `evidence/32/docs_check_2026-10-26T0736Z.txt`.

The dreamDEX developer page `/docs/developers/perps-testnet` lists the indexer as "**Indexer (GraphQL)** |
`https://hideki-dev.smk.somnia.host/v1/graphql`" and gives no field reference. Introspection of `PerpPosition` returns:

```
entryFundingIndex :: Cumulative funding index this position entered at (1e18-scaled, signed). Makes the account's
  UNSETTLED funding reconstructible as (getProjectedCumulativeFundingPerUnit() - entryFundingIndex) * size — a
  per-MARKET chain read instead of a per-account one.  Written by the 6-arg PositionUpdated, which MarginBank has
  emitted since its 2026-08-06 upgrade. NULL on rows last updated by the retired 5-arg form.
size :: Absolute position size in base units (sign carried by isLong)
isLong :: (no description)
```

What the chain and the SDK actually compute:

- SDK 0.32.1 `src/perp/margin.ts:993–994`: `fundingDelta = projectedCumulativeFunding - entryFundingIndex;
  accruedFunding = divCeilSigned(p.size * fundingDelta, FUNDING_PRECISION * p.oneBase)`. Here `size` is **signed**
  ("SIGNED position size, raw base units (positive = long, negative = short)", `dist/perp/margin.d.ts:489`),
  `FUNDING_PRECISION` is `1e18` (`src/funding.ts:32`) and `oneBase` is "10^decimals of the synthetic base asset".
- The `divCeilSigned` docblock (`src/perp/margin.ts:420–437`) says it matches "`PerpMath.fundingPayment`", where "a
  PAYER (positive, a debit) pays at least what is owed while a RECEIVER (negative, a credit) receives at most it", and
  "a long pays while the index is rising and a short pays while it is falling".
- The MarginBank's `FundingSettled(account, perpPool, int256 payment)` equals that formula to the wei in every event we
  checked (below).

The description's recipe has no `isLong` and no `oneBase` in it. With the `size` the same row serves, it returns
`(proj − entry) × |size|`. That number has the same sign for a long and a short, and it is 1e18 × `oneBase` too large
(1e26 on BTC-PERP, 1e36 on ETH-PERP, 1e42 on the NEAR pool). The most generous reading, where "1e18-scaled" means divide
by 1e18, is still `oneBase` times too large and still has the wrong sign for shorts.

The input data is not the problem. All 12 indexer rows below have the same `size` (with the sign from `isLong`) and the
same `entryFundingIndex` as `MarginBank.getPosition` at the same block. Only the recipe in the description is wrong. It
is also not one of the descriptions the SDK flags as outdated: SDK `docs/PERPS.md:975–978` says the indexer's own
descriptions "still carry the older wording for `kind`, `counterparty` and `stageReached`" and names no other field.

Who this affects: a builder who follows the description to show unsettled funding per position, using one GraphQL page
plus one read per market (the shortcut the description advertises). That builder gets the sign wrong for every short:
a short that is being paid (index rising) shows as paying, and a short that is paying (index falling) shows as
receiving. Longs get the right sign but the wrong scale. The SDK's own positions guide warns about the same trap for
`size`: "the entity stores magnitude and direction separately; they are folded back together here so a short can't
read as a long" (`docs/PERPS.md:70–71`).

## Steps to reproduce
1. Introspect the entity (read-only; `bash evidence/32/introspect_perpposition.sh` runs this on all three deployments):
   ```
   curl -s https://hideki-dev.smk.somnia.host/v1/graphql -H 'content-type: application/json' \
     -d '{"query":"{ __type(name:\"PerpPosition\"){ fields { name description } } }"}'
   ```
   Read `entryFundingIndex` and `size`.
2. Take one open short on ETH-PERP (pool `0xd6cb1dd58580b84d76068ac21594219ce03aeddf`) from the indexer:
   ```
   curl -s https://hideki-dev.smk.somnia.host/v1/graphql -H 'content-type: application/json' \
     -d '{"query":"{ PerpPosition(where:{pool:{_eq:\"0xd6cb1dd58580b84d76068ac21594219ce03aeddf\"}, account:{_eq:\"0xf3ed3f5b90a13b39f30759e9800ec638711008f8\"}}) { account isLong size entryFundingIndex updatedAtBlock } }"}'
   ```
3. Read the same position and the pool's index on chain (RPC `https://api.hideki2.infra.testnet.somnia.network`):
   ```
   RPC=https://api.hideki2.infra.testnet.somnia.network
   MB=0x478769E1177C0773c43A593DCCc4Ad15F15F1394
   ETH=0xd6cb1dd58580b84d76068ac21594219ce03aeddf
   cast call $ETH 'getProjectedCumulativeFundingPerUnit()(int256)' --rpc-url $RPC
   cast call $ETH 'getOneBase()(uint256)' --rpc-url $RPC
   cast call $MB 'getPosition(address,address)((int128,uint128,int256,uint64))' 0xf3ed3f5b90a13b39f30759e9800ec638711008f8 $ETH --rpc-url $RPC
   ```
4. Compute the description's `(proj − entry) × size` and compare it with `ceil(signedSize × (proj − entry) / (1e18 × oneBase))`.
5. For more rows: `node evidence/32/entryidx_recipe_check.mjs 0xd6cb1dd58580b84d76068ac21594219ce03aeddf 3` (largest 3
   longs and 3 shorts on ETH-PERP) and `node evidence/32/entryidx_recipe_check.mjs 0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0 3 asc`
   (smallest 3 of each on BTC-PERP). The script uses viem 2.57.7, GraphQL reads and `eth_call` only. Each row is checked
   against `getPosition` at the same block.
6. To check which formula the MarginBank really charges, take a transaction with a `FundingSettled` log, read the
   position with `getPosition` at block − 1, and compare. `node evidence/32/funding_settled_check.mjs <txhash>` does this
   for one transaction. `evidence/32/liquidation_txs.txt` lists the 20 we ran: 19 recent liquidations plus one full close
   of our own.

## Expected
The description gives the formula the MarginBank charges, with the signed size and the scale:
`unsettled funding (quote atoms; positive = pays, negative = receives) = ceil((isLong ? size : −size) ×
(getProjectedCumulativeFundingPerUnit() − entryFundingIndex) / (1e18 × oneBase))`, where `oneBase = getOneBase()` on the
pool.

## Actual
Step 2 and 3 at block 33482340 (2026-10-26 07:39:43 UTC, `evidence/32/cast_eth_short_2026-10-26T0739Z.txt`): the indexer
row is `isLong: false`, `size: "58651400000000000000"`, `entryFundingIndex: "21186580466131211455144825346852812500"`.
`getPosition` returns size `-58651400000000000000` and the same entry index. `getProjectedCumulativeFundingPerUnit()` is
`21643722683000819243720643463148437500`, and `getOneBase()` is `1e18`.

| | value |
|---|---|
| `proj − entry` | `457142216869607788575818116295625000` |
| description: `(proj − entry) × size` | `+26812031018506114250875738666101220125000000000000000000` (pays) |
| the same ÷ 1e18 | `+26812031018506114250875738666101220125` (pays) |
| `ceil(signedSize × (proj − entry) / (1e18 × oneBase))` (SDK, MarginBank) | `−26812031018506114250` = −26.81 USDso (receives) |

Twelve rows (`evidence/32/entryidx_recipe_check_2026-10-26T0734Z.txt`, ETH-PERP block 33479416, BTC-PERP block 33479459).
`rowMatchesChain` is `true` on all 12:

| pool | side | account | owed per chain formula (USDso) | description ÷ chain formula |
|---|---|---|---|---|
| ETH-PERP | long | `0xab8b6125…` | +3.032031 | 9.99…e35 |
| ETH-PERP | long | `0xe1aee0e5…` | +8.417039 | 9.99…e35 |
| ETH-PERP | long | `0xffc2d88f…` | +2.936365 | 1e36 |
| ETH-PERP | short | `0xf3ed3f5b…` | −26.812031 | −1.00…e36 |
| ETH-PERP | short | `0x5bca5753…` | −26.256146 | −1.00…e36 |
| ETH-PERP | short | `0x8345545b…` | −23.011625 | −1.00…e36 |
| BTC-PERP | long | `0x2c7d4bf8…` | +0.031068 | 9.99…e25 |
| BTC-PERP | long | `0xfcdf06ae…` | +0.031068 | 9.99…e25 |
| BTC-PERP | long | `0xbe1c31db…` | +0.031068 | 9.99…e25 |
| BTC-PERP | short | `0xeeaba938…` | −0.095554 | −1.00…e26 |
| BTC-PERP | short | `0x904c81fa…` | −0.127405 | −1.00…e26 |
| BTC-PERP | short | `0x435229d2…` | −0.159257 | −1.00…e26 |

(The ratio is not exactly 1e18 × `oneBase` only because the chain formula rounds to whole atoms.)

Settlements (`evidence/32/funding_settled_summary.txt`, from `evidence/32/funding_settled_check_2026-10-26T0737Z.txt`, run
07:37:58–07:38:50 UTC): 20 transactions, 25 `FundingSettled` events, on pools with `oneBase` 1e6, 1e8, 1e9, 1e18 and
1e24. In all 25, `payment` equals `ceil(signedSize × (index − entry) / (1e18 × oneBase))` exactly (diff 0). All 12 shorts
are receivers (negative payment). For each of them the description's recipe is positive. Examples:

| tx | block | position | `FundingSettled.payment` | chain formula | description recipe |
|---|---|---|---|---|---|
| `0x3d5d323c5a051b2ff6f822893483468e1ebf3b2dc8ceed0f6750c98f29b93247` | 33346996 | BTC-PERP long `0xEa377C34…`, size 24010000 | `266570547819875364989` | `266570547819875364989` | `+26657054781987536498823721443227261115625000000` |
| `0xf312541d54295c4d20aef92e9bed31523c747df56721dbc6e800560e67459b25` | 32967953 | NEAR pool `0x1cD15ae8…` short `0x309e802A…`, size −11751200000000000000000000000, oneBase 1e24 | `-681682737047335700` | `-681682737047335700` | `+681682737047335700000000000000000000000000000000000000000000` |
| `0x53f1f7f7f5efbe2fecfab50c4cfc9e24cff200bc7eb7c92dc1d818824897b9b5` | 28540785 | ETH-PERP long `0x0e7E8DF6…` (our account's trading wallet, full close), size 1627100000000000000 | `50021284163566929` | `50021284163566929` | `+50021284163566928871250000000000000000000000000000000` |

The index used for each event is the `entryFundingIndex` that the same transaction's `PositionUpdated` stamps for that
account and pool. When that `PositionUpdated` closes the position (index `0`), the script uses the pool's projected index
at block − 1 instead. The two agree wherever both exist.

## Evidence
- `evidence/32/introspect_perpposition_2026-10-26T0733Z.txt`: the `entryFundingIndex`, `size` and `isLong` descriptions
  from all three deployments (07:33:21Z, 07:33:35Z, 07:33:41Z), produced by `evidence/32/introspect_perpposition.sh`.
- `evidence/32/entryidx_recipe_check_2026-10-26T0734Z.txt` and the two JSON files
  `evidence/32/entryidx_recipe_check_0xd6cb1dd5_2026-10-26T0734Z.json`, `evidence/32/entryidx_recipe_check_0x4181dd08_2026-10-26T0734Z.json`:
  the 12 rows, with the indexer and chain values, the description's recipe (as written and ÷ 1e18) and the chain
  formula. Script: `evidence/32/entryidx_recipe_check.mjs`.
- `evidence/32/cast_eth_short_2026-10-26T0739Z.txt`: steps 2 and 3 with `cast` 1.8.5 and `curl`.
- `evidence/32/funding_settled_check_2026-10-26T0737Z.txt` (full decoded logs) and `evidence/32/funding_settled_summary.txt`
  (one line per event): the 25 settlements. Script: `evidence/32/funding_settled_check.mjs`; transaction list:
  `evidence/32/liquidation_txs.txt`.
- `evidence/32/sdk_funding_source_0.32.1.txt`: the SDK lines quoted above. The tarball's sha512 matches the npm
  `dist.integrity` of 0.32.1; we read it as text and did not install or run it.
- `evidence/32/docs_check_2026-10-26T0736Z.txt`: the live `app.dreamdex.io/llms-full.txt` (HTTP 200, 07:36:18Z) has 0
  lines with `entryFundingIndex`, `getProjectedCumulativeFundingPerUnit` or "funding index", and two lines with the
  indexer URL. The live SDK docs (`somnia-platform-explorer.vercel.app/markets/llms-full.txt`) give no recipe either.
- `evidence/32/indexer_head_2026-10-26T0739Z.txt`: `chain_metadata` (chain id 50383, `latest_processed_block` 33482023).

## Suggested fix
Change the `entryFundingIndex` description in the indexer schema to the formula the MarginBank charges, for example:
"Cumulative funding index this position entered at (1e18-scaled, signed). Unsettled funding in quote atoms (positive =
the account pays, negative = it receives) is `ceil(signedSize × (getProjectedCumulativeFundingPerUnit() −
entryFundingIndex) / (1e18 × oneBase))`, where `signedSize = isLong ? size : −size` and `oneBase = getOneBase()` on the
pool." Give `isLong` a description too, so the sign rule is visible from both fields. If the description text can only
change with a reindex, as the SDK says of the `kind` / `counterparty` / `stageReached` wording, add the formula meanwhile
to the dreamDEX developer page next to the indexer URL, or to the SDK's list of outdated indexer descriptions
(`docs/PERPS.md:975–978`).

## Environment
- Indexer `https://hideki-dev.smk.somnia.host/v1/graphql` (`chain_metadata.chain_id` 50383, `latest_processed_block`
  33482023 at 07:39 UTC); the same description on `https://dev.smk.somnia.host/v1/graphql` and
  `https://prd.smk.somnia.host/v1/graphql`
- RPC `https://api.hideki2.infra.testnet.somnia.network`; Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and SDK)
- MarginBank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394`; ETH-PERP `0xd6cb1dd58580b84d76068ac21594219ce03aeddf`;
  BTC-PERP `0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0`; NEAR pool `0x1cD15ae8bFf0FE0a7F49233BE8b90734775bA454`
- `@somnia-chain/markets-sdk` 0.32.1 (npm `latest`; source read as text, not executed); viem 2.57.7; `cast` 1.8.5
- Docs: `https://app.dreamdex.io/docs/developers/perps-testnet`, `https://app.dreamdex.io/llms-full.txt`, fetched
  2026-10-26 07:36 UTC
- Date: 2026-10-26, 07:33–07:39 UTC (GraphQL reads and `eth_call` only; no transactions sent)
- Wallet: n/a (read-only). The rows shown belong to other accounts, except the 2026-10-20 close tx `0x53f1f7f7…`, which is
  our account's trading wallet `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`
