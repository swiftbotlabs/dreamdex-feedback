# Docs mark six markets "Paper USDso: No", but `MarginBank.isVoucherMarketAllowed` is true for all 21 pools
Severity: normal
Area: docs

> **Summary.** The docs say the Perps Arena's paper USDso cannot trade six markets, but the chain allows it on all 21:
> `isVoucherMarketAllowed` is `true` everywhere, and a paper-USDso-only account's resting bid is accepted on ZEC-PERP and PUMP-PERP.

> **Re-verified 2026-10-25, 22:39–22:40 UTC, Somnia Tokyo testnet (chain 50383), block 33158494.** `isVoucherMarketAllowed` is `true` for all 21 pools, and the docs' market table still marks 1000PEPE, LIT, PUMP, VVV, ZEC and ZRO "No" ("The six newest markets are not on that list"). From the voucher-only account `0x5674…3f45` (paper-USDso floor 2,000, never main-funded, flat), a resting bid at the minimum size simulates as accepted on ZEC-PERP and PUMP-PERP, as on BTC-PERP (a "Yes" market, positive control). Negative control: the same ZEC bid from `0x…dEaD`, which holds no collateral and no voucher, reverts. Evidence: `evidence/voucher_only_orders_2026-10-25T2240Z.txt`, `evidence/survey_2026-10-25T2239Z.json`.

The trading page "Perps on Testnet" has a **Paper USDso** column in its market table with
1000PEPE-PERP, LIT-PERP, PUMP-PERP, VVV-PERP, ZEC-PERP and ZRO-PERP marked **No**, and "Margin &
Liquidations" says under **Paper USDso**:

> Only some markets. You can open or increase positions only in the markets marked Yes under Paper
> USDso in the market table. The six newest markets are not on that list.

