# App: the trading-account address links on Portfolio (Trader card) and on the public trader page open the explorer's Global testnet view (chain 50312), which shows another chain's balance and history for the account, not its Tokyo / DreamDEX activity
Severity: normal
Area: app

> **Summary.** On testnet, the trading account lives on Tokyo / Hideki (chain 50383). The **Trader** card on Portfolio
> ("account: 0x0e7E…3817") and the header of `/trader/<address>` link the account to
> `https://explorer.testnet.somnia.network/address/<addr>`. That URL is the explorer's **Global testnet** view (chain
> 50312). The developer docs list the Tokyo explorer as `explorer.testnet.somnia.network/tokyo`. The Global view is not
> a "not found" page: it shows the same address with its Shannon balance and history. For our account it shows
> 0.65 STT and 3 transactions from 6 days ago. On Tokyo the same account holds 42.957 STT and has 12 transactions.
> Nothing on the page mentions Tokyo. Transaction links get an "Open on Tokyo testnet" hint from the explorer, but
> address pages get none. The app already has the Tokyo explorer URL in its DreamDEX region config, and it passes the
> region for token-contract links. The account links call the same helper without a region.

> **Checked 2026-10-26 in three passes: 06:30–06:52 UTC, 07:22–07:28 UTC and 07:53–07:57 UTC.** Every pass gave the same
> result, logged in and logged out. At 07:55:19 UTC, signed in, the Portfolio Trader card link was still
> `https://explorer.testnet.somnia.network/address/0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`. The six app chunks
> involved were byte-identical at 07:23 and 07:54 UTC. Evidence: `evidence/33/addrlinks_recheck_2026-10-26T0754Z.txt`,
> `evidence/33/addrlinks_code_excerpt_2026-10-26T0754Z.txt`.

The docs place the testnet trading account on Tokyo:

> Testnet perps run on the **Hideki** testnet chain, which the app shows as the **DreamDEX** region.
> … **Explorer** | explorer.testnet.somnia.network/tokyo (`/docs/developers/perps-testnet`)

> On testnet your wallets live in DreamDEX, the region the perp markets are in. (`/docs/trading/perps-testnet`)

The explorer at `explorer.testnet.somnia.network` serves several networks. The root path is **Global testnet** (50312,
the network the app calls Shannon), and `/tokyo` is **Tokyo testnet** (50383). The app's account links use the root
path. Our account is a smart account deployed on both chains, so the Global view is a full, plausible address page.
The figures below come from the explorer's own API for the two paths, and they match `eth_getBalance` on each chain's RPC:

| Account | What the app's link opens (Global, 50312) | Tokyo view (50383), where the account trades |
|---|---|---|
| `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817` (ours) | 0.65 STT, 3 transactions | 42.957216984 STT, 12 transactions |
| `0x2d1242b88f6979d93bae5968ec292fae640932d4` (Perps Arena week-2 rank 3) | 0 STT, 1 transaction | 15 STT, 3 transactions |

The Global page has no Tokyo hint: `document.body.innerText` contains no "tokyo", and no link on the page points to
Tokyo. Its network selector ("Global testnet 50312") does list "Tokyo testnet", but choosing it opens the Tokyo
overview at `/tokyo` and drops the address. Transaction links are different. When a Tokyo transaction is opened on the
root path, the explorer says "Not on Global testnet / This transaction is on Tokyo testnet. / Open on Tokyo testnet".
That is why tx links from the app still reach the right page, and address links do not.

This matters for the support FAQ's own recovery step for a rejected order (`/docs/support/faq/order-rejected`):

> The toast does not show the specific reason and carries no link, so find the failed transaction yourself: copy your
> DreamDEX trading account address from the wallet panel, open it on the block explorer, and the failed transaction is
> the most recent one.

The wallet panel shows the address without an explorer link. The Trader card link is the only explorer link to the
trading account on Portfolio. A user who follows the FAQ through that link lands on a page whose most recent
transaction is 6 days old and on another chain, and does not find the failed order there.

