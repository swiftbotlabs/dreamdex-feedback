# SDK docs: the SDK's own reference site (prd.smk.somnia.host/docs/typescript) still documents 0.31.0, so `SOMNIA_HIDEKI_TESTNET_ADDRESSES` is a 404 and the voucher methods the perps developer page uses (and the account-equity reads the Perps guide uses) are missing
Severity: normal
Area: docs

> **Summary.** npm `latest` is 0.32.1, and its `homepage` and README send readers to https://prd.smk.somnia.host/docs/typescript.
> On 2026-10-26 that site still matches 0.31.0. The `SOMNIA_HIDEKI_TESTNET_ADDRESSES` reference page returns 404, the Trader and
> SomniaMarketsClient pages have no voucher or account-equity methods, the Perps guide has no "Credit vouchers" section, and the
> release notes end at 0.31.0. The dreamDEX perps developer page pins 0.32.1, and its Connect and Get test funds snippets use the address
> constant and the voucher methods. The 404 was still there at 04:51 UTC.

The dreamDEX developer page "Perps on Testnet for Developers" says "this page uses version 0.32.1, the one the app runs"
(README.md line 3). Its Connect snippet imports `SOMNIA_HIDEKI_TESTNET_ADDRESSES` (lines 34 and 42). Its "Get test funds"
snippet calls `markets.client.getPerpVoucherEligibility(btc.marginBank, account)` and then
`markets.trader.claimPerpVoucher({ marginBank: btc.marginBank })` (lines 58 and 60). The SDK's own Perps guide builds its
scoring recipe on `client.getAccountEquity` (0.32.1 `docs/PERPS.md` lines 87, 108 and 110).

The package names one place to look these up. Its `package.json` `homepage` is https://prd.smk.somnia.host/docs/typescript.
The 0.32.1 README links its "documentation map" (line 84) and its Perps guide (line 99) to that site. The other SDK docs site
in the bounty's Resources sends readers there too: on https://somnia-platform-docs.vercel.app/markets/somnia-markets, the
sentence "The generated API reference lists every exported function, hook and type." links to
https://prd.smk.somnia.host/docs/typescript/api.

On that site (fetched 2026-10-26, 03:24–03:28 UTC):

| What a 0.32.1 user looks up | Hosted site | 0.32.1 package |
|---|---|---|
| `SOMNIA_HIDEKI_TESTNET_ADDRESSES` reference page | **404** "Page not found" (the `SOMNIA_TESTNET_ADDRESSES` page answers 200) | `dist/addresses.d.ts:28`, exported from `dist/index.d.ts:10` |
| `claimPerpVoucher`, `buildClaimPerpVoucher` | 0 matches on the Trader page | `dist/trade.d.ts:3448` and `:3806` |
| `getPerpVoucherEligibility`, `getPerpVoucherCampaign`, `getPerpVoucher` | 0 matches on the SomniaMarketsClient page | `dist/somniaMarketsClient.d.ts:4553`, `:4511`, `:4591` |
| `getAccountEquity`, `listAccountEquities` | 0 matches on the SomniaMarketsClient page | `dist/somniaMarketsClient.d.ts:3285` and `:3345` |
| Perps guide, "Credit vouchers" section | 0 matches on `/perps` | `docs/PERPS.md:809` "## Credit vouchers (house money)" |
| Release notes for 0.32.0 and 0.32.1 | newest entry is "0.31.0"; no 0.32.x anywhere on the page | 0.32.0 published 2026-10-12T13:25Z, 0.32.1 2026-10-13T09:04Z |

The same pages do list methods that both versions share (Trader: `placePerpOrder`, 6 matches; SomniaMarketsClient:
`getMaxPerpOrderSize`, 4), so the pages are complete and the search works. The `SOMNIA_*` constants on the hosted API index
are exactly the six that 0.31.0 exports. 0.32.1 exports those six plus `SOMNIA_HIDEKI_TESTNET_ADDRESSES`. None of the
missing client methods or constants exists in the 0.31.0 package. (`getAccountEquity` appears in 0.31.0 only as the
MarginBank ABI entry in `dist/readsAbi.js:287`, not as a client method.) The site shows no version label and no version
selector, so a reader cannot tell that it is behind.

