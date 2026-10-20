# App: transaction links in Trade history and Order history open shannon-explorer.somnia.network, which cannot find Tokyo / Hideki (chain 50383) transactions; the app's own Hideki explorer, already configured for that region, does show them
Severity: normal
Area: app

> **Summary.** On the Tokyo / Hideki network, every Transaction hash link in Trade history and Order history opens the
> Shannon explorer, which 404s Hideki transactions, although the app already configures a Hideki explorer for that region.

Why normal: every transaction link in the account's history is broken, but trading and funds are not affected, and
the transaction can still be checked another way (RPC or the markets explorer, if you know it exists).

On the Tokyo network (Somnia Hideki testnet, chain id 50383), **Portfolio → Trade history** and **Order history**
show a **Transaction hash** column with an external-link icon. Every link points to the Somnia **Shannon** testnet
explorer (`https://shannon-explorer.somnia.network/tx/<hash>`, chain 50312). The trades are on Hideki, so the
explorer's API returns `404 {"message":"Not found"}` and the page ends on "Sorry, we are unable to locate this
transaction hash". The app already ships the right explorer for this region. The Tokyo region config sets
`chain.blockExplorers.default` = "Somnia Markets" at `https://smk-dev-markets-explorer-hideki-euw4-uzavbo36ra-ez.a.run.app`,
and that explorer shows each of these transactions with the trade and the order. The history links don't use it.

## Steps to reproduce
1. Log in on https://app.testnet.dreamdex.io (network Tokyo) with an account that has at least one trade on
   Hideki. Ours: Somnia Account wallet `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`, with five perp trades on
   2026-10-19, 19:17–19:19 UTC.
2. Open **Portfolio** → **Trade history** (or **Order history**) and read the `href` of a **Transaction hash**
   link, e.g. `[...document.querySelectorAll('a[href*="/tx/"]')].map(a => a.href)`.
3. Open that link and wait until the page finishes loading.
4. Look the same hash up on Hideki: `eth_getTransactionReceipt` on `https://api.hideki2.infra.testnet.somnia.network`,
   and `https://smk-dev-markets-explorer-hideki-euw4-uzavbo36ra-ez.a.run.app/tx/<hash>`.

## Expected
The link opens an explorer that has the transaction. For the Tokyo / Hideki region that is the explorer the app
already configures for it (`…markets-explorer-hideki…/tx/<hash>`), or a Hideki block explorer if one exists. In
general the link should follow the chain of the row's region, not the default Somnia testnet chain.

## Actual
- Step 2 (19:37:50 UTC): all five links in Trade history (section "DreamDEX") and the same five in Order history
  are `https://shannon-explorer.somnia.network/tx/<hash>`, for example
  `https://shannon-explorer.somnia.network/tx/0xdafc8e6a5cd68e0f20ec1dabc9016bce0d6e54fd9b105ec5f92026385575acd2`
  (the ETH-PERP open). The wallet link on the TRADER card also points to Shannon
  (`https://shannon-explorer.somnia.network/address/0x0e7E…3817`). Screenshot
  `evidence/trade-history-explorer-links.png`; the app shows times in the browser's zone (UTC+5:30), so
  "Oct 20, 00:49:08" is 19:19:08 UTC.
- Step 3: the page itself is served with HTTP 200 (a Blockscout single-page app). Its data call
  `GET /api/v2/transactions/0xdafc8e6a…acd2` returns **404** `{"message":"Not found"}`. About 45 s after loading, the page
  shows "Sorry, we are unable to locate this transaction hash … If it still does not show up after 1 hour, please
  check with your sender/exchange/wallet/transaction provider" (19:36 UTC, 19 minutes after the trade). Screenshot
  `evidence/shannon-explorer-hideki-tx-not-found.png`.
