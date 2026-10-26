# App: the Markets page (`/explore`) shows the Global region (Shannon, chain 50312), not the DreamDEX region where testnet perps run: its perps card says "15 MARKETS" with Shannon prices and ranking, and six of the 21 documented markets never appear
Severity: normal
Area: app

> **Summary.** Every row on the Markets page comes from the app's "Global" region (indexer `dev.smk.somnia.host`, chain
> 50312). The docs say testnet perps and testnet wallets are in the DreamDEX region (Hideki, 50383), and the app itself
> lands on DreamDEX. The page therefore shows another deployment's perps: "15 MARKETS" where the docs list 21 (ZEC, LIT,
> VVV, 1000PEPE, PUMP and ZRO never appear), with Shannon's prices and Shannon's volume ranking. On the spot card, the
> header opens DreamDEX STT-USDso, while the STT row shows the 24h volume of Global SOMI:USDso, about 21 times
> DreamDEX STT's. Logged out, the row also opens that Global market.

> **Checked 2026-10-26 in two passes, 02:16–02:30 UTC and 03:37–03:47 UTC, logged in and logged out.** Both passes
> gave the same result. At 03:38:42 UTC (logged in) and 03:46:23 UTC (logged out) every perps price on the page equals
> the Shannon indexer's `lastPrice`, and none equals the Tokyo indexer's. The live bundle (fetched 03:42 UTC) still
> builds the rows with `region:E.GLOBAL_REGION`, and still did at 04:51 UTC (same chunk hashes). Evidence: `evidence/19/explore_vs_indexers_2026-10-26T0338Z.txt`,
> `evidence/19/explore_page_2026-10-26T0338Z.png`, `evidence/19/code_excerpt_2026-10-26T0342Z.txt`.

The testnet app has two regions in its config: **Global**, with indexer `https://dev.smk.somnia.host/v1/graphql`
(its `chain_metadata` answers `50312`, Shannon), and **DreamDEX** (id `tokyo`), with indexer
`https://hideki-dev.smk.somnia.host/v1/graphql` (`50383`, Hideki). The app's landing region is DreamDEX
(`LANDING_REGION = TOKYO_LISTED ? tokyo : Global`). `/trade` redirects to `/trade/spot/tokyo/STT:USDso`, and the nav's
**Trade** link is `/trade/perps/tokyo/BTC-PERP`. The docs say the same thing:

> Testnet perps run on the **Hideki** testnet chain, which the app shows as the **DreamDEX** region.
> (`/docs/developers/perps-testnet`)

> Testnet perps run in the **DreamDEX** region of app.testnet.dreamdex.io. … On testnet your wallets live in DreamDEX,
> the region the perp markets are in. … All 21 markets are margined in USDso. (`/docs/trading/perps-testnet`)

The Markets page ("Spot, perpetuals and event contracts, each with its busiest live markets."; the three **Choose a
Market** links on `/portfolio` lead to it) does not follow that. Its component sorts each venue by lifetime quote
volume, keeps the top 6 and builds every row for the Global region:

```js
function Q(e){return[...e??[]].sort((e,t)=>((0,y.lifetimeQuoteVolumeOf)(t)??0)-((0,y.lifetimeQuoteVolumeOf)(e)??0))}
R=(0,s.useMemo)(()=>Q(_).slice(0,6),[_]),D=(0,s.useMemo)(()=>r?Q(O).slice(0,6):[],[O,r])
F=(0,s.useMemo)(()=>[{markets:U,region:E.GLOBAL_REGION}],[U])
```

The page shows no region label. As a result:

1. **Market count and list.** The perps card says **15 MARKETS**. Shannon has 24 PERP markets: 15 plain ones plus 9
   `SW*` ones (`SWBTC`, `SWBTCA`–`SWBTCD`, `SWETH`, `SWSOL`, `SWDOGE`, `SWBNB`). Tokyo has 21, the same 21 as the docs'
   market table. ZEC, LIT, VVV, 1000PEPE, PUMP and ZRO exist only on Tokyo, so they never appear on the page.
