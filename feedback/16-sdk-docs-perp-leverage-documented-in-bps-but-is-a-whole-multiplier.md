# SDK docs: "Units and scales" says perp leverage for `setPerpLeverage` and `getPerpMaxLeverage` is in bps of 1× (10,000 = 1.00×, 200,000 = 20×), but both use whole multipliers; the table's own example values revert `InvalidLeverage()` or cannot be encoded
Severity: normal
Area: docs

> **Summary.** The SDK reference page "Units and scales" lists `setPerpLeverage` and `getPerpMaxLeverage` under
> "Leverage in bps of 1× | 10,000 = 1.00×, 200,000 = 20×", and lists the MarginBank's `getMaxLeverage` limits under plain
> basis points. The SDK types and the deployed MarginBank both use a whole multiplier (`10` = 10×, uint16, protocol
> limit `20`). A builder who follows the table gets `InvalidLeverage()` for 10,000 ("1×") and an encoding error for
> 200,000 ("20×").

> **Checked 2026-10-26, 03:20–03:22 UTC.** npm `latest` is still 0.32.1 (published 2026-10-13); `canary` is
> 0.32.2-canary.38575926931 (2026-10-14). Both tarballs carry the same two rows. Both hosted copies of the page and the
> live `markets/llms-full.txt` still show them (the prd.smk.somnia.host copy still had the row at 04:51 UTC). Evidence: `evidence/16/lev-units_hosted-docs_2026-10-26T0320Z.txt`,
> `evidence/16/lev-units_check_2026-10-26T0320Z.txt`, `evidence/16/lev-units_cast_2026-10-26T0322Z.txt`.

The reference page `docs/reference/units-and-scales.md` in `@somnia-chain/markets-sdk` 0.32.1, hosted at
`https://prd.smk.somnia.host/docs/typescript/reference/units-and-scales` and
`https://somnia-platform-docs.vercel.app/markets/somnia-markets/typescript/reference/units-and-scales`, has this table
under "Basis points" (lines 66 and 68):

```
| Basis points (bps)    | 1 bps = 0.01 %                | Venue fees: `getMaxVenueFeeBps`, `MarketFees`, `getMaxLeverage` limits, `cexRateBps` in portfolio analytics |
| Leverage in bps of 1× | 10,000 = 1.00×, 200,000 = 20× | Perp leverage: `getPerpLeverage`, `setPerpLeverage`, `getPerpMaxLeverage`                                     |
```

The rest of the SDK, and the chain, use a whole multiplier for these values:

- `SetPerpLeverageParams.leverageX` (`dist/trade.d.ts:1275`): "Max leverage multiplier (e.g. 10 = 10x), bounded by the
  protocol limit."
- `trader.setPerpLeverage` passes `leverageX` unchanged to `MarginBank.setMaxLeverage(address perpPool, uint16
  leverageX)` (`src/perp/margin.ts:1602–1611`, `src/tradeAbi.ts:183`).
- `getPerpMaxLeverage` returns `MarginBank.getMaxLeverage(account, pool)` unchanged, a `uint16`
  (`src/perp/margin.ts:3059–3075`, `src/readsAbi.ts:386`). Its docblock calls it "the multiplier the account set for
  itself".
- `PerpLeverage.accountMaxLeverageX` is "the account's OWN per-market cap as an integer multiplier ... what
  `trader.setPerpLeverage` writes", and `protocolMaxLeverageX` is an "integer multiplier"
  (`dist/perp/margin.d.ts:375–387`).
- On Somnia Tokyo, `getMaxLeverageLimit()` returns `20`. `setMaxLeverage` accepts 1, 5 and 20, and rejects 21 with
  `InvalidLeverage()`. An account that has a cap set stores `5` on five markets. In the table's unit, `5` would be
  0.0005×.

