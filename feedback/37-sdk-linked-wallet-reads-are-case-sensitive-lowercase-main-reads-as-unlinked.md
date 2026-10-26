# SDK: linked-wallet reads compare addresses case-sensitively, so a `main` wallet passed in lowercase reads as `isMain: false` and `quotePerpFundingPayer` returns `{funded: false, reason: "unlinked"}`
Severity: normal
Area: SDK

> **Summary.** `client.getPerpWalletLinkage(registry, addr)` and `client.quotePerpFundingPayer(marginBank, addr)`
> compare the caller's `addr` against the checksummed address they read from the chain with a raw `===` / `!==`
> string compare. Pass a `main` wallet in lowercase — the exact form the indexer's `PerpWalletLinkEvent.main`
> returns, so the natural thing to feed back in — and the reads are wrong: `isMain: false`, `isChild: true`, and
> `quotePerpFundingPayer` says `{funded: false, reason: "unlinked"}`. Pass the checksummed address and they are
> correct (`isMain: true`, reason `"isMain"`). The same SDK file `.toLowerCase()`s addresses before every indexer
> query it builds, so the normalization is applied on one path and skipped on the derived reads.

> **Checked 2026-10-26, 13:20 UTC, Somnia Tokyo testnet (chain 50383), SDK 0.32.1.** Live linked pair on the Hideki
> registry `0x5b3C5Bf1F7AdA852e8AA783f6299932E32073aFb`: main `0x93B72Eac…D5A31e`, child `0x19E7E376…DAff2A`.
> Evidence: `evidence/37/linked_wallet_case_2026-10-26T1320Z.txt`.

EVM addresses are case-insensitive; the EIP-55 checksum is only a typo guard. A read keyed on an address must accept
any case. These reads do, for the child, by luck (a child's answer does not depend on `main === wallet`), but not for
the main wallet, where the whole result hinges on that comparison.

## Steps to reproduce
Configure a `SomniaMarkets` client for Hideki and call the two reads with the `main` address in both cases
(`node evidence/37/link2.mjs`, read-only):

```js
const REG = '0x5b3C5Bf1F7AdA852e8AA783f6299932E32073aFb';
const MB  = '0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
const mainLower = '0x93b72eac8f4c06d8adfccd2fa47e1b5a93d5a31e';
await client.getPerpWalletLinkage(REG, mainLower);         // and getAddress(mainLower)
await client.quotePerpFundingPayer(MB, mainLower);         // and getAddress(mainLower)
```

## Expected
The main wallet reads `isMain: true` and `quotePerpFundingPayer` returns `reason: "isMain"` regardless of the case of
the address passed in, exactly as it does for the checksummed form. (The indexer query paths in the same module
already lowercase their inputs.)

## Actual
Run 2026-10-26 13:20 UTC (`evidence/37/linked_wallet_case_2026-10-26T1320Z.txt`):

| address passed | `getPerpWalletLinkage` | `quotePerpFundingPayer` |
|---|---|---|
| main, lowercase | `isMain: false`, `isChild: true` | `{funded: false, reason: "unlinked"}` |
| main, checksummed | `isMain: true`, `isChild: false` | `{funded: false, reason: "isMain"}` |
| child, lowercase | `isMain: false`, `isChild: true` | `{funded: true, payer: "0x93B7…A31e"}` |
| child, checksummed | `isMain: false`, `isChild: true` | `{funded: true, payer: "0x93B7…A31e"}` |

The cause is a raw-case compare of the caller's address against the chain's checksummed value, in
`dist/perp/linkedWallet.js`:

```
 97:  return { funded: false, reason: main === account ? "isMain" : "unlinked" };
159:  isChild: linked && main !== wallet,
160:  isMain:  linked && main === wallet && linkage.members.length > 1,
```

while the query builders in the same file normalize first:

```
284:  where.main   = { _eq: opts.main.toLowerCase() };
321:  where.account= { _eq: opts.account.toLowerCase() };
366:  where.payer  = { _eq: opts.payer.toLowerCase() };
```

Impact: a bot or UI that takes a `main` address from `PerpWalletLinkEvent` (lowercase) and asks "is this my main
wallet / who funds this account" gets told the funded main is unlinked.

## Evidence
- `evidence/37/linked_wallet_case_2026-10-26T1320Z.txt`: the four-row table above and the SDK source lines.
- `evidence/37/link2.mjs`, `evidence/37/link1.mjs`: the read-only scripts.
- SDK 0.32.1 `dist/perp/linkedWallet.js` lines 97, 159, 160 (raw compare) vs 284, 286, 321, 323, 364, 366
  (`.toLowerCase()` on the query paths).

## Suggested fix
Normalize both operands (`getAddress(...)` or `.toLowerCase()` on both sides) before the comparisons at
`linkedWallet.js:97`, `:159`, `:160`, and anywhere `main` / `wallet` / `account` are compared, as the query builders
in the same module already do.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (npm `latest`), run against Hideki
- Indexer `https://hideki-dev.smk.somnia.host/v1/graphql`, RPC `https://api.hideki2.infra.testnet.somnia.network`
- Somnia Tokyo testnet, chain id 50383 ("Hideki")
- Date: 2026-10-26, 13:20 UTC
- Wallets: the live linked pair shown (main `0x93B72Eac…D5A31e`, child `0x19E7E376…DAff2A`); read-only, no tx sent

**Distinct from** every other report we are aware of: no competitor repo touches the linked-wallet / main-funding
module (`getPerpWalletLinkage`, `quotePerpFundingPayer`, `getPerpMainFunding`). This is a pure SDK read-correctness
bug, not the stop or voucher behaviour others filed.