The cause is in the served code. `AddressExplorerLink` (used by the trader-page header and its **Login EOA** row) and the
Portfolio Trader card call `getExplorerAddressUrl(address)` without a region. With no region, the helper builds the URL
from the default Somnia chain (`somniaTestnet`, 50312, base `https://explorer.testnet.somnia.network`):

```js
function y(e,r){let t=void 0===r?d():r.chain,n=t.blockExplorers?.default?.url;return n?new URL(e,`${n}/`).toString():null}
"getExplorerAddressUrl",0,function(e,r){return e?y(`address/${e}`,r):null}
```

The DreamDEX region config already carries the Tokyo explorer, and token-contract links already pass the region:

```js
L={chain:{...n.hidekiTestnet,blockExplorers:{default:{name:"Somnia Explorer",url:"https://explorer.testnet.somnia.network/tokyo"}}}  // TOKYO_TESTNET_REGION
(0,T.getExplorerAddressUrl)(e,a)   // token-contract link, region a
```

This is not our report #20. #20 is about the trader page's WALLET balance, which is served by the server route
`/api/trader/<addr>/assets`. This report is about the explorer links, which the browser builds with
`getExplorerAddressUrl`. Different code, different fix.

## Steps to reproduce
1. Sign in on https://app.testnet.dreamdex.io and open **Portfolio**. In the **Trader** card, read the `href` of the
   "account: 0x…" link (`aria-label` "Open <address> on the block explorer"), e.g.
   `[...document.querySelectorAll('a[href*="/address/"]')].map(a => [a.getAttribute('aria-label'), a.href])`.
2. Logged out, read the trader page's explorer link:
   ```sh
   for A in 0x2d1242b88f6979d93bae5968ec292fae640932d4 0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817; do
     curl -s https://app.testnet.dreamdex.io/trader/$A | grep -o 'href="https://explorer[^"]*"' | sort -u
   done
   ```
3. Compare what that URL shows with the Tokyo view, using the explorer's API for both paths:
   ```sh
   A=0x2d1242b88f6979d93bae5968ec292fae640932d4
   for base in https://explorer.testnet.somnia.network https://explorer.testnet.somnia.network/tokyo; do
     curl -s $base/api/v2/addresses/$A | grep -o '"coin_balance":"[^"]*"'
     curl -s $base/api/v2/addresses/$A/counters
   done
   ```
4. Cross-check against each chain's RPC:
   ```sh
   for rpc in https://api.hideki2.infra.testnet.somnia.network https://api.infra.testnet.somnia.network; do
     curl -s -H 'content-type: application/json' \
       -d "[{\"jsonrpc\":\"2.0\",\"id\":0,\"method\":\"eth_chainId\",\"params\":[]},{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBalance\",\"params\":[\"$A\",\"latest\"]}]" $rpc; echo
   done
   ```
5. Click the link from step 1 or step 2. Look for any mention of Tokyo on the page. Then open the network selector
   ("Global testnet 50312"), choose "Tokyo testnet", and note where you land.
6. For contrast, open a Tokyo transaction on the same root path:
   https://explorer.testnet.somnia.network/tx/0xae8c3ae7369b11bf307cc046a882f4071efae94fc0763fa987e454e0c31e0867

## Expected
On the DreamDEX (Tokyo) region, address links open the region's explorer, as token-contract links already do:
`https://explorer.testnet.somnia.network/tokyo/address/<addr>`, the explorer the perps developer docs list. Clicking
"account: 0x0e7E…3817" shows the account's Tokyo balance (42.957 STT) and its Tokyo transactions, including the most
recent order, as the FAQ expects.

## Actual
- **Step 1, Portfolio, signed in** (07:55:19 UTC; also 06:30–06:33 and 07:26:39 UTC): the Trader card reads
  "account: 0x0e7E…3817". Its link is `aria-label="Open 0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817 on the block explorer"`
  `href="https://explorer.testnet.somnia.network/address/0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817"`, with no `/tokyo`.
  It is the only explorer address link on the page. The wallet panel (07:55:28 UTC) shows "0x0e...3817" with no
  explorer link. Screenshot: `evidence/33/addrlinks_portfolio_trader-card_2026-10-26T0726Z.png`.