So a builder who follows the developer page and opens the SDK reference gets a 404 for the address constant. The same reader
finds no entry for the eligibility result's fields, for `claimPerpVoucher`'s parameters and errors, or for
`getAccountEquity`'s `scope` options. The types behind them, `PerpVoucherEligibility`, `ClaimPerpVoucherParams` and
`GetAccountEquityParams`, also have 0 matches on the hosted API index, the Trader page and the SomniaMarketsClient page.
Each one appears in 3 files of the 0.32.1 `dist/` and in no file of the 0.31.0 `dist/`.

Scope: this report is about the hosted site lagging the published package. It is not about which SDK version a project
installs, and not about the text of the bundled `docs/PERPS.md`. The 0.32.1 copy of that file has the "Credit vouchers"
section that the hosted Perps guide lacks.

## Steps to reproduce
1. `npm view @somnia-chain/markets-sdk dist-tags.latest homepage` -> `0.32.1`, `https://prd.smk.somnia.host/docs/typescript`.
2. `curl -s -o /dev/null -w '%{http_code}\n' https://prd.smk.somnia.host/docs/typescript/api/index/variables/SOMNIA_HIDEKI_TESTNET_ADDRESSES`
   -> `404`. The same URL ending in `SOMNIA_TESTNET_ADDRESSES` -> `200`.
3. `curl -s https://prd.smk.somnia.host/docs/typescript/api/index/interfaces/Trader | grep -o claimPerpVoucher | wc -l` -> `0`
   (control: `placePerpOrder` -> `6`).
4. `curl -s https://prd.smk.somnia.host/docs/typescript/api/index/interfaces/SomniaMarketsClient | grep -o getPerpVoucherEligibility | wc -l`
   -> `0`. Same for `getPerpVoucherCampaign`, `getAccountEquity` and `listAccountEquities` (control: `getMaxPerpOrderSize` -> `4`).
5. `curl -s https://prd.smk.somnia.host/docs/typescript/perps | grep -o 'Credit vouchers' | wc -l` -> `0`.
6. Open https://prd.smk.somnia.host/docs/typescript/release-notes. The first entry under "Release notes" is "0.31.0", and the page
   names no 0.32.x version.
7. Package side: `npm pack @somnia-chain/markets-sdk@0.32.1` and `npm pack @somnia-chain/markets-sdk@0.31.0` into empty folders,
   extract, then `grep -rlw claimPerpVoucher package/dist | wc -l` (0.32.1: 5, 0.31.0: 0) and
   `grep -n 'Credit vouchers' package/docs/PERPS.md` (0.32.1: line 809, 0.31.0: none).
8. Compare with https://app.dreamdex.io/docs/developers/perps-testnet/README.md, lines 3, 34, 42, 58 and 60.

`bash evidence/23/hosted-ref_check.sh <pages dir> <0.31.0 package dir> <0.32.1 package dir>` runs all of these. It sends only
read-only GETs, one per second.

## Expected
The reference site that the package names as its homepage documents the `latest` release: the
`SOMNIA_HIDEKI_TESTNET_ADDRESSES` page, the voucher methods, the account-equity reads, the "Credit vouchers" section and the
0.32.0 and 0.32.1 release notes. If it documents an older version, it should say which one and link to the current docs.

## Actual
Run 2026-10-26 03:27–03:28 UTC (`evidence/23/hosted-ref_check_2026-10-26T0327Z.txt`):

