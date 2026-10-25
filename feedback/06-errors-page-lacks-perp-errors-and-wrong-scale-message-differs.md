# Docs: the Errors page has none of the perp errors (MarginBank, PerpPool, VoucherDistributor) that the developer page sends readers to
Severity: normal
Area: docs

> **Summary.** The perps developer page ends its order-error section with "The full list of order errors is on the Errors
> page", but that page lists 48 spot / order-book selectors and no perp, MarginBank or voucher error at all.

> **Re-verified 2026-10-25, 22:37 UTC.** The Errors page (now also at app.dreamdex.io/docs/developers/contracts/errors) still has only SpotPool, SpotStopOrderRegistry and Preflight sections. It has 0 matches for `InsufficientCollateral`, `MaxPositionSizeExceeded`, `IsolatedMarketBlocked`, `Voucher`, `SelfClaimDisabled`, `MarginBank` and `PerpPool`. The developer page still names `InsufficientCollateral()` (`0x3a23d825`), `MaxPositionSizeExceeded()` (`0x714b36d6`) and `IsolatedMarketBlocked`, and still says "The full list of order errors is on the Errors page". Evidence: `evidence/recheck_2026-10-25T2239Z.txt`, section 06.

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

## Steps to reproduce
1. Open `/docs/developers/contracts/errors`; search for `InsufficientCollateral`, `MaxPositionSizeExceeded`,
   `IsolatedMarketBlocked`, `Voucher`. No matches (the page has `ImmediateOrCancelNoFill`,
   `OrderAlreadyExpired`, `AmendReplacementRejected`, `OrderRejected`, but nothing from the MarginBank).
2. Open `/docs/developers/perps-testnet` and read the order-error section that links to the Errors page.
3. Optional: trigger the perp errors with `eth_call` and look them up on the Errors page:
   `node scripts/sim_orders.mjs <contractErrorsAbi.ts> 0x420691db9d2b5a79210fda48c177471386b6dfd1 0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0`
   (BTC-PERP) and `node scripts/sim_cap.mjs`.

## Expected
Perp errors (at least the ones the developer page itself names) listed with selector and fix.

## Actual
Errors page: 0 perp / MarginBank / voucher entries.

For contrast, the order errors the docs do describe reproduce as documented on BTC-PERP
(`scripts/sim_orders.mjs`, from `0x4206…dfd1`): off-tick price -> `InvalidPrice(price, tickSize)` `0xaf608abb`;
below `minQuantity` -> `QuantityBelowMinimum` `0xeaa68ceb`; not a lot multiple -> `InvalidQuantity`
`0x4f174b29`; `expireTimestampNs = 0` -> `OrderAlreadyExpired` `0x3154078e`; IOC with no fill ->
`ImmediateOrCancelNoFill` `0xd48c4403`; FOK -> `FillOrKillNotFillable` `0xc04ad919`; PostOnly crossing
-> `PostOnlyWouldCross` `0x7cf05fcb`. A bid that nets the account past `maxPositionSize` reverts with
`MaxPositionSizeExceeded` `0x714b36d6`, which the developer page names and the Errors page does not list.

## Evidence
- Errors page text as fetched 2026-10-19 ~09:40 UTC; re-checked 2026-10-20 02:40 UTC, still no perp errors
  (`evidence/recheck_2026-10-20T0235Z.txt`).
- `scripts/errsel.mjs` builds the selector map from the SDK's `contractErrorsAbi.ts`;
  `scripts/sim_orders.mjs` / `scripts/sim_cap.mjs` print the simulated reverts above.

## Suggested fix
Add a "Perps (MarginBank, PerpPool, VoucherDistributor)" table to the Errors page generated from the
same source as `contractErrorsAbi.ts`, including `SelfClaimDisabled()` `0x3e31dcc2`.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (error ABI read from source)
- Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and SDK), RPC `https://api.hideki2.infra.testnet.somnia.network`, BTC-PERP pool `0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0`
- Date: 2026-10-19, 09:30–10:00 UTC (eth_call); docs re-checked 2026-10-20 02:40 UTC
- Wallet: `0x2A11e7388D1D2F9690f2636846d44b478f61bF08` (eth_call `from`)
- Re-verified 2026-10-25 UTC on Somnia Tokyo testnet (see the note under the summary)

## Corrections
- **Corrected 2026-10-20.** Removed the second half of this report (the "wrong scale" revert message is
  `ERC20: insufficient allowance`, not the documented `transfer amount exceeds balance`), and retitled the file. That
  half described expected behaviour for SDK users: the SDK approves the bank for `maxUint256` before it deposits
  ([`src/perp/margin.ts`](https://unpkg.com/@somnia-chain/markets-sdk@0.32.1/src/perp/margin.ts), line 1530: "it approves
  `maxUint256`, as the send path does"), so an owner who deposited through the SDK gets the documented message. We only
  saw `insufficient allowance` because our test accounts had never approved anything. It also made this file hold two
  issues. The removed text, and its transaction `0x80b708fd…3078`, stay in the git history (commits `66e8188`, `b69748b`)
  and in `evidence/onchain_txs_2026-10-19.txt`. Added the summary.