- **Step 2, trader page, logged out** (07:53:57 UTC; also 06:52 and 07:22:18 UTC): both pages return `HTTP 200`, and each
  has exactly one explorer link, with no `/tokyo`:
  - `href="https://explorer.testnet.somnia.network/address/0x2d1242b88f6979d93bae5968ec292fae640932d4"`
  - `href="https://explorer.testnet.somnia.network/address/0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817"`
- **Step 3, explorer API** (07:53:57–07:54:13 UTC; the same at 06:52 and 07:22:37 UTC):
  - `0x2d12…32d4`: root `coin_balance` `"0"`, `transactions_count` `"1"`. `/tokyo`: `"15000000000000000000"`, `"3"`.
  - `0x0e7E…3817`: root `"650000000000000000"`, `"3"`. `/tokyo`: `"42957216984000000000"`, `"12"`.
- **Step 4, RPC** (same minute):
  - `api.hideki2` (`eth_chainId` `0xc4cf` = 50383): `0x2d12…32d4` = `0xd02ab486cedc0000` (15 STT);
    `0x0e7E…3817` = `0x25426b13ff6b27000` (42.957216984 STT).
  - `api.infra` (`0xc488` = 50312): `0x2d12…32d4` = `0x0`; `0x0e7E…3817` = `0x905438e60010000` (0.65 STT).
- **Step 5, link target in a browser:**
  - At 07:24:19 UTC: "BLOCKCHAIN / GLOBAL TESTNET / ADDRESS … Contract … Transactions (3) … Balance 0.65 STT". The
    newest row is an `execTransaction` at block 518,460,995, "6 d ago". The footer reads "// somnia explorer · global
    testnet · chain 50312". Screenshot: `evidence/33/addrlinks_global-view_0x0e7E_2026-10-26T0724Z.png`.
  - At 07:56:50 UTC, `/tokyo/i` matched 0 times in the body text, and 0 links pointed to Tokyo. The only network control
    was the button "Global testnet 50312". Its list includes "Tokyo testnet Asia-Pacific · Tokyo · testnet · 50383".
    Choosing it (07:57:06 UTC) went to `https://explorer.testnet.somnia.network/tokyo`, breadcrumb
    "BLOCKCHAIN / OVERVIEW", and the address was no longer on the page.
  - `0x2d12…32d4` on the root path (07:25:32 UTC): Balance 0 STT, Transactions (1), no Tokyo text or link.
  - For comparison, `/tokyo/address/0x0e7E…3817` (07:25:03 UTC): "TOKYO TESTNET / ADDRESS … Transactions (12) … Balance
    42.957216 STT", newest row "8 h ago". Screenshot: `evidence/33/addrlinks_tokyo-view_0x0e7E_2026-10-26T0725Z.png`.
- **Step 6, tx on the root path** (06:41:50 and 07:24:39 UTC): "Not on Global testnet / This transaction is on Tokyo
  testnet. / Open on Tokyo testnet". Address pages have no such fallback.
- **Served code** (chunks fetched 07:54:26 UTC):
  - `1wrqovc00mi6p.js` (Portfolio): `function te({address:e,label:t}){let n=(0,H.getExplorerAddressUrl)(e),…`
  - `1zz4tdgl8_i8w.js`: `AddressExplorerLink` = `function({address:e,label:s}){let o=(0,n.getExplorerAddressUrl)(e),…`
  - `27kddaaff2hz-.js` (trader page): ``(0,s.jsx)(N.AddressExplorerLink,{address:e,label:`Open ${e} on the block explorer`})``
    and, for the Login EOA row, `(0,s.jsx)(N.AddressExplorerLink,{address:l.eoa,…})`
  - `04nhweuvbgxuy.js`: `getExplorerAddressUrl(e,r)` → ``y(`address/${e}`,r)``. With `r` undefined, `y` uses `d()`, the
    default chain, and the testnet base `https://explorer.testnet.somnia.network`.
  - `0p4rb93gq9d0a.js`: `TOKYO_TESTNET_REGION` → `blockExplorers.default.url` `"https://explorer.testnet.somnia.network/tokyo"`.
  - `33gcg8vfyjjn_.js`: the token-contract link calls `getExplorerAddressUrl(e,a)` with the region.