The table is only partly right for `getPerpLeverage`. Its `*LeverageBps` fields (`positionLeverageBps`,
`accountLeverageBps`, `marketMaxLeverageBps`) are bps of 1×, as `docs/PERPS.md:325` says ("Every ratio is **bps of
1x**"). Its `accountMaxLeverageX` and `protocolMaxLeverageX` fields are whole multipliers (`dist/perp/margin.d.ts:375–387`).
The Perps guide lists those two fields in the same table as the bps fields, with no unit (`docs/PERPS.md:308–309`), and
follows the table with that "Every ratio is bps of 1x" sentence.

The SDK docs give no correct unit to fall back on. The live `markets/llms-full.txt` mentions `setPerpLeverage` three
times (lines 1836, 3503, 15627) and never mentions `leverageX` or "10 = 10x". So the only unit the SDK docs give for
`setPerpLeverage` is this wrong row. The correct unit appears only in the type's docblock. (The dreamDEX trading pages
talk about "20x, 10x or 5x" leverage for traders, but say nothing about the SDK's or the contract's unit.)

## Steps to reproduce
1. Open either hosted page above (or `npm pack @somnia-chain/markets-sdk@0.32.1` into an empty directory and read
   `package/docs/reference/units-and-scales.md`, lines 66 and 68). Note "10,000 = 1.00×, 200,000 = 20×" for
   `setPerpLeverage` / `getPerpMaxLeverage`, and "`getMaxLeverage` limits" under plain bps.
2. In the same tarball, read `dist/trade.d.ts:1275` (`leverageX`, "10 = 10x"), `src/perp/margin.ts:1602–1611` and
   `3059–3075`, `src/tradeAbi.ts:183`, `src/readsAbi.ts:386–387`.
3. Read-only calls on Somnia Tokyo testnet (chain 50383), MarginBank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394`,
   BTC-PERP pool `0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0`. We used our own address as `from`. Nothing is sent.
   ```
   RPC=https://api.hideki2.infra.testnet.somnia.network
   MB=0x478769E1177C0773c43A593DCCc4Ad15F15F1394
   BTC=0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0
   cast call $MB 'getMaxLeverageLimit()(uint16)' --rpc-url $RPC
   cast call --from 0x2A11e7388D1D2F9690f2636846d44b478f61bF08 $MB 'setMaxLeverage(address,uint16)' $BTC 20     --rpc-url $RPC
   cast call --from 0x2A11e7388D1D2F9690f2636846d44b478f61bF08 $MB 'setMaxLeverage(address,uint16)' $BTC 10000  --rpc-url $RPC
   cast call --from 0x2A11e7388D1D2F9690f2636846d44b478f61bF08 $MB 'setMaxLeverage(address,uint16)' $BTC 200000 --rpc-url $RPC
   cast call $MB 'getMaxLeverage(address,address)(uint16)' 0xd631B6253990e7669e8cb5100c375ED2F8142122 0x7058579F3248559963f79AdB937c6De9f953E060 --rpc-url $RPC
   ```
   `node evidence/16/lev-units_check.mjs` (viem 2.57.7, eth_call only) runs the same checks for 1, 5, 20, 21, 10000, 50000
   and 200000. It also reads `getMaxLeverage` for that account on all 21 pools.

## Expected
The table gives the unit the SDK and the contract use. `setPerpLeverage`'s `leverageX`, `getPerpMaxLeverage`, and the
MarginBank's `getMaxLeverage` / `getMaxLeverageLimit` are whole multipliers (`10` = 10×, at most `getMaxLeverageLimit()`
= 20 on Tokyo). Only `getPerpLeverage`'s `*LeverageBps` fields are in bps of 1×.

## Actual
The table puts `setPerpLeverage` and `getPerpMaxLeverage` in bps of 1× and `getMaxLeverage` limits in plain bps. Values
taken from the table fail on chain (2026-10-26, block 33327049, `evidence/16/lev-units_check_2026-10-26T0320Z.txt`):

| `setMaxLeverage(BTC, L)` eth_call | what the table says `L` means | result |
|---|---|---|
| `1` | 0.0001× | OK |
| `5` | 0.0005× | OK |
| `20` | 0.002× | OK |
| `21` | 0.0021× | REVERT `0x7fd13972` = `InvalidLeverage()` |
| `10000` | 1.00× | REVERT `0x7fd13972` = `InvalidLeverage()` |
| `50000` | 5.00× | REVERT `0x7fd13972` = `InvalidLeverage()` |
| `200000` | 20× | not sent: viem `IntegerOutOfRangeError`, "Number "200000" is not in safe 16-bit unsigned integer range (0 to 65535)" |

The same block shows `getMaxLeverageLimit()` = `20`, and `getMaxLeverage(0xd631B625…2122, pool)` = `5` on XRP
`0x7058…E060`, SUI `0x1Be2…efE4`, AVAX `0xde97…45C7`, NEAR `0x1cD1…A454` and ZEC `0x2a73…F050`. A UI that formats
`getPerpMaxLeverage`'s return value with the table's scale would show 0.0005× for this account, and 0.20 % for the
protocol limit if it used the bps row.

With `cast` 1.8.5 at 03:22 UTC (`evidence/16/lev-units_cast_2026-10-26T0322Z.txt`): `getMaxLeverageLimit()` → `20`,
`setMaxLeverage(BTC, 20)` → `0x`, `setMaxLeverage(BTC, 10000)` → `execution reverted: InvalidLeverage` (data
`0x7fd13972`, `cast sig 'InvalidLeverage()'` = `0x7fd13972`), and `200000` → "number too large to fit in target type".

## Evidence
- `evidence/16/lev-units_hosted-docs_2026-10-26T0320Z.txt`: both hosted pages (HTTP 200, 03:20:11Z and 03:20:12Z) with the
  two rows quoted. Live `https://somnia-platform-explorer.vercel.app/markets/llms-full.txt` (03:20:16Z) has them at lines
  15625 and 15627, and PERPS.md's "Every ratio is **bps of 1x**" at line 3520. A second fetch (03:24:13Z) has 0
  matches for `leverageX` and for "10 = 10x", and lists every `setPerpLeverage` line. Saved pages:
  `evidence/16/lev-units_prd.smk_units-and-scales_2026-10-26T0320Z.html`,
  `evidence/16/lev-units_vercel_units-and-scales_2026-10-26T0320Z.html`.
