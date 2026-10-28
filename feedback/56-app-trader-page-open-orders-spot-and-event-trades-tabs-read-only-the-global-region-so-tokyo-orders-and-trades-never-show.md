# App: on the public trader page, the **Open orders**, **Spot trades** and **Event trades** tabs read only the Global (Shannon) indexer. A Tokyo trader with 4 perp orders resting on chain is shown "No resting orders — this wallet has nothing open on the book right now", and a market maker with 149 resting Tokyo orders is shown 15 unlabelled Shannon DOGE orders.
Severity: normal
Area: app

> **Summary.** `/trader/<address>` describes itself as "One trader's public record: trades, positions, assets and open
> orders", and its SOURCES card says "Trades, positions and orders from the Somnia markets indexer, perps positions and
> margin from the chain, across every region". The **Positions** and **Perps trades** tabs do read both regions and label
> each section (`PERPS · DREAMDEX`, `PERPS · GLOBAL`). Three other tabs do not:
> - **Open orders** queries `Order` on `dev.smk.somnia.host` (Global, Shannon 50312) only. Tokyo orders are never requested.
> - **Spot trades** reads fills from `dev.smk.somnia.host` only. Tokyo is where the app's own default spot market,
>   `/trade/spot/tokyo/STT:USDso`, trades.
> - **Event trades** also queries only `dev.smk.somnia.host`.
>
> So for anyone trading on Tokyo, the testnet where perps and the Perps Arena run, the page reports orders and trades as
> absent. Its empty-state text says so explicitly. When the wallet also has Global orders, the page lists those with no
> region label, so they read as the trader's whole book.

> **Checked 2026-10-28 at 23:31–23:41 UTC and again at 23:42–23:47 UTC**, logged out (fresh browser context, no wallet), with
> on-chain reads on Tokyo (chain 50383) and queries to both testnet indexers. Same result each run.
> Evidence: `evidence/56/` (scripts, outputs, screenshots, the page's GraphQL requests).

## Steps to reproduce
1. **Open orders.** Open https://app.testnet.dreamdex.io/trader/0xd76470c7303eab00ba54d92452de8f4329ec2994 and click
   **Open orders**. It shows "No resting orders — this wallet has nothing open on the
   book right now."
2. Count that wallet's resting orders on Tokyo and in both indexers (read-only; `getOwnOpenOrders()` is an `eth_call`
   made "from" the account, so no transaction and no key):
   ```sh
   npm install            # viem 2.57.7, pinned in package.json
   node evidence/56/open_orders_check.mjs 0xd76470c7303eab00ba54d92452de8f4329ec2994 0xab8b612548cc3f5f9f7e723823be37058d0110b2
   ```
   By hand, one indexer query per region:
   ```sh
   A=0xd76470c7303eab00ba54d92452de8f4329ec2994
   for h in hideki-dev dev; do
     curl -s -X POST -H 'content-type: application/json' \
       -d "{\"query\":\"{ Order(where:{owner:{_eq:\\\"$A\\\"}, status:{_eq:\\\"Open\\\"}}, limit:50) { market_id price quantityRemaining } }\"}" \
       https://$h.smk.somnia.host/v1/graphql; echo
   done
   # hideki-dev (Tokyo): 4 rows (BTC, ETH, SOL, HYPE pools)   dev (Global): {"data":{"Order":[]}}
   ```
3. Open https://app.testnet.dreamdex.io/trader/0xab8b612548cc3f5f9f7e723823be37058d0110b2 → **Open orders**. It lists 15
   `DOGE-PERP` rows (500 each, prices 0.0807–0.0869) under no region heading. The **Positions** tab on the same page shows this
   wallet's Tokyo positions under `PERPS · DREAMDEX` (BTC, SOL, NEAR, ETH and others).
4. **Spot and event trades.** Open https://app.testnet.dreamdex.io/trader/0x4ddd63006de9d9b8bcbb1d3862dd83039fc4ac40 and
   click through the tabs. **Perps trades** shows a `DREAMDEX` section with that day's BTC-PERP trades. **Spot trades** says "No
   spot trades — this wallet has not traded on the order book." **Event trades** says "No activity yet." Then:
   ```sh
   python3 evidence/56/fills_by_region.py 0x4ddd63006de9d9b8bcbb1d3862dd83039fc4ac40 0x2a11e7388d1d2f9690f2636846d44b478f61bf08
   ```
   It prints the wallet's latest SPOT, PERP and BINARY fills from each indexer.
5. Optional: in DevTools → Network, filter `graphql` and open each tab. The `Order` request and the fills request behind
   Spot trades go only to `dev.smk.somnia.host`. The Perps trades tab also sends its queries to `hideki-dev.smk.somnia.host`.

## Expected
Each tab covers every region, as the SOURCES card says and as the Positions and Perps trades tabs already do, with a
region heading per section. At least, it covers Tokyo / DreamDEX, where testnet perps, the Arena and the app's default
spot market are. Open orders lists the 4 Tokyo orders of `0xd764…2994` and the 149 of `0xab8b…10b2`, and labels the 15
DOGE orders as Global. Spot trades lists `0x4ddd…ac40`'s STT:USDso fills, and Event trades its event-contract fills.

## Actual
`evidence/56/open_orders_check_2026-10-28T2331Z.txt` (on chain at Tokyo block 35771030–35771180) and
`evidence/56/fills_by_region_2026-10-28T2338Z.txt`:

| Wallet | On chain / Tokyo indexer | Global (Shannon) indexer | Trader page tab says |
|---|---|---|---|
| `0xd764…2994` | **4** resting orders on chain (BTC, ETH, SOL, HYPE); Tokyo indexer: 4 `Open` | 0 | Open orders: "No resting orders — this wallet has nothing open on the book right now." |
| `0xab8b…10b2` | **149** resting orders on chain across 15 markets (the Tokyo indexer query fails with "database query error" for this busy account) | 15 `Open`, all on Shannon `DOGE:USDso` | Open orders: the 15 Shannon DOGE rows, no region label |
| `0x4753…8bff` | **181** resting orders on chain across all 21 markets | 0 | Open orders: "No resting orders — this wallet has nothing open on the book right now." |
| `0x4ddd…ac40` | Tokyo SPOT fills on STT:USDso (latest 2026-10-28 16:04:29 UTC, tx `0xdafac941…7a9e`), BINARY fills (latest 12:42:57 UTC, tx `0x9c6f1c69…0209`) and PERP fills | none of any type | Spot trades: "No spot trades — this wallet has not traded on the order book." Event trades: "No activity yet." Perps trades: Tokyo trades listed under DREAMDEX |
| `0x2a11…f08` (our bot key) | Tokyo SPOT fill, 18 STT sold on STT:USDso, tx `0x0563f193…a198` (2026-10-19 14:50:12 UTC) | none | Spot trades: "No spot trades — this wallet has not traded on the order book." |

The page's own requests (`evidence/56/page_queries_2026-10-28T2339Z.txt`): on the Open orders tab, the only `Order`
query went to `dev.smk.somnia.host`. On the Spot trades and Event trades tabs, `hideki-dev` received only the
`chain_metadata` and `Market` lookups, and every fills, outcome-balance and router-action query went to `dev.smk`. The
Perps trades tab sent `FillDataset_by_pk`, `PerpPositionChange` and others to `hideki-dev` as well.

In the bundle (`_next/static/immutable/chunks/27kddaaff2hz-.js`), the Open orders tab
(`queryKey: ["trader-open-orders", …]`) and the Spot trades tab (`["trader-spot-trades", …]`) both call the single
default client from `useSomniaMarkets()`: `client.getOpenOrders(address, {limit: 200, offset})` and
`client.getUserFillsPage(address, …)`. For a logged-out visitor that client is the Global one. The trader page's URL
carries no region (unlike `/trade/spot/tokyo/…`), and the page has no region switch, so a visitor cannot ask for Tokyo.

Why it matters. The trader page is the app's public record of a wallet. A visitor, or the trader,
reads "nothing open on the book" and "has not traded on the order book" about a wallet whose orders rest on chain.
A market maker's 149 Tokyo quotes are replaced by 15 Shannon orders that look like its whole book. The Positions tab on
the same page shows the Tokyo positions, so the page contradicts itself.

## Evidence
- `evidence/56/open_orders_check.mjs`, `evidence/56/open_orders_check_2026-10-28T2331Z.txt` and the second run `…T2342Z.txt`:
  resting orders per Tokyo pool on chain, and per indexer.
- `evidence/56/fills_by_region.py`, `evidence/56/fills_by_region_2026-10-28T2338Z.txt` and the second run `…T2342Z.txt`: fills per
  market type per indexer.
- `evidence/56/ui_open_orders_tab_0xd764_*.png` / `_tab_text.json`, `ui_open_orders_tab_0xab8b_*`, `ui_open_orders_tab_0x4753_*`: the Open orders tab
  (two runs, 23:33 and 23:43 UTC). `ui_positions_tab_0xab8b_*`: the same page's Positions tab, with the `PERPS · DREAMDEX` section.
- `evidence/56/ui_strades_tab_0x4ddd_*`, `ui_etrades_tab_0x4ddd_*`, `ui_ptrades_tab_0x4ddd_*`: the Spot, Event and Perps trades tabs
  of the same wallet. Perps trades works and shows the DREAMDEX section.
- `evidence/56/page_queries_2026-10-28T2339Z.txt` and the `*.net.txt` files: the page's requests (URL, method and GraphQL
  operation only; no bodies or headers).

## Suggested fix
Read these three tabs the way the Positions and Perps trades tabs read theirs: run the query once per region client
(Tokyo / DreamDEX and Global) and render one labelled section per region. For Open orders on Tokyo, also consider the
on-chain read the SDK already offers (`getOpenOrdersOnchain`, as the Positions tab does for positions). The Tokyo
indexer's `Order` query fails for the busiest accounts, so an indexer-only tab would show an error for exactly the
market makers whose book matters most. Until then, scope the empty-state texts ("this wallet has nothing open on the
book", "has not traded on the order book") to the region that was actually read.

## Environment
- App: https://app.testnet.dreamdex.io/trader/<address> as served 2026-10-28 (chunk `27kddaaff2hz-.js`), logged out,
  fresh browser context, no wallet extension; Chrome 155 on Linux, 1440×900
- Somnia Tokyo testnet (DreamDEX region), chain 50383, RPC https://api.hideki2.infra.testnet.somnia.network; indexers
  https://hideki-dev.smk.somnia.host/v1/graphql (Tokyo) and https://dev.smk.somnia.host/v1/graphql (Global / Shannon 50312)
- Node 22.22 with viem 2.57.7; Python 3.14 (standard library only); read-only (no transactions, no wallet connection)