## Evidence
- `evidence/33/addrlinks_recheck_2026-10-26T0754Z.txt`: the latest pass, 07:53–07:57 UTC. It has the trader-page hrefs,
  the explorer API for both paths, both RPCs, the docs quotes, the signed-in Portfolio link and wallet panel, and the
  rendered Global page with the network-switch result.
- `evidence/33/addrlinks_repro_2026-10-26T0722-0727Z.txt`: the second pass, 07:22–07:27 UTC, with the same checks plus the
  rendered pages and the tx-page hint.
- `evidence/33/addrlinks_checks_2026-10-26T0630-0652Z.txt`: the first pass, 06:30–06:52 UTC, with full command output.
- `evidence/33/addrlinks_code_excerpt_2026-10-26T0754Z.txt`: the code excerpts above, with chunk names and sha256 prefixes.
- `evidence/33/addrlinks_portfolio_trader-card_2026-10-26T0726Z.png`: the Portfolio Trader card, "account: 0x0e7E…3817",
  and STT 42.95 under Balances.
- `evidence/33/addrlinks_global-view_0x0e7E_2026-10-26T0724Z.png`: what the link opens, Global testnet, 0.65 STT, 3 txs.
- `evidence/33/addrlinks_tokyo-view_0x0e7E_2026-10-26T0725Z.png`: the same address on Tokyo, 42.957216 STT, 12 txs.

## Suggested fix
- Pass the active region to the helper in `AddressExplorerLink` and in the Portfolio `te()` link, the way the
  token-contract link already does (`getExplorerAddressUrl(address, region)`). On the DreamDEX region the links then
  become `https://explorer.testnet.somnia.network/tokyo/address/<addr>`.
- Fixing `AddressExplorerLink` should also cover its other uses in the same chunk ("View trading Safe on the Somnia
  explorer", "View session signer on the Somnia explorer"). We did not reach those two links in the UI.
- Optional, on the explorer side: show an "also on Tokyo testnet" hint on address pages, as tx pages already do, and
  keep the address when the network selector switches networks.

## Environment
- App: app.testnet.dreamdex.io as served 2026-10-26, 06:30–07:57 UTC. Chunks `04nhweuvbgxuy.js` (sha256
  `6dc8df9a469273e4…`), `0p4rb93gq9d0a.js` (`075cbb1e21204a21…`), `1wrqovc00mi6p.js` (`0f42d526b3130c3c…`),
  `1zz4tdgl8_i8w.js` (`c2bb0b9732a6e03c…`), `27kddaaff2hz-.js` (`8556fda94b218ac5…`), `33gcg8vfyjjn_.js`
  (`5520ff409831ba1e…`). These were the same at 07:23 and 07:54 UTC.
- Explorer: `https://explorer.testnet.somnia.network` (Global testnet, 50312) and `…/tokyo` (Tokyo testnet, 50383).
- Networks: Somnia Tokyo testnet ("Hideki" in the docs, the DreamDEX region in the app), chain id 50383, RPC
  `https://api.hideki2.infra.testnet.somnia.network`; Somnia Shannon testnet, chain id 50312, RPC
  `https://api.infra.testnet.somnia.network`.
- Browser: Chrome 155 on Linux. Signed in with a Privy e-mail login as Somnia Account
  `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`. The trader page is public, and curl with no cookies shows the same links.
- curl 8.18.0. Docs: `/docs/developers/perps-testnet`, `/docs/trading/perps-testnet` and
  `/docs/support/faq/order-rejected` on app.dreamdex.io, fetched 07:54–07:59 UTC.
- `@somnia-chain/markets-sdk`: not involved. Read-only, no transactions sent.
