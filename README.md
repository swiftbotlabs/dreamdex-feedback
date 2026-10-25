<p align="center">
  <img src="assets/banner.png" width="100%" alt="dreamDEX feedback: 10 reproducible reports on Somnia Tokyo testnet, by Swift Bot Labs">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/reports-10-7c5cff?style=flat-square" alt="reports: 10">
  <img src="https://img.shields.io/badge/archived-2-6e7781?style=flat-square" alt="archived: 2">
  <img src="https://img.shields.io/badge/chain-50383%20(Tokyo)-30363d?style=flat-square" alt="chain: 50383 (Tokyo)">
  <img src="https://img.shields.io/badge/markets--sdk-0.32.1-30363d?style=flat-square" alt="markets-sdk: 0.32.1">
  <img src="https://img.shields.io/badge/re--checked-2026--10--25-1f883d?style=flat-square" alt="re-checked: 2026-10-25">
</p>

Ten issue reports for the **dreamDEX Perps Builder Bounty (Feedback track)**, found on **Somnia Tokyo testnet** (chain id
50383; the docs and the SDK call it "Hideki"): 3 major and 7 normal. Each one is a single Markdown file in [`feedback/`](feedback)
that follows the bounty template (Severity, Area, Steps to reproduce, Expected, Actual, Evidence, Environment) and opens
with a two-line summary. Each also has a one-command reproduction or exact manual steps, plus saved output in
[`evidence/`](evidence).

