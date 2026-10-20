# Docs: the developer page's only paper-USDso route, `claimPerpVoucher`, reverts for every caller with `SelfClaimDisabled()`
Severity: major
Area: docs

> **Summary.** "Get test funds" on the perps developer page tells developers to self-claim the 1,000 paper USDso with
> `claimPerpVoucher`. On Hideki that `claim()` reverts for every caller (`SelfClaimDisabled()`, `0x3e31dcc2`): the route fails 100 % of the time.

The developer page "Perps on Testnet for Developers" says, under **Get test funds**:

> Paper USDso. Any address can claim the 1,000 USDso perps credit once, as long as it holds no perp
> positions or orders

and gives this code:

```ts
const eligibility = await markets.client.getPerpVoucherEligibility(btc.marginBank, account)
if (eligibility.eligible) {
  await markets.trader.claimPerpVoucher({ marginBank: btc.marginBank })
}
```

On the live Hideki testnet the `VoucherDistributor.claim()` that `claimPerpVoucher` sends reverts for
**every** caller, including fresh addresses that satisfy all documented conditions, with a custom
error whose selector is `0x3e31dcc2` = `SelfClaimDisabled()`. The 1,000 USDso credits that do land
(indexer `MarginEvent` kind `Credited`) are all pushed by an operator batch transaction from
`0x792182e6b2bd50deb22dc5436f7c518b34f9bd12` (function selector `0x0677d0a3`), never by `claim()`.
So the only developer-facing route to paper USDso described on the developer page does not work,
and nothing on that page says that the credit is operator-granted (via the Perps Arena) only.

To be fair to the docs: the trading page `/docs/trading/perps-testnet` already says, as step 2, "Get paper USDso. Join
Perps Arena, the paper-trading competition, to receive 1,000 paper USDso". The gate is clearly deliberate (it has its
own named error). What is wrong is that the developer page, the one a bot developer reads, offers only the self-claim and
its code sample, and calls it open to "any address".

## Steps to reproduce
1. Pick any address. The one below is a fresh EOA with zero balance, no positions, no orders,
   never claimed. `MarginBank.getCreditGranter()` returns the documented distributor
   `0x2ACD9EFdA721450906bfE1bef3edE269636E42C4`.
2. Send `eth_call` for `claim()` (selector `0x4e71d92d`) to the distributor from that address:

```
curl -s -H 'content-type: application/json' https://api.hideki2.infra.testnet.somnia.network --data '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"from":"0x2A11e7388D1D2F9690f2636846d44b478f61bF08","to":"0x2ACD9EFdA721450906bfE1bef3edE269636E42C4","data":"0x4e71d92d"},"latest"]}'
```

3. Repeat with any other `from`: an active Perps Arena account (`0x420691db9d2b5a79210fda48c177471386b6dfd1`,
   21 active pools), an account that already holds a granted voucher (`0x567476bd43ff20e6aa44e18abfbdb58280563f45`,
   `isClaimed` = true), the MarginBank itself, `0x...dEaD`.
4. Compute `keccak256("SelfClaimDisabled()")[:4]`.

## Expected
Either the developer page says that paper USDso comes from the Perps Arena (and drops or caveats the
`claimPerpVoucher` sample), or self-claim works as the page describes: a fresh address claims 1,000 USDso once, and an
ineligible address reverts with one of the reasons the SDK names (`CampaignInactive`, `ClaimantNotFlat`,
`ClaimantIsMainFunded`, `AlreadyClaimed`, `BudgetExhausted`).

## Actual
Every caller gets the same revert, before any of the documented checks (an `AlreadyClaimed` account
also gets it):

```
{"jsonrpc":"2.0","id":1,"error":{"code":3,"message":"execution reverted","data":"0x3e31dcc2"}}
```

| `from` | state | `eth_call claim()` |
|---|---|---|
| `0x2A11e7388D1D2F9690f2636846d44b478f61bF08` | fresh EOA, flat, not claimed | revert `0x3e31dcc2` |
| `0x420691db9d2b5a79210fda48c177471386b6dfd1` | active trader, 21 active pools | revert `0x3e31dcc2` |
| `0x567476bd43ff20e6aa44e18abfbdb58280563f45` | holds a granted voucher, `isClaimed`=true | revert `0x3e31dcc2` |
| `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` | MarginBank (contract) | revert `0x3e31dcc2` |
| `0x000000000000000000000000000000000000dEaD` | | revert `0x3e31dcc2` |

