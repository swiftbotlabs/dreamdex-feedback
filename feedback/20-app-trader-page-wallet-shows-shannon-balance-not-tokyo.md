# App: the public trader page's Wallet section shows the wallet's Shannon balance instead of its Tokyo (DreamDEX) balance, so a trader holding 15 STT is shown as "Nothing held in the wallet itself"
Severity: normal
Area: app

> **Summary.** On `/trader/<address>` → **Balances**, the **WALLET** list comes from `/api/trader/<address>/assets`. That
> route returns the wallet's native balance on Somnia Shannon (chain 50312). The trader's perps account, gas and spot
> trading are on Tokyo / Hideki (chain 50383). The Perps Arena trader `0x2d12…32d4` (rank 3 on the week-2 board) holds 15 STT
> on Tokyo and 0 on Shannon, and the page tells visitors "Nothing held in the wallet itself". Our own wallet holds
> 42.957 STT on Tokyo and 0.65 on Shannon. Its trader page shows "STT 0.65", while its signed-in Portfolio shows "STT 42.95".

> **Checked 2026-10-26, 02:33–02:41 UTC and 03:44–03:46 UTC; route and balances re-checked 04:51 UTC.** At 04:51 UTC
> `0x2d12…32d4` still held `0xd02ab486cedc0000` (15.0 STT) on Tokyo and `0x0` on Shannon, and
> `/api/trader/0x2d12…32d4/assets` still returned `{"native":"0","tokens":[]}`. Evidence:
> `evidence/20/trader-wallet_checks_2026-10-26T0233-0241Z.txt`, `evidence/20/trader-wallet_recheck_2026-10-26T0344Z.txt`.

The trader page describes itself as "One trader's public record: trades, positions, assets and open orders." Its
**PERPS MARGIN** block is read from Tokyo and labelled for it ("USDso · DreamDEX"). The **WALLET** block below it is not.
For each wallet we checked, the route behind it returns exactly the Shannon balance, with no region label, and it
ignores the Tokyo balance:

| Wallet | Tokyo / Hideki (50383) `eth_getBalance` | Shannon (50312) `eth_getBalance` | `/api/trader/<addr>/assets` | Trader page WALLET |
|---|---|---|---|---|
| `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817` (ours) | 42.957216984 STT | 0.65 STT | `{"native":"650000000000000000","tokens":[]}` | `STT 0.65` |
| `0x2d1242b88f6979d93bae5968ec292fae640932d4` | 15.0 STT | 0 | `{"native":"0","tokens":[]}` | "Nothing held in the wallet itself. …" |

The docs say where these wallets are. The trading guide has "On testnet your wallets live in DreamDEX, the region the perp
markets are in" (`/docs/trading/perps-testnet`, Get started step 1). The developer page lists chain `50383` with **Gas coin**
STT and **Explorer** `explorer.testnet.somnia.network/tokyo` (`/docs/developers/perps-testnet`, Network). The page's
**SOURCES** card says only "assets from the block explorer". It does not say that this means the Shannon explorer.

For the second wallet the empty state adds a wrong explanation: "This wallet's funds are likely in its perps margin account
above, escrowed in resting orders, or held as outcome tokens". The 15 STT is in the wallet itself, on the chain where the
wallet's perps account is.

The app already reads the right chain elsewhere. Signed in as our wallet, **Portfolio** → Balances shows `STT 42.95`
(the Tokyo balance) and lists the 0.65 Shannon balance as a separate row. The spot page footer shows `STT 42.96`. Only the
public trader page, which other people see, shows the Shannon figure as the wallet's STT.

## Steps to reproduce
1. Open https://app.testnet.dreamdex.io/trader/0x2d1242b88f6979d93bae5968ec292fae640932d4 and click **Balances**.
   After three loading rows, the **WALLET** section shows the "Nothing held in the wallet itself…" message. The
   **PERPS MARGIN** row above it shows `USDso · DreamDEX` with 5,584.44 USDso collateral.
2. Read the same address's native balance on both testnet chains:
   ```sh
   A=0x2d1242b88f6979d93bae5968ec292fae640932d4
   for rpc in https://api.hideki2.infra.testnet.somnia.network https://api.infra.testnet.somnia.network; do
     curl -s -H 'content-type: application/json' \
       -d "[{\"jsonrpc\":\"2.0\",\"id\":0,\"method\":\"eth_chainId\",\"params\":[]},{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBalance\",\"params\":[\"$A\",\"latest\"]}]" "$rpc"; echo
   done
   ```
3. Call the route the page uses, with no cookies: `curl -s https://app.testnet.dreamdex.io/api/trader/0x2d1242b88f6979d93bae5968ec292fae640932d4/assets`,
   and compare it with the Shannon explorer:
   `curl -s https://shannon-explorer.somnia.network/api/v2/addresses/0x2d1242b88f6979d93bae5968ec292fae640932d4` (`coin_balance`).
4. Repeat steps 1–3 with `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`. If you are signed in as that wallet (or any wallet
   that holds STT on both chains), also open **Portfolio** → Balances and `/trade/spot/tokyo/STT:USDso` (footer).

## Expected
The WALLET section shows what the wallet holds on Tokyo / DreamDEX, where the docs say testnet wallets live and where
the page's own perps margin comes from: 15 STT for `0x2d12…32d4` and about 42.96 STT for `0x0e7E…3817`, the same figure
as the owner's Portfolio. If the page also wants to show other regions, each row carries a region label, as the perps row
does ("USDso · DreamDEX"). The "Nothing held" message appears only when the wallet is empty in every region.