- `evidence/16/lev-units_sdk-source_0.32.1.txt`: the source and docs lines quoted above, from the 0.32.1 and
  0.32.2-canary tarballs (sha512 matches npm `dist.integrity`; read as text, nothing installed or run).
- `evidence/16/lev-units_check.mjs` and `evidence/16/lev-units_check_2026-10-26T0320Z.txt`: the eth_call run (chain id
  50383, 21 pools from `PerpPoolFactory.getPerpPoolStatuses()`, `0x4181dd08…` = BTC).
- `evidence/16/lev-units_cast_2026-10-26T0322Z.txt`: the `cast` commands in step 3 with their output.

## Suggested fix
Change line 68 so it covers only what really is in bps of 1×: "`getPerpLeverage`: `positionLeverageBps`,
`accountLeverageBps`, `marketMaxLeverageBps`". Add a row "Leverage multiplier | `10` = 10× | `setPerpLeverage`
`leverageX`, `getPerpMaxLeverage`, `PerpLeverage.accountMaxLeverageX` / `protocolMaxLeverageX` /
`voucherLeverageCapX`, MarginBank `getMaxLeverage` / `getMaxLeverageLimit` / `getVoucherLeverageCap` (uint16; protocol
limit 20 on Tokyo)". Remove "`getMaxLeverage` limits" from the plain-bps row. (`getVoucherLeverageCap()` also returns
`20` on Tokyo, `evidence/16/lev-units_cast_2026-10-26T0322Z.txt`.)

Not part of this report: `setPerpLeverage` has no client-side range check, so an out-of-range `leverageX` is only
caught on chain. That is a separate SDK issue. This report covers only the unit the reference page documents.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (npm `latest`) and 0.32.2-canary.38575926931.ge4550933d36d (source and docs read
  as text; not executed)
- Docs: `https://prd.smk.somnia.host/docs/typescript/reference/units-and-scales`,
  `https://somnia-platform-docs.vercel.app/markets/somnia-markets/typescript/reference/units-and-scales`,
  `https://somnia-platform-explorer.vercel.app/markets/llms-full.txt`, read 2026-10-26 03:20 UTC
- Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and SDK), RPC `https://api.hideki2.infra.testnet.somnia.network`,
  MarginBank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` (as listed on `app.dreamdex.io/docs/developers/perps-testnet`
  and in the SDK's `addresses.ts`)
- Date: 2026-10-26, 03:20–03:22 UTC (eth_call only, blocks 33327049–33328034; no transactions sent)
- Wallet: `0x2A11e7388D1D2F9690f2636846d44b478f61bF08` (eth_call `from`)