`keccak256("SelfClaimDisabled()")` = `0x3e31dcc2…`. The selector occurs once in the runtime code of the
distributor's implementation `0x9657f0fd53efc01cd108d93c835bb4b517732b43` (EIP-1967 slot of the proxy),
next to the five documented ones (`ClaimantNotFlat` `0x3f3d2141`, `ClaimantIsMainFunded` `0x1fac9b7d`,
`BudgetExhausted` `0x16394a52`, `CampaignInactive` `0xe72b39f9`, `AlreadyClaimed` `0x646cf558`).

The campaign itself is open: `getConfig()` at block 27493835 (timestamp 1792401198) returns
`campaignStart 1790553600`, `campaignEnd 1798477478`, `grantAmount 1000e18`, `expiryDuration 1209600`,
and `budgetRemaining()` = `587776000e18`.

### Real transaction (added 2026-10-19 15:20 UTC)
The same `claim()` sent as a real transaction from the fresh address once it had gas (5 STT from the
app's Link a bot flow), still flat, never claimed, never main-funded:

| tx | block / time (UTC) | status | gas used | revert |
|---|---|---|---|---|
| `0x6c46afbd0041edecffe082696dd59b190d1073d8e9fa75e8862b16fa2c5b427b` | 27687620 / 14:36:29 | `0x0` (reverted) | 22,781 of 1,000,000 | `0x3e31dcc2` `SelfClaimDisabled()` |

The receipt (`eth_getTransactionReceipt` on the RPC above) shows `status 0x0`, `gasUsed 0x58fd`. Gas used is far below
the limit, so this is a revert, not out-of-gas. Replaying the call at the parent block (`eth_call … "0x1a67ac3"`)
returns `"data":"0x3e31dcc2"`. After the tx, `isClaimed(0x2A11…bF08)` is still `false` and
`voucherExpiryOf` is `0`. (Hideki has no public explorer for reverted transactions. The app's markets explorer
shows only indexed market events, so use the receipt.)

## Evidence
- Real reverted transaction above (2026-10-19 14:36 UTC); `evidence/onchain_txs_2026-10-19.txt` lists it with gas and fee.
- eth_call request/response above (block ~27,493,835, 2026-10-19 ~09:15 UTC); reproducible with
  `node scripts/claim_from.mjs <address...>` in this repo.
- Credits that did land were operator pushes, not claims (indexer `MarginEvent`, kind `Credited`,
  granter `0x2acd…42c4`):
  - tx `0xa388c2d1abdde473e77eb6d0943723914d037400fd2b97a12bdc5128813a649f`, block 27156917
    (2026-10-18 23:51:29 UTC), from `0x792182e6…bd12`, to the distributor, selector `0x0677d0a3`,
    3 accounts credited 1,000 USDso each.
  - tx `0xe7f5ffccbc43c00a865c850a2ea7d2cfb8c3b9f4f94d13a1a2df3b863234fff6`, block 27151510
    (2026-10-18 23:42:28 UTC), same sender and selector, 5 accounts credited.

## Suggested fix
Either enable self-claims on the deployed distributor, or change the developer page: state that paper
USDso is granted by the Perps Arena (join in the app) and remove / caveat the `claimPerpVoucher`
sample. In both cases document `SelfClaimDisabled()` (`0x3e31dcc2`) on the Errors page.
The SDK side of this (eligibility says `eligible: true`, error not decodable) is a separate report:
`02-sdk-voucher-eligibility-ignores-self-claim-disabled.md`.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (source read from the npm tarball; not executed)
- Somnia Hideki testnet ("Tokyo"), chain id 50383, RPC `https://api.hideki2.infra.testnet.somnia.network`
- Date: 2026-10-19, 09:00–10:00 UTC (eth_call); real transaction 14:36 UTC; re-checked 2026-10-20 02:35 UTC (same
  revert for a fresh address, an active trader and an `isClaimed` account, `evidence/recheck_2026-10-20T0235Z.txt`)
- Wallet used as `from`: `0x2A11e7388D1D2F9690f2636846d44b478f61bF08`

## Corrections
- **Corrected 2026-10-20.** Area is now `docs` only (the distributor's gate is deliberate; the defect is the developer
  page). Retitled to match, rewrote Expected as "the page names the Arena, or self-claim works", and added that the
  trading page already names the Arena as the source of paper USDso. Added the summary. The evidence is unchanged.