2. **Prices.** Every perps price on the page, and the spot BTC and ETH prices, are the Shannon `lastPrice`, not the
   Tokyo one (table under Actual). STT happened to have the same price on both indexers.
3. **"Busiest" ranking.** The perps rows are ETH, SOL, XRP, BTC, ADA, BNB, which is Shannon's lifetime-volume order. The
   DreamDEX perps by the same measure are BTC, ETH, SOL, HYPE, NEAR, XRP. The spot rows are BTC, STT, ETH (Shannon
   WBTC > SOMI > WETH), while Tokyo's order is WBTC > WETH > STT.
4. **The STT row.** It shows Shannon's SOMI:USDso 24h volume (36.33K) and links to `/trade/spot/SOMI:USDso`. Logged in,
   the app moves that click to `/trade/spot/tokyo/STT:USDso`, whose header says **24H VOL $1.74K**. Logged out, the
   row stays on the Global market (24H VOL $36.53K), while the same card's **spot** header (`/trade`) opens the DreamDEX
   market. One card thus leads to two different "STT-USDso" markets.

The perps rows link to `/trade/perps/<X>-PERP`, which answers `307` to `/trade/spot/tokyo/STT:USDso`. That redirect is
our report #10 and is not part of this report.

## Steps to reproduce
1. Open https://app.testnet.dreamdex.io/explore, logged in or logged out. Note the perps card's count, the six perps
   rows with their prices, and the spot rows' **24H VOL**.
2. In the same minute, query both indexers:
   ```bash
   Q='{"query":"query{chain_metadata{chain_id} Market(where:{marketType:{_in:[\"PERP\",\"SPOT\"]}}){marketType baseSymbol poolAddress lastPrice cumulativeQuoteVolume quoteDecimals}}"}'
   curl -s https://dev.smk.somnia.host/v1/graphql        -H 'content-type: application/json' -d "$Q"
   curl -s https://hideki-dev.smk.somnia.host/v1/graphql -H 'content-type: application/json' -d "$Q"
   ```
   `lastPrice` has 18 decimals. Compare the prices with step 1, count the PERP markets, and sort each venue by
   `cumulativeQuoteVolume`.
3. Optional: in DevTools → Network on `/explore`, the `Candles` queries behind the rows all go to
   `dev.smk.somnia.host`, and `hideki-dev.smk.somnia.host` receives none.
4. Logged in, click the **STT** row, then read the address bar and the header's **24H VOL**. Repeat in a fresh
   logged-out window.
5. `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n'` for `https://app.testnet.dreamdex.io/trade` and
   `https://app.testnet.dreamdex.io/trade/spot/SOMI:USDso`.
6. Optional 24h check: for each spot `poolAddress` from step 2, sum `quoteVolume` of
   `Candle(where:{pool:{_eq:"<pool>"},market_id:{_eq:"<pool>"},intervalSeconds:{_eq:3600},bucketStart:{_gte:<now-86400>}})`
   on each indexer, divided by `10^quoteDecimals`.

## Expected
The Markets page shows the region the app lands on and the docs describe for testnet (DreamDEX / Tokyo): 21 perps
markets, Tokyo prices, Tokyo's busiest markets, and an STT row with DreamDEX STT-USDso's own volume. Each row and
each card header should open the market the row shows. If the page is meant to show the Global region, it should
say so, and its header links and row links should stay in that region.

## Actual
Logged in, page read at 03:38:42 UTC. Indexers queried right after (dev.smk 03:38:42, hideki-dev 03:38:45 UTC):

| row on /explore | price shown | Shannon `lastPrice` (dev.smk, 50312) | Tokyo `lastPrice` (hideki-dev, 50383) |
|---|---|---|---|
| perps ETH | 2,305.50 | 2305.5 | 2304.06 |
| perps SOL | 100.38 | 100.38 | 100.49 |
| perps XRP | 1.2782 | 1.2782 | 1.2787 |
| perps BTC | 79,546.6 | 79546.6 | 79751.8 |
| perps ADA | 0.2019 | 0.2019 | 0.2039 |
| perps BNB | 736.643 | 736.643 | 737.006 |
| spot BTC | 79,612.1 | 79612.1 (WBTC) | 79593.6 (WBTC) |
| spot ETH | 2,305.81 | 2305.81 (WETH) | 2304.95 (WETH) |
| spot STT | 0.1736 | 0.1736 (SOMI) | 0.1736 (STT) |

