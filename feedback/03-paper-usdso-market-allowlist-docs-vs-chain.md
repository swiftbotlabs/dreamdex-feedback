# Docs mark six markets "Paper USDso: No", but `MarginBank.isVoucherMarketAllowed` is true for all 21 pools
Severity: normal
Area: docs

The trading page "Perps on Testnet" has a **Paper USDso** column in its market table with
1000PEPE-PERP, LIT-PERP, PUMP-PERP, VVV-PERP, ZEC-PERP and ZRO-PERP marked **No**, and "Margin &
Liquidations" says under **Paper USDso**:

> Only some markets. You can open or increase positions only in the markets marked Yes under Paper
> USDso in the market table. The six newest markets are not on that list.

The developer page says the same credit "can only open positions in the markets on its allowlist" and
that `getMaxPerpOrderSize` reports a blocked market as `limitedBy: "voucherBlocked"`. The SDK derives
`voucherBlocked` from `MarginBank.isVoucherMarketAllowed(pool)` (src/perp/margin.ts, lines 774 and
2362: `voucherBlocked = voucherActive && (!p.voucherMarketAllowed || p.voucherLeverageCapX === 0)`).
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

## Evidence
- `survey.json` produced by `scripts/survey.mjs` (per-pool `voucherAllowed: true`, raw
  `getOrderBookParameters` / `getPerpPoolParameters` values).
- SDK source: `src/perp/margin.ts:2153` (`voucherBlocked` derivation) and `:2362` (the
  `isVoucherMarketAllowed` read).

## Suggested fix
Regenerate the Paper USDso column from `isVoucherMarketAllowed` (the page already says the figures
"are read from the live markets") and drop or rewrite the "six newest markets are not on that list"
sentence; or, if the six are meant to be blocked, fix the allowlist on chain.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (source read; not executed)
- Somnia Hideki testnet ("Tokyo"), chain id 50383, RPC `https://api.hideki2.infra.testnet.somnia.network`, block 27491272
- Date: 2026-10-19, 09:05 UTC
- Wallet: `0x2A11e7388D1D2F9690f2636846d44b478f61bF08` (reads only)