The developer page says the same credit "can only open positions in the markets on its allowlist" and
that `getMaxPerpOrderSize` reports a blocked market as `limitedBy: "voucherBlocked"`. The SDK derives
`voucherBlocked` from `MarginBank.isVoucherMarketAllowed(pool)` (src/perp/margin.ts: the read is at lines 774 and
2362, and line 2153 derives `voucherBlocked = voucherActive && (!p.voucherMarketAllowed || p.voucherLeverageCapX === 0)`).
On chain that read returns `true` for every one of the 21 pools, and `getVoucherLeverageCap()` is 20,
so a voucher account is not blocked anywhere. Either the allowlist was widened and the two doc pages
are stale, or the allowlist is wrong on chain; a bot that trusts the table will refuse to trade six
markets it can trade (the bot kit's `perp-*` strategies do exactly that: "On any other market the bot
says so and opens nothing").

## Steps to reproduce
1. `PerpPoolFactory(0xE631fAEE547baeE07353E290f0562ea67d856560).getPerpPoolStatuses()` -> 21 pools.
2. For each pool call `MarginBank(0x478769E1177C0773c43A593DCCc4Ad15F15F1394).isVoucherMarketAllowed(pool)`.
3. Call `MarginBank.getVoucherLeverageCap()`.
4. Compare with the market table on `/docs/trading/perps-testnet` and the paragraph on
   `/docs/trading/perps-testnet/margin-and-liquidations`.

`node scripts/survey.mjs > survey.json` in this repo does steps 1–3 (plain viem reads, ABI copied
from the SDK's `readsAbi.ts`).

## Expected
The six markets documented as "No" return `false`, the other fifteen `true`.

## Actual
All 21 return `true`; `getVoucherLeverageCap()` = 20. Block 27491272, 2026-10-19 ~09:05 UTC:

| market | base token decimals | docs "Paper USDso" | `isVoucherMarketAllowed` |
|---|---|---|---|
| 1000PEPE | 18 | No | true |
| LIT | 18 | No | true |
| PUMP | 6 | No | true |
| VVV | 18 | No | true |
| ZEC | 8 | No | true |
| ZRO | 18 | No | true |
| other 15 | — | Yes | true |

Everything else in the same table matched the chain exactly (tick size, min size, open-interest cap,
max leverage / initial margin for all 21 markets, and the base-decimals table on the developer page),
so this column is the one stale cell group.

### Re-check 2026-10-19 15:09 UTC: unchanged
- Chain, block 27707067 (`scripts/survey.mjs`, output `evidence/survey_2026-10-19T1508Z.json`): 21 pools,
  `isVoucherMarketAllowed` = `true` for all 21, `getVoucherLeverageCap()` = 20.
- Docs, fetched at the same time from `https://app.testnet.dreamdex.io/docs/trading/perps-testnet`: the
  Paper USDso column still says **No** for 1000PEPE-PERP, LIT-PERP, PUMP-PERP, VVV-PERP, ZEC-PERP and ZRO-PERP;
  `/docs/trading/perps-testnet/margin-and-liquidations` still says "The six newest markets are not on that list."

### Added 2026-10-20 03:33 UTC: the chain accepts paper-USDso orders on two of the "No" markets
`eth_call` of `placeOrder` (a resting bid 10 % below the mark, `minQuantity`) from
`0x567476bd43ff20e6aa44e18abfbdb58280563f45`, an account whose only margin is paper USDso (two `Credited` grants of
1,000 USDso from the VoucherDistributor, no `Deposit`, `getMainFundedPrincipal` = 0, no active pools):

| market | docs "Paper USDso" | simulated `placeOrder` result |
|---|---|---|
| ZEC-PERP `0x2a73129F26917124bd2A47a9B355C395C537F050` | No | `success = true`, orderId returned |
| PUMP-PERP `0x76c981a52530cdF9497559140aAfCd8CD16836E7` | No | `success = true`, orderId returned |
| ETH-PERP `0xD6Cb1DD58580B84D76068aC21594219ce03aeddf` (control) | Yes | `success = true`, orderId returned |

This shows the order is accepted, not that it would fill. Command:
`node scripts/sim_orders.mjs package/src/contractErrorsAbi.ts 0x567476bd43ff20e6aa44e18abfbdb58280563f45 <pool>`
(output in `evidence/voucher_only_orders_2026-10-20T0332Z.txt`). The 2026-10-20 02:36 UTC re-check also found
`isVoucherMarketAllowed` still `true` for all 21 pools and the docs sentence unchanged
(`evidence/survey_2026-10-20T0236Z.json`).

## Evidence
- `survey.json` produced by `scripts/survey.mjs` (per-pool `voucherAllowed: true`, raw
  `getOrderBookParameters` / `getPerpPoolParameters` values); re-runs in `evidence/survey_2026-10-19T1508Z.json` and
  `evidence/survey_2026-10-20T0236Z.json`.
- `evidence/voucher_only_orders_2026-10-20T0332Z.txt`: the simulated paper-USDso orders above.
- SDK source: `src/perp/margin.ts:2153` (`voucherBlocked` derivation) and `:774` / `:2362` (the
  `isVoucherMarketAllowed` reads).

## Suggested fix
Regenerate the Paper USDso column from `isVoucherMarketAllowed` (the page already says the figures
"are read from the live markets") and drop or rewrite the "six newest markets are not on that list"
sentence; or, if the six are meant to be blocked, fix the allowlist on chain.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (source read; not executed)
- Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and SDK), RPC `https://api.hideki2.infra.testnet.somnia.network`, block 27491272
- Date: 2026-10-19, 09:05 UTC
- Wallet: `0x2A11e7388D1D2F9690f2636846d44b478f61bF08` (reads only)
- Re-verified 2026-10-25 UTC on Somnia Tokyo testnet (see the note under the summary)

## Corrections
- **Corrected 2026-10-20.** Fixed the SDK line numbers in the body (they said the `voucherBlocked` derivation is at
  774/2362; it is at 2153, and 774/2362 are the `isVoucherMarketAllowed` reads, as Evidence already said). Added the
  simulated paper-USDso orders on ZEC-PERP and PUMP-PERP and the summary.