- **Count:** the card says `15 MARKETS`. dev.smk has 24 PERP markets (15 plus 9 `SW*`), and hideki-dev has 21,
  including ZEC, LIT, VVV, 1000PEPE, PUMP and ZRO. The docs' `/docs/trading/perps-testnet` table lists the same 21.
- **Ranking**, by `cumulativeQuoteVolume`, the key the page sorts on:
  - Shannon perps: ETH 251.3M > SOL 250.0M > XRP 47.2M > BTC 25.3M > ADA 19.6M > BNB 11.0M. This is the page's order.
  - Tokyo perps: BTC 983.7M > ETH 755.0M > SOL 276.6M > HYPE 175.2M > NEAR 141.0M > XRP 73.7M.
  - Spot: Shannon WBTC 9.12M > SOMI 3.05M > WETH 1.49M, which is the page's BTC, STT, ETH. Tokyo: WBTC 1.86M > WETH
    0.67M > STT 0.32M.
- **24h volume** on the spot rows (hourly candles, 03:38:57 UTC):
  - The page's 96.04K / 36.33K / 28.17K equal Shannon's WBTC 96,039.06 / SOMI 36,331.13 / WETH 28,174.46.
  - Tokyo has WBTC 93,884.44, STT 1,741.27 and WETH 25,072.21.
- **Data source:** in the earlier pass's network capture (logged in, 02:18:54 UTC), all 29 `Candles` queries went to
  `dev.smk.somnia.host` for pools `0x6a7224a4` (ETH), `0x4d3892d1` (SOL), `0x996d3678` (XRP), `0x3892a517` (BTC),
  `0x440f5a79` (ADA), `0x11c8d997` (BNB), `0x3605f28a` (WBTC), `0x259fd655` (SOMI) and `0xd180195d` (WETH). These are
  Shannon pools; the Tokyo pools are `0xd6cb1dd5…`, `0x4181dd08…` and so on. `hideki-dev` received no `Candles` query.
- **STT row, logged in:**
  - Clicked at 03:40:06 UTC; the row read `STT Somnia 0.1735 -0.12% 36.36K`.
  - By 03:40:31 UTC the page was `https://app.testnet.dreamdex.io/trade/spot/tokyo/STT:USDso`, title
    `0.1737 | STT-USDso | dreamDEX`, header `24H VOL $1.74K`.
  - The earlier pass showed the same: clicked at 02:26:54 UTC, it landed on the tokyo page with `24H VOL $1.64K`
    while the row said 36.04K.
- **Logged out** (fresh browser context with no cookies, page read at 03:46:23 UTC, indexers at 03:46:25/26 UTC):
  - The card again said `15 MARKETS`. The perps rows ETH 2,299.48 | SOL 100.06 | XRP 1.2789 | BTC 79,498.8 |
    ADA 0.2009 | BNB 736.525 equal Shannon's `lastPrice` exactly. Tokyo had ETH 2298.78, SOL 100.12, XRP 1.2768,
    BTC 79593.3, ADA 0.2039, BNB 735.967.
  - The STT row read `36.52K`. Clicking it stayed on `https://app.testnet.dreamdex.io/trade/spot/SOMI:USDso`, title
    `0.1733 | STT-USDso | dreamDEX`, `24H VOL $36.53K` (03:46:41 UTC). A run at 03:41 UTC gave the same result
    (`36.40K` → SOMI:USDso, `24H VOL $36.40K`).
  - The same card's **spot** header goes to `/trade`, and `/trade` → `307` → `/trade/spot/tokyo/STT:USDso`.
    `/trade/spot/SOMI:USDso` answers `200` with no redirect (curl, 03:40:40 UTC).
