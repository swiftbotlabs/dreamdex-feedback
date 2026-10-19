# dreamdex-feedback

Reproducible issue reports for the dreamDEX Perps Builder Bounty (Feedback track), Somnia Hideki
testnet ("Tokyo" region), chain id 50383. One Markdown file per issue in `feedback/`, following the
template on the bounty's Details page.

Each report was reproduced against the live testnet with plain JSON-RPC / GraphQL requests or a
minimal viem script; the requests and responses are quoted inside the report. Nothing here is a
security vulnerability (those go to security@dreamdex.io, not to this repo).

Environment used throughout: `@somnia-chain/markets-sdk` 0.32.1 (source read from the npm tarball),
RPC `https://api.hideki2.infra.testnet.somnia.network`, indexer `https://hideki-dev.smk.somnia.host/v1/graphql`.

Some reports are also backed by real testnet transactions, sent from a throwaway key
(`0x2A11e7388D1D2F9690f2636846d44b478f61bF08`) that got its gas through the app's Link a bot flow.
They are listed with status, gas and fee in `evidence/onchain_txs_2026-10-19.txt`. Corrections to a
report are marked in the report itself ("Corrected …"). They are never silent edits.

## Reports

| # | Severity | Area | Issue |
|---|---|---|---|
| 01 | major | docs, contracts | [Paper USDso self-claim reverts with `SelfClaimDisabled()` for every caller](feedback/01-paper-usdso-self-claim-disabled-on-chain.md) |
| 02 | major | SDK | [`getPerpVoucherEligibility` says eligible while `claim()` reverts; error missing from `contractErrorsAbi`](feedback/02-sdk-voucher-eligibility-ignores-self-claim-disabled.md) |
| 03 | normal | docs | [Docs block six markets for paper USDso; the chain allows all 21](feedback/03-paper-usdso-market-allowlist-docs-vs-chain.md) |
| 04 | major | API, SDK | [Indexer `MarginEvents` query used by the SDK times out for an active account](feedback/04-indexer-margin-events-query-times-out.md) |
| 05 | normal | docs, SDK | [Perps guide documents `getMarginEvents` options 0.32.1 does not have](feedback/05-sdk-perps-guide-documents-getmarginevents-options-that-0.32.1-does-not-have.md) |
| 06 | normal | docs | [Errors page lacks the perp errors; wrong-scale revert message differs](feedback/06-errors-page-lacks-perp-errors-and-wrong-scale-message-differs.md) |
| 07 | normal | API, docs | [Indexer `Market.markPrice` lags the chain by 15 to 40 minutes](feedback/07-indexer-market-markprice-lags-chain-by-15-40-minutes.md) |
| 08 | minor | app, docs | [New accounts can't Link a bot ("no STT") and nothing says where STT comes from](feedback/08-app-link-a-bot-blocked-for-new-accounts-no-stt-source.md) |
| 09 | minor | docs, SDK | [Documented perp gas cost is about 10× below what a new sender pays](feedback/09-docs-perp-gas-cost-range-is-10x-below-what-a-new-sender-pays.md) |
| 10 | normal | app | [Every perps route, including the Arena's "Start trading", redirects to the STT-USDso spot market](feedback/10-app-every-perps-route-redirects-to-the-stt-spot-market.md) |
| 11 | minor | app | [Trade/Order history tx links open the Shannon explorer, which can't find Hideki transactions](feedback/11-app-trade-history-tx-links-open-the-shannon-explorer-which-cannot-find-hideki-txs.md) |

Maintained by Swift Bot Labs.