## Actual
- Step 1 (02:34:34 UTC, re-checked 02:39:37 and polled at 02:40:47, 02:41:03 and 02:41:18 UTC): WALLET → "Nothing held in
  the wallet itself. This wallet's funds are likely in its perps margin account above, escrowed in resting orders, or held
  as outcome tokens: see the Open orders and Positions tabs." On the same page: PERPS MARGIN `USDso · DreamDEX` collateral
  5,584.44 USDso. Screenshot `evidence/20/trader-wallet_rank3_trader-page_2026-10-26T0241Z.png`.
- Step 2 (02:33:07, 02:39:57 and 03:44:37 UTC, the same each time):
  - Hideki: `eth_chainId` `0xc4cf` (50383), balance `0xd02ab486cedc0000` = **15.0 STT**.
  - Shannon: `eth_chainId` `0xc488` (50312), balance `0x0`.
- Step 3 (02:35:21 and 03:44:46 UTC): `HTTP/2 200`, `x-matched-path: /api/trader/[address]/assets`,
  body `{"native":"0","tokens":[]}`. Shannon explorer `coin_balance` `"0"` (02:37:17 and 03:44:56 UTC).
- Step 4, `0x0e7E…3817`:
  - Trader page WALLET (02:34:06 UTC): `STT 0.65`. PERPS MARGIN on the same page: `USDso · DreamDEX` collateral 1,041.82
    USDso, withdrawable 41.82. Screenshot `evidence/20/trader-wallet_own-wallet_trader-page_2026-10-26T0234Z.png`.
  - Hideki balance `0x25426b13ff6b27000` = **42.957216984 STT**. Shannon balance `0x905438e60010000` = **0.65 STT**.
  - Route body `{"native":"650000000000000000","tokens":[]}` (02:35:20 and 03:44:43 UTC). Shannon explorer `coin_balance`
    `"650000000000000000"`.
  - Signed in as this wallet: Portfolio → Balances `STT 42.95 $7.44` plus a separate row `SOMI 0.65 $0.11` (02:35:28 UTC,
    `evidence/20/trader-wallet_own-wallet_portfolio_2026-10-26T0235Z.png`). Spot page footer `STT 42.96`, next to
    "Gas: ≈8,038 trades" (02:36:11 UTC).
- In the served page code (chunk `27kddaaff2hz-.js`), the list is fetched with
  ``safeFetchWithSchema(`/api/trader/${e}/assets`, …)`` and the native row's symbol is
  `getSomniaChain().nativeCurrency.symbol`. The route takes no region or chain parameter.

`0x2d12…32d4` was rank 3 on the Perps Arena week-2 board (`/api/leaderboard/campaigns/perps-arena?period=week-2`, as loaded
by `/competition-hub` at ~01:31 UTC: `endEquity` 5,584.44, `private: false`). So this is a trader people are likely to look up.

## Evidence
- `evidence/20/trader-wallet_checks_2026-10-26T0233-0241Z.txt`: the raw RPC responses from both chains, the route's response
  headers and bodies, the Shannon explorer responses, the page text (WALLET, PERPS MARGIN, SOURCES card, subtitle), the
  Portfolio and spot-footer text, the code excerpts, the leaderboard row and the docs lines.
- `evidence/20/trader-wallet_recheck_2026-10-26T0344Z.txt`: the same RPC, route and explorer calls, plus the docs lines, re-run
  at 03:44–03:46 UTC. No change.
- `evidence/20/trader-wallet_rank3_trader-page_2026-10-26T0241Z.png`: `/trader/0x2d12…32d4` → Balances. "Nothing held in the
  wallet itself" under a 5,584.44 USDso DreamDEX perps account.
- `evidence/20/trader-wallet_own-wallet_trader-page_2026-10-26T0234Z.png`: `/trader/0x0e7E…3817` → Balances, WALLET `STT 0.65`.
- `evidence/20/trader-wallet_own-wallet_portfolio_2026-10-26T0235Z.png`: the same wallet's Portfolio, `STT 42.95`.

## Suggested fix
- In `/api/trader/[address]/assets`, read the native balance (and token balances) on the chain the perps markets run on
  for this network: on testnet, the Hideki RPC or the Tokyo explorer that the developer docs list.
- Or return one entry per region, and label each WALLET row the way the PERPS MARGIN row is labelled
  (e.g. `STT · DreamDEX 42.96`, `STT · Somnia 0.65`). Show "Nothing held in the wallet itself" only when every region is
  empty.
- Name the explorer or region in the SOURCES card ("assets from the … explorer").

## Environment
- App: app.testnet.dreamdex.io as served 2026-10-26. Trader page first seen 01:22–01:31 UTC, reproduced 02:33–02:41 UTC.
  The route, RPC, explorer and docs were re-checked 03:44–03:46 UTC. Responses from `server: Vercel`.
- Browser: Chrome on Linux, signed in with a Privy e-mail login as Somnia Account `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`.
  The trader page is public, and the asset route returns the same data to a curl request with no cookies.
- Networks: Somnia Tokyo testnet ("Hideki" in the docs, the DreamDEX region in the app), chain id 50383, RPC
  `https://api.hideki2.infra.testnet.somnia.network`; Somnia Shannon testnet, chain id 50312, RPC
  `https://api.infra.testnet.somnia.network`, explorer `https://shannon-explorer.somnia.network`
- curl 8.18.0
- `@somnia-chain/markets-sdk`: not involved
- Wallet: read-only, no transactions sent