**Re-verified 2026-10-25, 22:37–23:04 UTC**, against SDK 0.32.1 (still npm `latest`), the current docs (app.dreamdex.io/docs)
and the live testnet: all ten still reproduce, and #04 is worse (13 of 13 busy accounts now fail). #08 was re-run with a
brand-new account, and #09 with a fresh transaction. Each report has a dated "Re-verified 2026-10-25" note under its summary
([re-check log](evidence/recheck_2026-10-25T2239Z.txt)). Two earlier reports are [archived](#archived): 07 was withdrawn on
2026-10-20, and 11 no longer reproduces as filed, because the explorer now points users to the right network.

**Severity** (the bounty's scale: critical | major | normal): ![major](https://img.shields.io/badge/major-d73a49?style=flat-square)
![normal](https://img.shields.io/badge/normal-d29922?style=flat-square) · Jump to: [Major](#major) ·
[Normal](#normal) · [Archived](#archived) · [Fix checklist](#fix-checklist) · [Index](#index) · [Quick start](#quick-start)

## Major

These three stop users or developers today, ranked by impact.

### #10 · Every perps route redirects to the STT-USDso spot market
![major](https://img.shields.io/badge/major-d73a49?style=flat-square) &nbsp;`app`

**Impact:** nobody can open the perps trading view in the app while the Perps Arena is running. The nav, the logo, the
Arena's **Start trading** / **Start Trading Now** buttons and the market selector's perp rows all end on STT-USDso spot,
whether the user is logged in or not, from 38 check-host nodes in 25 countries (2026-10-20). On 2026-10-20 the app's own
flags said perps were on (`gate-perps: false`, `perps-default-landing: true`).

<img src="assets/shot-10-perps-redirect.png" width="600" alt="Requesting /trade/perps/tokyo/BTC-PERP while logged out lands on the STT-USDso spot market">

**Repro:** `curl -sI https://app.testnet.dreamdex.io/trade/perps/tokyo/BTC-PERP | grep -i location` → `location: /trade/spot/tokyo/STT:USDso`<br>
[Report](feedback/10-app-every-perps-route-redirects-to-the-stt-spot-market.md) ·
[Evidence](evidence/perps_redirect_2026-10-25T2245Z.txt) · First reported
[2026-10-19 19:42 UTC](https://github.com/swiftbotlab/dreamdex-feedback/commit/f5cef3d) · Re-checked 2026-10-25 22:45–22:48 UTC:
still `307` to STT-USDso spot, logged out and logged in; the Arena's **Start trading** lands on spot
([screenshot](evidence/perps-redirect-start-trading-2026-10-25.png))

### #01 · The developer page's only paper-USDso route, `claimPerpVoucher`, reverts with `SelfClaimDisabled()`
![major](https://img.shields.io/badge/major-d73a49?style=flat-square) &nbsp;`docs`

**Impact:** "Get test funds" on the developer page offers one route to paper USDso, `claimPerpVoucher`, and it fails for
every caller: `claim()` reverts with `0x3e31dcc2` before any of the documented checks. (The trading page does say paper
USDso comes from the Perps Arena; the developer page does not.)

**Repro:** `node scripts/claim_from.mjs 0x000000000000000000000000000000000000dEaD` → `REVERT 0x3e31dcc2`<br>
[Report](feedback/01-paper-usdso-self-claim-disabled-on-chain.md) · [Evidence](evidence/recheck_2026-10-25T2239Z.txt) ·
First reported [2026-10-19 09:41 UTC](https://github.com/swiftbotlab/dreamdex-feedback/commit/66e8188) · Re-checked
2026-10-25 22:39 UTC: same revert for four callers, and the docs still show the `claimPerpVoucher` sample

### #04 · Indexer `MarginEvents` query used by the SDK fails for every busy account we tested
![major](https://img.shields.io/badge/major-d73a49?style=flat-square) &nbsp;`API`

**Impact:** `getMarginEvents(account, { kinds })`, the read behind the documented portfolio-return recipe, fails every
time after about 10.5 s with a generic `database query error` for all 13 busy accounts we tested on 2026-10-25 (6 of 13
on 2026-10-20; all have more than 100k rows), the market makers and bots it is meant for. Quiet accounts are not affected.

**Repro:** `bash scripts/indexer_accounts.sh 0x47537e3a3ea6e9391f3b26ea45618db6828c8bff` → `SDK shape: 10.5s ERROR`<br>
[Report](feedback/04-indexer-margin-events-query-times-out.md) ·
[Evidence](evidence/indexer_accounts_2026-10-25T2240Z.txt) · First reported
[2026-10-19 09:41 UTC](https://github.com/swiftbotlab/dreamdex-feedback/commit/66e8188) · Re-checked 2026-10-25 22:40–23:04 UTC:
13 of 13 busy accounts fail (6 of 13 on 2026-10-20)

## Normal

### #02 · SDK says `eligible: true` while `claim()` reverts, and the error is missing from `contractErrorsAbi`
![normal](https://img.shields.io/badge/normal-d29922?style=flat-square) &nbsp;`SDK`

**Impact:** two SDK defects, separate from #01's docs fix: `getPerpVoucherEligibility` says it mirrors `claim()` but skips
the distributor's first gate, and the SDK cannot decode the revert that gate produces.

**Repro:** `node scripts/voucher_check.mjs` → all six eligibility reads pass, then `"data":"0x3e31dcc2"`<br>
[Report](feedback/02-sdk-voucher-eligibility-ignores-self-claim-disabled.md) ·
[Evidence](evidence/recheck_2026-10-25T2239Z.txt) · First reported
[2026-10-19 09:41 UTC](https://github.com/swiftbotlab/dreamdex-feedback/commit/66e8188) · Re-checked 2026-10-25 22:39 UTC
(0.32.1 is still npm `latest`; the 0.32.2 canary has the same gap)

### #03 · Docs block six markets for paper USDso; the chain allows all 21
![normal](https://img.shields.io/badge/normal-d29922?style=flat-square) &nbsp;`docs`

**Impact:** a bot that trusts the docs' market table refuses six markets that a paper-USDso account can trade.
`isVoucherMarketAllowed` is `true` for all 21 pools, and a paper-USDso-only account's resting bid is accepted on ZEC-PERP
and PUMP-PERP (both "No" in the docs).

**Repro:** `node scripts/survey.mjs > survey.json` → `voucherAllowed: true` for every pool<br>
[Report](feedback/03-paper-usdso-market-allowlist-docs-vs-chain.md) ·
[Evidence](evidence/voucher_only_orders_2026-10-25T2240Z.txt) · First reported
[2026-10-19 09:41 UTC](https://github.com/swiftbotlab/dreamdex-feedback/commit/66e8188) · Re-checked 2026-10-25 22:40 UTC:
chain 21/21, voucher-only bids accepted on ZEC and PUMP (no-collateral control reverts), docs table unchanged

### #05 · Perps guide's trading-gain recipe throws, and its block window is silently ignored
![normal](https://img.shields.io/badge/normal-d29922?style=flat-square) &nbsp;`docs`

**Impact:** the documented recipe throws on kind `CreditReclaimed`. Without that kind, `getMarginEvents` 0.32.1 ignores
`sinceBlock` / `toBlock`, so the recipe also counts deposits made before the window, with no error.

**Repro:** `npm pack @somnia-chain/markets-sdk@0.32.1 && tar xzf somnia-chain-markets-sdk-0.32.1.tgz && grep -c sinceBlock package/src/perp/history.ts` → `0`<br>
[Report](feedback/05-sdk-perps-guide-documents-getmarginevents-options-that-0.32.1-does-not-have.md) · Evidence: source
lines quoted in the report · First reported
[2026-10-19 09:41 UTC](https://github.com/swiftbotlab/dreamdex-feedback/commit/66e8188) · Re-checked 2026-10-25 22:39–22:44 UTC
(0.32.1 and the canary unchanged; recipe still in the SDK docs)

### #12 · Indexer `MarginEvent` rows have no block number
![normal](https://img.shields.io/badge/normal-d29922?style=flat-square) &nbsp;`API`

**Impact:** fills, orders and liquidations carry a block, margin events only a seconds `timestamp`. With about 10 Hideki
blocks per second, the SDK docs' block-windowed flow read (blocks `a + 1` to `b`) cannot be done from the indexer. This is
the indexer half of #05, with its own fix (a column).

**Repro:** `bash scripts/margin_event_fields.sh` → `field 'blockNumber' not found in type: 'MarginEvent'`<br>
[Report](feedback/12-indexer-margin-events-have-no-block-number.md) ·
[Evidence](evidence/margin_event_fields_2026-10-25T2244Z.txt) · First reported
[2026-10-20 03:44 UTC](https://github.com/swiftbotlab/dreamdex-feedback/commit/efb7bb4) · Re-checked 2026-10-25 22:44 UTC

### #06 · The Errors page lacks the perp errors
![normal](https://img.shields.io/badge/normal-d29922?style=flat-square) &nbsp;`docs`

**Impact:** the developer page sends readers to an Errors page that lists none of the perp, MarginBank or voucher errors,
including ones the developer page itself names (`InsufficientCollateral`, `MaxPositionSizeExceeded`).

**Repro:** open `/docs/developers/contracts/errors` and search for `InsufficientCollateral` or `Voucher` → no match<br>
[Report](feedback/06-errors-page-lacks-perp-errors-and-wrong-scale-message-differs.md) · First reported
[2026-10-19 09:41 UTC](https://github.com/swiftbotlab/dreamdex-feedback/commit/66e8188) · Re-checked 2026-10-25 22:37 UTC ·
Corrected 2026-10-20 (wrong-scale half removed)

### #08 · Link a bot, the docs' "simplest route" to bot gas, is blocked for a new account and names no STT source
![normal](https://img.shields.io/badge/normal-d29922?style=flat-square) &nbsp;`app`

**Impact:** a new account sees "Can't add a bot yet … has no STT", and neither that message nor the perps docs pages name
an STT source. The faucets other docs pages name pay on Shannon, and the app moves that STT to Tokyo silently, only once
the app is reopened.

<img src="assets/shot-08-link-a-bot-no-stt.png" width="230" alt="Link a bot form on a new account: red message 'Can't add a bot yet: the app's key that sends this change has no STT', Add bot disabled">

**Repro:** manual (app UI; report steps 1–3 with a new e-mail login)<br>
[Report](feedback/08-app-link-a-bot-blocked-for-new-accounts-no-stt-source.md) ·
[Evidence](evidence/link_a_bot_new_account_2026-10-25T2254Z.txt) · First reported
[2026-10-19 10:58 UTC](https://github.com/swiftbotlab/dreamdex-feedback/commit/f2a1e30), corrected 2026-10-19 15:20 UTC and
2026-10-20 · Re-checked 2026-10-25 22:52–22:55 UTC with a brand-new account
([screenshot](evidence/link-a-bot-new-account-2026-10-25.png))

### #09 · Documented perp gas cost is the discounted price; a new bot pays about 10×
![normal](https://img.shields.io/badge/normal-d29922?style=flat-square) &nbsp;`docs`

**Impact:** the page's 0.0003–0.003 STT is what heavy senders pay after Somnia's 70–90 % sustained-use discount. A new bot
key pays the full 6 gwei: one minimal resting order costs 0.0141 STT, 4.7× the documented maximum.

**Repro:** `node scripts/perp_gas_sample.mjs 0xD6Cb1DD58580B84D76068aC21594219ce03aeddf 0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0 0xB483ec1fb34996638677c20ab087b16F1896FA53` (read-only; `fee_floor_test.mjs` sends transactions)<br>
[Report](feedback/09-docs-perp-gas-cost-range-is-10x-below-what-a-new-sender-pays.md) ·
[Evidence](evidence/fee_floor_test_2026-10-25T2250Z.txt) · First reported
[2026-10-19 15:23 UTC](https://github.com/swiftbotlab/dreamdex-feedback/commit/b69748b) · Re-checked 2026-10-25 22:50 UTC:
fresh 6 gwei transaction `0x024923cb…1ce9`; 0.6 gwei still rejected; docs figure unchanged

## Archived

Kept for the record in [`archive/`](archive) and **not part of the submission**. Please do not count them.

- **#07**: [Indexer `Market.markPrice` lags the chain](archive/07-indexer-market-markprice-lags-chain-by-15-40-minutes.md).
  We withdrew it on 2026-10-20: SDK 0.32.1 documents that this field "advances only when funding settles — hourly on
  every live pool" (`PerpMarket.markPrice`, `src/markets.ts:191`), and every age we measured was under an hour.
- **#11**: [History tx links open the Shannon explorer](archive/11-app-trade-history-tx-links-open-the-shannon-explorer-which-cannot-find-hideki-txs.md).
  It changed after we filed it. By 2026-10-25 the links go to explorer.testnet.somnia.network, whose 50312 view says "This
  transaction is on Tokyo testnet. Open on Tokyo testnet", so they no longer dead-end
  ([evidence](evidence/trade_history_explorer_links_2026-10-25T2248Z.txt)).

## Fix checklist

One line per issue (area, where, expected behaviour), ready to paste into a tracker:

- [ ] **#10 app**: `/trade/perps/tokyo/<MARKET>-PERP` (Next.js middleware or `redirects()`) should serve the perps view, not a `307` to the STT-USDso spot market. If perps is off on purpose, show a notice and stop linking the Arena buttons to it.
- [ ] **#01 docs**: "Get test funds" on `/docs/developers/perps-testnet`: say that paper USDso is granted by the Perps Arena and caveat the `claimPerpVoucher` sample, or enable self-claim on `VoucherDistributor` `0x2ACD9EFdA721450906bfE1bef3edE269636E42C4`.
- [ ] **#04 indexer**: `MarginEvent` needs a composite index on `(account, kind, timestamp DESC, id)` (on 2026-10-25 ordering by id failed too). Return "statement timeout" instead of `database query error`.
- [ ] **#02 SDK**: `src/perp/voucher.ts` `getPerpVoucherEligibility`: add a `selfClaimDisabled` reason, checked first. Add `SelfClaimDisabled()` (`0x3e31dcc2`) to `src/contractErrorsAbi.ts`.
- [ ] **#03 docs**: the Paper USDso column on `/docs/trading/perps-testnet` and the margin-and-liquidations page: regenerate from `isVoucherMarketAllowed`, or fix the allowlist on chain.
- [ ] **#05 docs**: the scoring recipe on `/markets/somnia-markets/typescript/perps`: use only the options and kinds 0.32.1 has, or ship `sinceBlock`/`toBlock` and `CreditReclaimed` in the SDK.
- [ ] **#12 indexer**: add `blockNumber` and `logIndex` columns to `MarginEvent`, filterable and sortable, like `Fill` and `LiquidationEvent`.
- [ ] **#06 docs**: `/docs/developers/contracts/errors`: add a Perps table (MarginBank, PerpPool, VoucherDistributor, including `0x3e31dcc2`).
- [ ] **#08 app/docs**: the relayer should pay for the operator grant, or the Link a bot red message and "Get test funds" should name the STT source (faucet, pays on Shannon, the app moves it to Tokyo).
- [ ] **#09 docs**: the gas-cost sentence on `/docs/developers/perps-testnet` should quote costs at the undiscounted 6 gwei (about 0.01–0.015 STT per resting order) and mention the sustained-use discount. Resize "Send it 5 STT" to match.

## Index

| # | Severity | Area | Issue | First reported (UTC) |
|---|---|---|---|---|
| 01 | major | docs | [The developer page's only paper-USDso route, `claimPerpVoucher`, reverts with `SelfClaimDisabled()`](feedback/01-paper-usdso-self-claim-disabled-on-chain.md) | [2026-10-19 09:41](https://github.com/swiftbotlab/dreamdex-feedback/commit/66e8188) |
| 02 | normal | SDK | [`getPerpVoucherEligibility` says eligible while `claim()` reverts; error missing from `contractErrorsAbi`](feedback/02-sdk-voucher-eligibility-ignores-self-claim-disabled.md) | [2026-10-19 09:41](https://github.com/swiftbotlab/dreamdex-feedback/commit/66e8188) |
| 03 | normal | docs | [Docs block six markets for paper USDso; the chain allows all 21](feedback/03-paper-usdso-market-allowlist-docs-vs-chain.md) | [2026-10-19 09:41](https://github.com/swiftbotlab/dreamdex-feedback/commit/66e8188) |
| 04 | major | API | [Indexer `MarginEvents` query used by the SDK fails for every busy account we tested](feedback/04-indexer-margin-events-query-times-out.md) | [2026-10-19 09:41](https://github.com/swiftbotlab/dreamdex-feedback/commit/66e8188) |
| 05 | normal | docs | [Perps guide's trading-gain recipe throws, and its block window is silently ignored by 0.32.1](feedback/05-sdk-perps-guide-documents-getmarginevents-options-that-0.32.1-does-not-have.md) | [2026-10-19 09:41](https://github.com/swiftbotlab/dreamdex-feedback/commit/66e8188) |
| 06 | normal | docs | [The Errors page lacks the perp errors](feedback/06-errors-page-lacks-perp-errors-and-wrong-scale-message-differs.md) | [2026-10-19 09:41](https://github.com/swiftbotlab/dreamdex-feedback/commit/66e8188) |
| 08 | normal | app | [Link a bot, the docs' "simplest route" to bot gas, is blocked for a new account and names no STT source](feedback/08-app-link-a-bot-blocked-for-new-accounts-no-stt-source.md) | [2026-10-19 10:58](https://github.com/swiftbotlab/dreamdex-feedback/commit/f2a1e30) |
| 09 | normal | docs | [Documented perp gas cost is the discounted price; a new bot pays about 10×](feedback/09-docs-perp-gas-cost-range-is-10x-below-what-a-new-sender-pays.md) | [2026-10-19 15:23](https://github.com/swiftbotlab/dreamdex-feedback/commit/b69748b) |
| 10 | major | app | [Every perps route, including the Arena's "Start trading", redirects to the STT-USDso spot market](feedback/10-app-every-perps-route-redirects-to-the-stt-spot-market.md) | [2026-10-19 19:42](https://github.com/swiftbotlab/dreamdex-feedback/commit/f5cef3d) |
| 12 | normal | API | [Indexer `MarginEvent` rows have no block number](feedback/12-indexer-margin-events-have-no-block-number.md) | [2026-10-20 03:44](https://github.com/swiftbotlab/dreamdex-feedback/commit/efb7bb4) |

"First reported" is the author time of the commit that added the report file (`git log --diff-filter=A --format=%aI -- feedback/<file>`).
Every active report was re-verified on 2026-10-25 between 22:37 and 23:04 UTC. Archived: 07 (withdrawn) and 11 (changed), see [Archived](#archived).

## Quick start

<details>
<summary><b>Run the reproductions</b> (Node 18+, npm, curl)</summary>

```bash
git clone https://github.com/swiftbotlab/dreamdex-feedback && cd dreamdex-feedback
npm ci                                   # installs exactly viem 2.57.7 from package-lock.json
node scripts/voucher_check.mjs           # #01/#02: eligibility reads pass, claim() reverts 0x3e31dcc2
bash scripts/indexer_timing.sh           # #04 by query shape (also needs bc)
bash scripts/indexer_accounts.sh 0x47537e3a3ea6e9391f3b26ea45618db6828c8bff 0xfa5f80c0bb94e4a5016f883a7e86070ae7e1fb5a   # #04 per account
bash scripts/margin_event_fields.sh      # #12

# #02, #03 and #06 decode results against the SDK's error ABI. npm pack only downloads the tarball; nothing in it is run.
npm pack @somnia-chain/markets-sdk@0.32.1 && tar xzf somnia-chain-markets-sdk-0.32.1.tgz
node scripts/errsel.mjs package/src/contractErrorsAbi.ts 0x3e31dcc2      # -> UNKNOWN
node scripts/sim_orders.mjs package/src/contractErrorsAbi.ts 0x567476bd43ff20e6aa44e18abfbdb58280563f45 0x2a73129F26917124bd2A47a9B355C395C537F050   # #03, ZEC-PERP
node scripts/sim_orders.mjs package/src/contractErrorsAbi.ts             # #06, BTC-PERP order errors
```

Tested on Node 22.22.1. The scripts are plain `viem`; the SDK is never executed (ABIs are copied from its `readsAbi.ts` /
`tradeAbi.ts`). Everything is read-only (`eth_call`, GraphQL, HTTP) **except `fee_floor_test.mjs`**, which sends three
self-transfers and needs `PRIVATE_KEY` of a throwaway testnet key.

| Endpoint | Value |
|---|---|
| Chain | Somnia Tokyo testnet ("Hideki" in the docs and SDK), chain id **50383**, gas token STT |
| RPC | `https://api.hideki2.infra.testnet.somnia.network` (hard-coded; `survey.mjs` also honours `RPC=`) |
| Indexer (GraphQL) | `https://hideki-dev.smk.somnia.host/v1/graphql` |
| App | `https://app.testnet.dreamdex.io` |

**Evidence naming:** `evidence/<topic>_<YYYY-MM-DD>[T<HHMM>Z].txt|json` is script output, with UTC time.
`evidence/<what-it-shows>.png` is a screenshot. Every real transaction is in
[`evidence/onchain_txs_2026-10-19.txt`](evidence/onchain_txs_2026-10-19.txt). The undated `indexer_timing.txt`,
`mark_lag.txt` and `survey.json` are the first runs (2026-10-19 about 09:40 UTC), committed with reports 01–07.
</details>

<details>
<summary><b>Scripts and the reports they reproduce</b></summary>

| Script | Reports | Command |
|---|---|---|
| [`claim_from.mjs`](scripts/claim_from.mjs) | 01, 02 | `node scripts/claim_from.mjs <address...>` |
| [`voucher_check.mjs`](scripts/voucher_check.mjs) | 02, 01 | `node scripts/voucher_check.mjs [address]` |
| [`survey.mjs`](scripts/survey.mjs) | 03, 05 | `node scripts/survey.mjs > survey.json` |
| [`sim_orders.mjs`](scripts/sim_orders.mjs) | 03, 06 | `node scripts/sim_orders.mjs <contractErrorsAbi.ts> [from] [pool]` |
| [`indexer_timing.sh`](scripts/indexer_timing.sh) | 04 | `bash scripts/indexer_timing.sh [account]` |
| [`indexer_accounts.sh`](scripts/indexer_accounts.sh) | 04 | `bash scripts/indexer_accounts.sh <account...>` |
| [`margin_event_fields.sh`](scripts/margin_event_fields.sh) | 12 | `bash scripts/margin_event_fields.sh` |
| [`errsel.mjs`](scripts/errsel.mjs) | 02, 06 | `node scripts/errsel.mjs <contractErrorsAbi.ts> <selector...>` |
| [`sim_cap.mjs`](scripts/sim_cap.mjs) | 06 | `node scripts/sim_cap.mjs` |
| [`perp_gas_sample.mjs`](scripts/perp_gas_sample.mjs) | 09 | `node scripts/perp_gas_sample.mjs <pool...>` |
| [`fee_floor_test.mjs`](scripts/fee_floor_test.mjs) | 09 | `PRIVATE_KEY=0x… node scripts/fee_floor_test.mjs` (**sends transactions**) |
| [`encode_order.mjs`](scripts/encode_order.mjs) | 04, 05, 09 | `node scripts/encode_order.mjs <wrongscale\|perpbid\|cancel\|…> …` (calldata only) |
| [`mark_lag.mjs`](scripts/mark_lag.mjs) | 07 (archived) | `node scripts/mark_lag.mjs` |
| [`rpccap.mjs`](scripts/rpccap.mjs) | (support) | `node scripts/rpccap.mjs`: RPC capability probe |

Reports 08 and 10 are app behaviour. Their steps are in each report, and 10 has a `curl` check (see its card above).
</details>

<details>
<summary><b>Method and environment</b></summary>

- Each report was reproduced against the live testnet with plain JSON-RPC / GraphQL requests or a minimal viem script. The
  requests and responses are quoted inside the report.
- `@somnia-chain/markets-sdk` 0.32.1 (source read from the npm tarball, never executed); RPC
  `https://api.hideki2.infra.testnet.somnia.network`; indexer `https://hideki-dev.smk.somnia.host/v1/graphql`.
- Some reports are also backed by real testnet transactions. They were sent from a throwaway key
  (`0x2A11e7388D1D2F9690f2636846d44b478f61bF08`) that got its gas through the app's Link a bot flow, and they are listed
  with status, gas and fee in [`evidence/onchain_txs_2026-10-19.txt`](evidence/onchain_txs_2026-10-19.txt).
- App reports (08, 10): app.testnet.dreamdex.io in Chrome 155 on Linux, Privy e-mail login, Somnia Account wallet
  `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817` (08 on 2026-10-25: a new account, `0xa05d5619146FF3Dd30435662B7f5E1D002761d24`).
</details>

## Notes

- **Corrections** to a report are marked in the report itself, in a dated "Corrections" section at the end ("Corrected …").
  They are never silent edits, and earlier versions stay in the git history. On 2026-10-20 we brought every severity onto
  the bounty's scale (no "minor"), withdrew 07, removed the wrong-scale half of 06, fixed factual errors in 03, 05, 08 and 09,
  and re-scoped 01, 02 and 04; each changed file says what changed. On 2026-10-25 we re-verified every report, added a dated
  note to each, updated 04 to 13 of 13 accounts, and archived 07 and 11.
- **Security:** nothing here is a security vulnerability. Those go privately to security@dreamdex.io, not to this repo.
- **Contact:** Telegram [@swiftbotlabs](https://t.me/swiftbotlabs) · DoraHacks `swiftbotlab`. Maintained by Swift Bot Labs.
