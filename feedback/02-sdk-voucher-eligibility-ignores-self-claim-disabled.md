# SDK: `getPerpVoucherEligibility` returns `eligible: true` while `claim()` reverts, and `SelfClaimDisabled()` is missing from `contractErrorsAbi`
Severity: normal
Area: SDK

> **Summary.** Two SDK defects: an eligibility helper that says it mirrors `claim()` skips the deployed distributor's
> first gate, and the SDK's error ABI cannot decode the revert that gate produces (`0x3e31dcc2`).

**Distinct from report 01:** 01 is the developer page's paper-USDso route (docs; fix in the docs or the distributor's
config). This report is two defects in the SDK package itself (fix in `src/perp/voucher.ts` and
`src/contractErrorsAbi.ts`). They stay wrong whatever the self-claim policy is: the helper skips a gate that exists in the
deployed contract, and the ABI lacks an error the contract emits. The real transaction `0x6c46afbd…427b` in report 01 is
the revert this SDK cannot decode.

`getPerpVoucherEligibility` (src/perp/voucher.ts) documents itself as mirroring the checks of
`VoucherDistributor.claim()` "in the order the contract checks them, so the first failure here is the
revert a claim would produce at this block". It checks six things (granter set, campaign window,
`getActivePerpPools`, `getMainFundedPrincipal`, `isClaimed`, `budgetRemaining`). The deployed
distributor has a seventh, earlier gate: self-claims are disabled, and `claim()` reverts with
`SelfClaimDisabled()` (`0x3e31dcc2`) for every caller (see report 01). The SDK therefore:

1. answers `{ eligible: true, grantAmount: 1000e18 }` for a fresh address, and
2. when the caller follows that answer with `trader.claimPerpVoucher`, surfaces an undecoded revert,
   because `SelfClaimDisabled` is not in `src/contractErrorsAbi.ts` (546 entries in 0.32.1; the
   0.32.2-canary build adds only `CaptureOpen`). The documented reasons `notStarted`/`ended`/`notFlat`/
   `mainFunded`/`alreadyClaimed`/`budgetExhausted` can never be reached on this deployment.

The bounty's own developer page builds its "Get test funds" sample on exactly this pair of calls.

## Steps to reproduce
1. Reproduce the SDK's eligibility reads for a fresh address with plain RPC (same contract reads as
   `getPerpVoucherEligibility`, pinned to one block):
   - `MarginBank(0x478769E1177C0773c43A593DCCc4Ad15F15F1394).getCreditGranter()` -> `0x2ACD9EFdA721450906bfE1bef3edE269636E42C4`
   - block 27493835, timestamp 1792401198
   - `VoucherDistributor.getConfig()` -> campaignStart 1790553600, campaignEnd 1798477478, grantAmount 1000000000000000000000
   - `MarginBank.getActivePerpPools(0x2A11e7388D1D2F9690f2636846d44b478f61bF08)` -> `[]`
   - `MarginBank.getMainFundedPrincipal(0x2A11…bF08)` -> `0`
   - `VoucherDistributor.isClaimed(0x2A11…bF08)` -> `false`
   - `VoucherDistributor.budgetRemaining()` -> `587776000000000000000000000`
   All six SDK checks pass, so the function returns `{ eligible: true }`.
2. `eth_call` the exact call `claimPerpVoucher` builds (`claim()`, `0x4e71d92d`, to the granter) from
   the same address:
   ```
   {"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"from":"0x2A11e7388D1D2F9690f2636846d44b478f61bF08","to":"0x2ACD9EFdA721450906bfE1bef3edE269636E42C4","data":"0x4e71d92d"},"latest"]}
   ```
3. Try to decode `0x3e31dcc2` with the SDK's error ABI: build a selector map from
   `src/contractErrorsAbi.ts` (`node scripts/errsel.mjs <path-to-contractErrorsAbi.ts> 0x3e31dcc2`).

## Expected
- `getPerpVoucherEligibility` returns `eligible: false` with a reason when a claim would revert
  (its contract says the reason "names the revert a claim would produce at the same block").
- A revert from `claimPerpVoucher` decodes to a named error.

## Actual
- Eligibility: `eligible: true` (all six reads pass).
- `eth_call` response: `{"error":{"code":3,"message":"execution reverted","data":"0x3e31dcc2"}}`.
- `0x3e31dcc2 => UNKNOWN` against all 546 errors in `contractErrorsAbi.ts` (0.32.1) and all 547 in
  `0.32.2-canary.38575926931.ge4550933d36d`. `keccak256("SelfClaimDisabled()")` = `0x3e31dcc2`.
- The same revert comes back for an `isClaimed == true` account
  (`0x567476bd43ff20e6aa44e18abfbdb58280563f45`), proving the gate precedes `AlreadyClaimed`.

## Evidence
- `node scripts/voucher_check.mjs` output (this repo): all eligibility reads, the eth_call, the code
  at both addresses.
- `node scripts/claim_from.mjs 0x567476bd43ff20e6aa44e18abfbdb58280563f45` ->
  `claimed: true ... REVERT 0x3e31dcc2`.
- `node scripts/errsel.mjs .../contractErrorsAbi.ts 0x3e31dcc2` -> `UNKNOWN` (546 errors parsed).

## Suggested fix
- Add `{ type: "error", name: "SelfClaimDisabled", inputs: [] }` to `contractErrorsAbi` (and to the
  `errors:gen` source it is generated from).
- Add a `selfClaimDisabled` reason to `PerpVoucherIneligibleReason`, checked first, from whatever
  view exposes the flag on the distributor (if none exists, expose one; a `simulate` of `claim()` is
  the fallback). Until then, `getPerpVoucherEligibility` should not claim to mirror `claim()`.
- Update the developer page sample accordingly (report 01).

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 and 0.32.2-canary.38575926931.ge4550933d36d (source read from
  the npm tarballs; nothing executed)
- Somnia Hideki testnet ("Tokyo"), chain id 50383, RPC `https://api.hideki2.infra.testnet.somnia.network`
- Date: 2026-10-19, 09:00–10:00 UTC
- Wallet: `0x2A11e7388D1D2F9690f2636846d44b478f61bF08`

## Corrections
- **Corrected 2026-10-20.** Severity lowered from major to normal: on its own the impact is small (a developer already
  blocked by report 01 gets a misleading `eligible: true` and then an undecodable revert). Added the summary and the
  "Distinct from report 01" paragraph. Nothing else changed; 0.32.1 is still the npm `latest` (re-checked 2026-10-20
  02:35 UTC, `evidence/recheck_2026-10-20T0235Z.txt`).