```
  200  339615 B  https://prd.smk.somnia.host/docs/typescript/api/index/variables/SOMNIA_TESTNET_ADDRESSES
  404  28762 B  https://prd.smk.somnia.host/docs/typescript/api/index/variables/SOMNIA_HIDEKI_TESTNET_ADDRESSES
  Trader.html: claimPerpVoucher=0 buildClaimPerpVoucher=0 ...
  Client.html: ... getPerpVoucherEligibility=0 getPerpVoucherCampaign=0 getPerpVoucher=0 getAccountEquity=0 listAccountEquities=0 ...
  controls: Trader.html placePerpOrder=6  Client.html getMaxPerpOrderSize=4  perps.html getMaxPerpOrderSize=2
  perps.html 'Credit vouchers'=0
  404 page <title>: <title>Page not found · SomniaMarkets</title>
  headings: Release notes | 0.31.0 | Minor Changes | ...
  highest 0.x.y version named anywhere on the page: 0.31.0
  hosted /api : SOMNIA_MAINNET_ADDRESSES SOMNIA_MAINNET_LEND SOMNIA_MAINNET_PRICE_FEED SOMNIA_TESTNET_ADDRESSES SOMNIA_TESTNET_LEND SOMNIA_TESTNET_PRICE_FEED
  0.31.0      : SOMNIA_MAINNET_ADDRESSES SOMNIA_MAINNET_LEND SOMNIA_MAINNET_PRICE_FEED SOMNIA_TESTNET_ADDRESSES SOMNIA_TESTNET_LEND SOMNIA_TESTNET_PRICE_FEED
  0.32.1      : SOMNIA_HIDEKI_TESTNET_ADDRESSES SOMNIA_MAINNET_ADDRESSES SOMNIA_MAINNET_LEND SOMNIA_MAINNET_PRICE_FEED SOMNIA_TESTNET_ADDRESSES SOMNIA_TESTNET_LEND SOMNIA_TESTNET_PRICE_FEED
```

Package files (`grep -rlw NAME package/dist | wc -l`):

| name | 0.31.0 | 0.32.1 |
|---|---|---|
| `claimPerpVoucher` | 0 | 5 |
| `getPerpVoucherEligibility` | 0 | 5 |
| `getPerpVoucherCampaign` | 0 | 4 |
| `listAccountEquities` | 0 | 4 |
| `SOMNIA_HIDEKI_TESTNET_ADDRESSES` | 0 | 5 |
| `getAccountEquity` | 2 (ABI entry in `readsAbi.js` / `.d.ts` only) | 10 |

We first saw this on 2026-10-26 at 01:06 UTC. The status codes and page sizes were the same then as at 03:27 UTC.

## Evidence
- `evidence/23/hosted-ref_check_2026-10-26T0327Z.txt`: full output: npm metadata, the status and size of each page, name counts with
  controls, release-notes headings, package counts and declarations, README links, the developer page lines, the
  vercel quote and link, the constants comparison, and the counts for the parameter and result types (section 9).
- `evidence/23/hosted-ref_check.sh`: the script that produced it.
- `evidence/23/hosted-ref_404_SOMNIA_HIDEKI_TESTNET_ADDRESSES_2026-10-26T0327Z.html`: the 404 page as served.
- `evidence/23/hosted-ref_release-notes_2026-10-26T0327Z.html.gz`: the release-notes page as served.
- `evidence/23/hosted-ref_dreamdex-perps-testnet-README_2026-10-26T0327Z.md`: the developer page as served.
- The tarballs' sha512 matched npm `dist.integrity` for both versions (0.32.1 `sha512-RfshQP8X…F0Og==`, 0.31.0
  `sha512-mz1lDoFh…nH1eg==`).

## Suggested fix
Rebuild and redeploy https://prd.smk.somnia.host/docs/typescript (API reference, guides and release notes) from the 0.32.1
sources, and make the npm release step redeploy it. Show the documented version in the site header so readers can see when it
lags.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (npm `latest`) and 0.31.0 (tarballs read as text; not executed)
- Hosted SDK docs `https://prd.smk.somnia.host/docs/typescript`, fetched 2026-10-26 03:24–03:28 UTC (first seen 01:06 UTC)
- dreamDEX developer page `https://app.dreamdex.io/docs/developers/perps-testnet` (README.md), fetched 2026-10-26 03:27 UTC
- Somnia docs `https://somnia-platform-docs.vercel.app/markets/somnia-markets`, fetched 2026-10-26 03:27 UTC
- Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and SDK); the APIs above are the ones its perps flow uses
- Wallet: n/a (read-only)