- **Earlier pass, logged in, 02:19:32 UTC:**
  - Page: ETH 2,309.28 | SOL 100.94 | XRP 1.2903 | BTC 79,652.1 | ADA 0.2017 | BNB 738.352.
  - Shannon `lastPrice` had the same six values. Tokyo had ETH 2307.48, SOL 101.06, XRP 1.2917, BTC 79819.2,
    ADA 0.2039, BNB 738.392.
  - Logged out at 02:29:44 UTC the six perps prices again equalled Shannon's `lastPrice` read at 02:29:45 UTC.

## Evidence
- `evidence/19/explore_vs_indexers_2026-10-26T0338Z.txt` (readable) and `.json` (raw): the page's rows with their links,
  and both indexers' `chain_metadata` and Market rows, read in the same minute.
- `evidence/19/explore_page_2026-10-26T0338Z.png`, `evidence/19/explore_page_text_2026-10-26T0338Z.txt`: the page logged in
  ("15 MARKETS", the six perps rows, the spot rows with 24H VOL).
- `evidence/19/vol24_2026-10-26T0338Z.txt`: 24h quote volume from hourly candles on both indexers.
- `evidence/19/stt_row_click_loggedin_2026-10-26T0340Z.png` / `.txt`: where the STT row lands when logged in (tokyo
  STT-USDso, 24H VOL $1.74K). `evidence/19/stt_row_click_loggedin_2026-10-26T0227Z.png`: the same from the earlier pass.
- `evidence/19/explore_loggedout_vs_indexers_2026-10-26T0346Z.jsonl`: logged out, the page rows, both indexers'
  `lastPrice` read 2–3 s later, and the STT row's landing page. `evidence/19/explore_loggedout_2026-10-26T0341Z.jsonl`:
  the same without the indexer reads.
- `evidence/19/redirects_2026-10-26T0340Z.txt`: curl status and `location` for `/trade`, `/perps`, two spot row links
  (`SOMI:USDso`, `WBTC:USDso`) and two perps row links (`ETH-PERP`, `BTC-PERP`).
- `evidence/19/explore_network_summary_2026-10-26T0218Z.txt`: GraphQL operations per indexer host from a DevTools capture
  of `/explore`, with the `Candles` pool ids and each host's `chain_metadata`.
- `evidence/19/code_excerpt_2026-10-26T0342Z.txt`: the Explore component and region-config fragments from the live
  bundle, with chunk URLs and hashes.
- `evidence/19/docs_excerpt_2026-10-26T0337Z.txt`: the quoted docs lines from the live `llms-full.txt`, and the 21
  markets in the docs table.
- `evidence/19/explore_page_text_2026-10-26T0219Z.txt`, `evidence/19/indexer_dev.smk_2026-10-26T0219Z.json`,
  `evidence/19/indexer_hideki-dev_2026-10-26T0219Z.json`: the earlier pass's page text and indexer reads.

## Suggested fix
- Build the Markets page for the region the app lands on, as the rest of the testnet app does. Use `LANDING_REGION`
  (or the signed-in user's home region) instead of `GLOBAL_REGION` in `[{markets, region}]`, take markets, tickers
  and closes from that region's indexer, and link rows to the region routes (`/trade/spot/tokyo/STT:USDso`,
  `/trade/perps/tokyo/<X>-PERP`).
- If the page should show Global on purpose, label the cards with the region and make the card headers open the same
  region as the rows.

## Environment
- App: app.testnet.dreamdex.io as served 2026-10-26 02:16–02:30 UTC and 03:37–03:47 UTC. Bundle chunks
  `0kjxa_afar1-j.js` (sha256 `2dc2f1e23c16a944…`) and `0p4rb93gq9d0a.js` (`075cbb1e21204a21…`) were unchanged
  between the two passes.
- Indexers: `dev.smk.somnia.host` (`chain_metadata` 50312), `hideki-dev.smk.somnia.host` (50383). Network for
  testnet perps: Tokyo / Hideki (50383).
- Browser: Chrome 155 on Linux. Logged in means a Privy e-mail login with Somnia Account
  `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`. Logged out means a fresh isolated browser context with no cookies.
- curl 8.18.0. Docs: `https://app.testnet.dreamdex.io/llms-full.txt`, fetched 2026-10-26 03:37 UTC.
- `@somnia-chain/markets-sdk`: not involved. No transactions sent.
