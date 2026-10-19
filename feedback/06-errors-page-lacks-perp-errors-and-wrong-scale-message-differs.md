# Docs: the Errors page has none of the perp-specific errors the developer page sends readers to, and the "wrong scale" revert message is `ERC20: insufficient allowance`, not `transfer amount exceeds balance`
Severity: normal
Area: docs

The developer page "Perps on Testnet for Developers" ends its order-error section with "The full list
of order errors is on the Errors page", and cites perp-specific selectors on the way
(`InsufficientCollateral()` `0x3a23d825`, `MaxPositionSizeExceeded()` `0x714b36d6`,
`IsolatedMarketBlocked`, `voucherBlocked`). The Errors page (`/docs/developers/contracts/errors`)
documents 48 selectors — all 48 verified correct against `keccak256` — but contains **no** perp /
MarginBank / voucher errors: no `InsufficientCollateral`, `MaxPositionSizeExceeded`,
`IsolatedMarketBlocked` (`0xaa4fc774`), `VoucherMarketNotAllowed`, `VoucherLeverageCapNotSet`,
`VoucherAccountLeverageLocked`, `ClaimantNotFlat`, `SelfClaimDisabled`, nor the `OrderRejected`
reason codes. A perp developer who hits one of these has nothing to look it up in except the SDK's
`contractErrorsAbi.ts`.

Separately, the same developer page says about a quantity written with the wrong decimals:

> The owner's own placeOrder fails differently, with ERC20: transfer amount exceeds balance, because
> the pool tries to pull the shortfall from the wallet.

Simulated against the live BTC-PERP pool, the owner's `placeOrder` with an over-scaled quantity
reverts with `Error("ERC20: insufficient allowance")` — the allowance check comes first and no wallet
has approved the pool — for all three accounts tried (a fresh EOA, a 1,000-USDso voucher account and
a 608k-USDso trader). Anyone grepping logs for the documented string will not find it.

## Steps to reproduce
1. Open `/docs/developers/contracts/errors`; search for `InsufficientCollateral`, `MaxPositionSizeExceeded`,
   `IsolatedMarketBlocked`, `Voucher`. No matches (the page has `ImmediateOrCancelNoFill`,
   `OrderAlreadyExpired`, `AmendReplacementRejected`, `OrderRejected`, but nothing from the MarginBank).
2. Wrong-scale message: `eth_call` `placeOrder(true, 0, p, 0.001e18, far, 0, 0, 0x0, 0)` on BTC-PERP
   `0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0` (base decimals 8, so `0.001e18` is 10,000,000 BTC)
   with `p` = mark × 0.9 tick-aligned, from
   - `0x2A11e7388D1D2F9690f2636846d44b478f61bF08` (fresh EOA)
   - `0x567476bd43ff20e6aa44e18abfbdb58280563f45` (voucher account, flat)
   - `0x420691db9d2b5a79210fda48c177471386b6dfd1` (active trader).
   `node scripts/sim_orders.mjs <contractErrorsAbi.ts> <from> <pool>` runs this and the other
   rejection cases.

## Expected
- Perp errors (at least the ones the developer page itself names) listed with selector and fix.
- Revert string as documented, or the documentation updated to the string the pool emits.

## Actual
- Errors page: 0 perp/MarginBank/voucher entries.
- Revert data for all three accounts:
  `0x08c379a0…` = `Error("ERC20: insufficient allowance")`.

Real transaction (added 2026-10-19 15:20 UTC): the same wrong-scale order sent on chain by the fresh EOA
`0x2A11e7388D1D2F9690f2636846d44b478f61bF08` (owner self-send, no allowance to the pool), BTC-PERP
`placeOrder(true, 0, 73640.1e18, 1e15, now+7d, 0, 0, 0x0, 0)`, i.e. 0.001 BTC written with 18 decimals
= 10,000,000 BTC at 8 decimals:

| tx | block / time (UTC) | status | gas used | revert |
|---|---|---|---|---|
| `0x80b708fddec290ab840ea090e291ade43a3417a64e3c2cbcf1b364e653093078` | 27689075 / 14:38:55 | `0x0` (reverted) | 387,386 of 3,000,000 | `Error("ERC20: insufficient allowance")` |

(Replay at the parent block 27689074 returns `0x08c379a0…` = `ERC20: insufficient allowance`; gas used is
far below the limit, so this is a revert, not out-of-gas.) A developer grepping their logs for the
documented `transfer amount exceeds balance` will not find it.

For completeness, the other documented order errors reproduce as documented on BTC-PERP
(same script, from `0x4206…dfd1`): off-tick price -> `InvalidPrice(price, tickSize)` `0xaf608abb`;
below `minQuantity` -> `QuantityBelowMinimum` `0xeaa68ceb`; not a lot multiple -> `InvalidQuantity`
`0x4f174b29`; `expireTimestampNs = 0` -> `OrderAlreadyExpired` `0x3154078e`; IOC with no fill ->
`ImmediateOrCancelNoFill` `0xd48c4403`; FOK -> `FillOrKillNotFillable` `0xc04ad919`; PostOnly crossing
-> `PostOnlyWouldCross` `0x7cf05fcb`; a bid that nets the account past `maxPositionSize` ->
`MaxPositionSizeExceeded` `0x714b36d6`.

## Evidence
- `scripts/errsel.mjs` builds the selector map from the SDK's `contractErrorsAbi.ts`;
  `scripts/sim_orders.mjs` / `scripts/sim_cap.mjs` print the simulated reverts above.
- Errors page text as fetched 2026-10-19 ~09:40 UTC.

## Suggested fix
Add a "Perps (MarginBank, PerpPool, VoucherDistributor)" table to the Errors page generated from the
same source as `contractErrorsAbi.ts`, including `SelfClaimDisabled()` `0x3e31dcc2`; change the
wrong-scale paragraph to "`ERC20: insufficient allowance` (or `transfer amount exceeds balance` once
an allowance exists)".

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (error ABI read from source)
- Somnia Hideki testnet, chain id 50383, RPC `https://api.hideki2.infra.testnet.somnia.network`, BTC-PERP pool `0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0`
- Date: 2026-10-19, 09:30–10:00 UTC (eth_call); real transaction 14:38 UTC
- Wallet: `0x2A11e7388D1D2F9690f2636846d44b478f61bF08` (eth_call `from`)