- Step 4 (19:42:56 UTC), all five hashes:

  | tx | Shannon explorer API | Shannon RPC `eth_getTransactionByHash` | Hideki RPC receipt | markets explorer |
  |---|---|---|---|---|
  | `0xdafc8e6a…acd2` (ETH-PERP open) | 404 | null | status 1, block 27856063 | 200 |
  | `0x179b478e…c35e` (SOL-PERP open) | 404 | null | status 1, block 27856643 | 200 |
  | `0xddc05f87…d708` (SOL-PERP close) | 404 | null | status 1, block 27856768 | 200 |
  | `0x8ce2e12c…1d96` (HYPE-PERP open) | 404 | null | status 1, block 27856974 | 200 |
  | `0x02b4a275…c5d6` (HYPE-PERP close) | 404 | null | status 1, block 27857099 | 200 |

  The markets explorer page for `0xdafc8e6a…acd2` shows the transaction: time 19/10/2026 19:17:25 UTC, block
  27856063, market `perp · 0xd6cb…eddf` (ETH-PERP), trade 0.0208 @ 2396.46, order "buy 2401.43 0.0208 Filled ·
  crossed on arrival", footer "chain 50383 · hideki testnet" (screenshot `evidence/markets-explorer-hideki-tx.png`).
- Likely cause, from the app's JS as served on 2026-10-19 (minified; excerpts in the evidence file):
  `getExplorerTxUrl(hash, region)` uses `getSomniaChain()` (Somnia Testnet 50312 → `shannon-explorer.somnia.network`)
  when no region is passed. `getExplorerTxUrlForChain(chainId, hash)` only knows Arbitrum, Ethereum, Somnia mainnet and
  Shannon, so it returns `null` for 50383. Meanwhile the `tokyo` region object carries
  `chain: {...hidekiTestnet, blockExplorers: {default: {name: "Somnia Markets", url: <markets explorer>}}}` and
  `explorerUrl: <markets explorer>`.

## Evidence
- `evidence/trade_history_explorer_links_2026-10-19.txt`: the rendered `href`s, the per-hash table above with the
  exact URLs and RPCs, the Shannon API response, the page text of both explorers, and the JS excerpts.
- `evidence/trade-history-explorer-links.png`: Portfolio → Trade history with the Transaction hash column.
- `evidence/shannon-explorer-hideki-tx-not-found.png`: where the link leads.
- `evidence/markets-explorer-hideki-tx.png`: the same transaction on the Hideki markets explorer.
- The five transactions were sent by the account's linked trading key `0x2A11e7388D1D2F9690f2636846d44b478f61bF08`
  (the bot from report 08), so they belong to the account but were not placed through the app's order form.

## Suggested fix
Make the explorer base URL chain-aware. Build history links from the region the row belongs to, e.g.
`getExplorerTxUrl(hash, region)` with the `tokyo` region, so Hideki rows use its `blockExplorers.default` /
`explorerUrl`. Add Hideki (50383) to the chain list behind `getExplorerTxUrlForChain`. Do the same for
`getExplorerAddressUrl` (the TRADER card's wallet link). If the markets explorer is not meant to be public, hide the
link for Hideki rows rather than pointing at Shannon.

## Environment
- App: app.testnet.dreamdex.io as served 2026-10-19 19:34–19:45 UTC; network Tokyo / Hideki (chain 50383)
- Browser: Chrome 155 on Linux, 1440×900, time zone UTC+5:30; logged in with a Privy e-mail login, Somnia Account
  wallet `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`
- Explorers: Shannon Blockscout (backend v10.2.6, frontend 8e18fb6); Somnia Markets explorer v0.32.0 for Hideki
- RPCs: Hideki `https://api.hideki2.infra.testnet.somnia.network`, Shannon `https://api.infra.testnet.somnia.network`; curl 8.18.0

## Corrections
- **Corrected 2026-10-20.** Severity minor → normal: "minor" is not on the bounty's scale (critical | major | normal), and
  normal is its lowest value. Updated the "Why" line to match and added the summary. Re-checked 2026-10-20 02:37 UTC: the
  Shannon explorer still returns 404 for `0xdafc8e6a…acd2`, whose Hideki receipt has status 1
  (`evidence/recheck_2026-10-20T0235Z.txt`).
