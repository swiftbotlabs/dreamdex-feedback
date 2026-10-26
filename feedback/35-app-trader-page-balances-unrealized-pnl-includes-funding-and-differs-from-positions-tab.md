# App: on the public trader page, the Balances tab's "Unrealized PnL" is `equity − unlocked collateral`, so it also counts the funding the account owes and does not match the Positions tab's PnL column for the same positions (`0x9ca8…210c`: −522.25 vs −468.85 USDso; the 53.40 gap is the account's accrued funding on chain)
Severity: normal
Area: app

> **Summary.** `/trader/<address>` shows two unrealized-PnL figures for the same open positions, and they disagree. The
> **Positions** tab's **PNL (ROI%)** column is price only, `(mark − entry) × size`. The **Balances** tab's **PERPS MARGIN →
> UNREALIZED PNL** is computed as `equity − unlockedCollateralBalance`. MarginBank equity already subtracts each
> position's accrued, not yet settled, funding, so the Balances figure is price PnL minus funding owed. The difference
> between the two tabs is exactly the funding owed on chain: 53.40 USDso (about 11 % of the PnL) on
> `0x9ca8dc987deca9a3c94f6cf1b95eb12df5f6210c`, and 7.99 USDso on `0x0a606f1daac74a3c0265b94057822533521664cf`. The SDK
> docs define `unrealizedPnl` as "price only, **excludes** funding". The app's Portfolio page and its trading positions
> table use that definition too. Neither trader-page tab mentions funding or shows it as a separate figure.

> **Checked 2026-10-26 in three passes, 06:56–07:08, 07:44–07:47 and 08:06–08:12 UTC, on two accounts.** All 8 app
> snapshots show the gap, and each time it equals the funding owed on chain. On chain, `equity − unlocked = Σ price-only uPnL −
> Σ accrued funding` to within 2 wei. The served chunks were re-fetched at 08:08 UTC and are byte-identical to the copies
> saved at 06:31–06:51 UTC. Evidence: `evidence/35/app_vs_chain_0x9ca8_2026-10-26T0806Z.txt`,
> `evidence/35/app_vs_chain_0x0a60_2026-10-26T0808Z.txt`, `evidence/35/earlier_runs_2026-10-26T0656-0747Z.txt`,
> `evidence/35/code_excerpt_2026-10-26T0808Z.txt`.

The trader page says where its numbers come from: "perps positions and margin from the chain, across every region"
(**SOURCES** card). On the **Balances** tab, the **PERPS MARGIN** row has the columns Collateral, Unrealized PnL,
Available to trade, Withdrawable and Account value. In the served chunk `0z_hhyg7mkeef.js` the first two cells are:

```js
(0,o.figureColumn)("collateral","Collateral"),(0,o.figureColumn)("pnl","Unrealized PnL"), …
value: … (0,w.toHuman)(a.unlockedCollateralBalance+a.lockedCollateral,e.decimals)   // Collateral
value: … (0,w.toHuman)(a.equity-a.unlockedCollateralBalance,e.decimals)             // Unrealized PnL
```

The **Positions** tab's rows come from the app's per-position analytics. Each row keeps price PnL and funding as two
separate fields (`18l-mhgnij1hv.js`):

```js
m=(0,a.toHuman)(i.unrealizedPnl,r.quoteDecimals) … pnl:m,funding:-(0,a.toHuman)(i.accruedFunding,r.quoteDecimals),roiPercent:…
```

The trader page shows `pnl` in **PNL (ROI%)** and does not show `funding` at all. The analytics (`1srgxumia-zst.js`) use
the same split the SDK documents:

```js
r=0n===e.size?0n:(e.markPrice-e.avgEntryPrice)*e.size/e.oneBase,                       // unrealizedPnl (price only)
a=e.projectedCumulativeFunding-e.entryFundingIndex,n=q(e.size*a,v.FUNDING_PRECISION*e.oneBase), // accruedFunding
i=r-n                                                                                     // equityContribution
```

On chain, `getAccountHealth(account).equity` = `unlockedCollateralBalance + Σ (unrealizedPnl − accruedFunding)` (2 wei
residual in every read below). So the Balances cell is Σ `equityContribution`, while the Positions column is Σ
`unrealizedPnl`. The difference between them is Σ `accruedFunding`.

Everywhere else, the platform uses the price-only meaning for "unrealized PnL":

- **SDK Perps guide, Position analytics** (hosted at
  `https://somnia-platform-docs.vercel.app/markets/somnia-markets/typescript/perps`; `docs/PERPS.md:274–276` in
  `@somnia-chain/markets-sdk` 0.32.1):
  - "`unrealizedPnl` | `(mark − entry) × size / oneBase` — price only, **excludes** funding"
  - "`accruedFunding` | funding **owed** since entry; **positive means you pay**"
  - "`equityContribution` | `unrealizedPnl − accruedFunding` — what this position adds to equity"
- **Portfolio page, "Unrealized PnL" group, "Perps" row.** `deriveScopedPerps` (`3w46wu70iystk.js`) computes its value as
  the sum of the rows' price-only `pnl`: `value:u.reduce((e,t)=>e+t.pnl,0)`. Its hint is
  `PERPS_ACCOUNT_TOOLTIPS.unrealizedPnl` (`10iy8gq7y45i-.js`), which reads "Profit on open positions, valued at each market's mark
  price. Closing fills against the order book at the best available prices, so the PnL you realise can differ."
  (`1j1mgf8g_71p9.js`).
- **The signed-in trader's positions table in the trading view** (`2da5cl5v3wvz_.js`, the table with "Close all" and
  "TP / SL"). It has a separate **Funding** column with the hint "Net funding paid (−) or received (+) while holding this
  position. …". Next to it, **PnL (ROI%)** has the hint "Unrealized profit at the mark price. ROI is PnL ÷ position margin. …".

The result: on the trader page, "Unrealized PnL" means price PnL minus pending funding, while every other place in the
app and docs it means price PnL only. For one account, the trader page's Balances tab and that account's own Portfolio
page therefore compute different "Unrealized PnL" values. (Portfolio is visible only to the signed-in owner, so for
these third-party accounts this part comes from the code above, not from the screen.)

The funding docs explain why the amount is still pending: "Funding is applied to your position the next time it is
touched, by a trade, a withdrawal or a liquidation, and everything owed since the last time is settled at once."
(`/docs/trading/perps-testnet/funding`, `llms-full.txt` line 6166). Until then the amount is inside equity, and the
trader page shows it as part of the price PnL.

The figure moves with funding even when nothing else changes. Between 07:46:59 and 08:08:02 UTC, account `0x0a60…64cf`
kept the same ten position sizes, the same unlocked collateral (2,035.3572) and no locked collateral. Over that time, its funding owed on
SOL-PERP rose from 4.1132 to 7.2022 USDso. Over the same time, the gap between its Balances and Positions figures grew
from 4.91 to 7.99 USDso.

## Steps to reproduce
1. Open https://app.testnet.dreamdex.io/trader/0x9ca8dc987deca9a3c94f6cf1b95eb12df5f6210c. The page is public; signed
   in or not makes no difference. Click **Positions** and add up the **PNL (ROI%)** values of the `PERPS · DREAMDEX` rows.
2. Click **Balances** and read **PERPS MARGIN → UNREALIZED PNL**. To read both tabs at the same moment, paste
   `evidence/35/read_both_tabs.js` into the DevTools console on that page. It reads the two tabs about 0.4 s apart and returns
   the PnL values and their sum.
3. In the same minute, read the account on chain (Somnia Tokyo testnet, eth_call only):
   ```sh
   # viem 2.57.7: MarginBank getAccountState / getAccountHealth / getPosition + each pool's tryGetHealthSnapshot, one block
   node evidence/35/pnl_gap_check.mjs 0x9ca8dc987deca9a3c94f6cf1b95eb12df5f6210c
   ```
   Or, with `cast`, for one position:
   ```sh
   RPC=https://api.hideki2.infra.testnet.somnia.network
   MB=0x478769E1177C0773c43A593DCCc4Ad15F15F1394
   A=0x9ca8dc987deca9a3c94f6cf1b95eb12df5f6210c
   HYPE=0x63B47eD4A7DE0FdE659b0d82441dD74828b7297A
   cast call $MB 'getAccountState(address)((int256,uint256,address[]))' $A --rpc-url $RPC
   cast call $MB 'getAccountHealth(address)(int256,uint256,uint256,uint256)' $A --rpc-url $RPC
   cast call $MB 'getPosition(address,address)((int128,uint128,int256,uint64))' $A $HYPE --rpc-url $RPC
   cast call $HYPE 'tryGetHealthSnapshot()(bool,(uint256,uint256,int256,uint256,uint256,uint256))' --rpc-url $RPC
   ```
   For each position: `uPnL = (markPrice − avgEntryPrice) × size / oneBase` and
   `accruedFunding = ceil(size × (projectedCumulativeFunding − entryFundingIndex) / (1e18 × oneBase))`.
4. Compare the results:
   - The Positions sum matches Σ uPnL, up to price movement between the app read and the chain read.
   - UNREALIZED PNL matches `equity − unlockedCollateralBalance` = Σ uPnL − Σ accruedFunding.
   - The difference between the two tabs equals Σ accruedFunding. Funding does not change with price, so this holds
     even when the prices move.
5. Repeat with `0x0a606f1daac74a3c0265b94057822533521664cf` (10 positions).
6. In DevTools → Sources, open `_next/static/immutable/chunks/0z_hhyg7mkeef.js` (lazy-loaded by `237i2newtrhuo.js` on this
   page) and search for `equity-a.unlockedCollateralBalance`.

## Expected
The Balances tab's **Unrealized PnL** equals the sum of the Positions tab's PnL column. That is the price-only figure
that the SDK docs, the Portfolio hint and the trading positions table all call unrealized PnL. The funding the account
owes is shown under its own name, e.g. a "Funding owed" figure, or a Funding column on the trader page's Positions
table, as in the trading view. If the funding-inclusive figure is what the page means to show, its label and a hint
say so.

## Actual
**Account `0x9ca8…210c`.** Both tabs read in one JS pass. Chain read right after.

| | value (USDso) |
|---|---|
| Positions tab, 08:06:59.360 UTC: HYPE-PERP / BTC-PERP / SUI-PERP PnL | −269.46 / −67.02 / −132.37, sum **−468.85** |
| Balances tab, 08:06:59.764 UTC: Collateral / **Unrealized PnL** / Account value | 4,258.04 / **−522.25** / 3,735.79 |
| Positions tab again, 08:07:00.168 UTC | same rows, sum −468.85 |
| **Gap (Balances − Positions)** | **−53.40** |
| Chain, block 33498706 (08:07:01 UTC): unlocked / locked / equity | 3,573.0178 / 685.0226 / 3,044.0885 |
| Price-only uPnL HYPE / BTC / SUI, sum | −274.2494 / −68.2668 / −133.0199, Σ −475.5361 |
| accruedFunding (owed) HYPE / BTC / SUI, sum | 20.4114 / 31.1953 / 1.7864, Σ **53.3931** |
| `equity − unlocked` | −528.9292 = −475.5361 − 53.3931 (residual −2 wei) |

The chain read was two seconds after the app read, and BTC's mark had moved from 79,692.8 to 79,676.75 in that time.
So the absolute numbers differ, but the funding term does not depend on price. Screenshots:
`evidence/35/trader_positions_0x9ca8_2026-10-26T080732Z.png` (rows −268.66 / −67.37 / −129.21, sum −465.24) and
`evidence/35/trader_balances_0x9ca8_2026-10-26T080734Z.png` (UNREALIZED PNL −518.64), taken 2 s apart. Gap 53.40.

At 08:12 UTC (`cast`, block 33501773) the same identity held with new prices and one more BTC funding interval:
Σ uPnL −549.6360, Σ accruedFunding 54.2426 (BTC now 32.0448), `equity − unlocked` −603.8786, residual −2 wei.

**Account `0x0a60…64cf`** (10 positions, status "Margin call"):
- Positions tab, 08:08:02.292 UTC: the ten PnL values sum to **−439.50**.
- Balances tab, 08:08:02.701 UTC: Collateral 2,035.36, **Unrealized PnL −447.49**, Account value 1,587.86.
- **Gap: −7.99.**
- Chain, block 33499330 (08:08:03 UTC):
  - Σ uPnL −444.8916.
  - Σ accruedFunding **7.9868**: SOL 7.2022, BTC 0.5492, BNB 0.0906, AVAX 0.0363, HYPE 0.0305, 1000PEPE 0.0291, VVV 0.0259,
    XRP 0.0258, XLM 0.0108, ZRO −0.0138.
  - `equity − unlocked` −452.8784, residual −2 wei.

**Earlier passes, same day** (`evidence/35/earlier_runs_2026-10-26T0656-0747Z.txt`):

| UTC (app) | account | Positions PnL sum | Balances Unrealized PnL | gap | chain funding owed (block) |
|---|---|---|---|---|---|
| 06:56:42 | `0x0a60…` | −241.20 | −246.01 | 4.81 | 4.8253 (33456548) |
| 07:08:09 | `0x9ca8…` | −357.34 | −408.89 | 51.55 | 51.5408 (33463423) |
| 07:44:09 | `0x9ca8…` | −416.52 | −469.91 | 53.39 | 53.3931 (33485004) |
| 07:44:34 | `0x9ca8…` | −438.04 | −491.43 | 53.39 | 53.3931 (33485263) |
| 07:45:00 | `0x9ca8…` | −443.61 | −497.00 | 53.39 | 53.3931 (33485519) |
| 07:46:59 | `0x0a60…` | −306.63 | −311.54 | 4.91 | 4.8891 (33486704) |

## Evidence
- `evidence/35/app_vs_chain_0x9ca8_2026-10-26T0806Z.txt`, `evidence/35/app_vs_chain_0x0a60_2026-10-26T0808Z.txt`: the raw output
  of `read_both_tabs.js` (both tabs' text, the PnL values, timestamps) and of `pnl_gap_check.mjs` (per-pool size, entry,
  mark, uPnL, accrued funding, the sums and the residual) for each account.
- `evidence/35/trader_positions_0x9ca8_2026-10-26T080732Z.png`, `evidence/35/trader_balances_0x9ca8_2026-10-26T080734Z.png`: the two
  tabs of `/trader/0x9ca8…210c`, 2 s apart.
- `evidence/35/cast_reads_0x9ca8_block33501773.txt`: the `cast call` commands from step 3 for all three positions, their raw
  output at one block, and the uPnL / funding / residual worked out from them.
- `evidence/35/earlier_runs_2026-10-26T0656-0747Z.txt`: the six earlier snapshots in the table above, with the app text and
  chain output.
- `evidence/35/code_excerpt_2026-10-26T0808Z.txt`: the code quoted above from the live chunks (trader Balances and Positions
  cells, row fields, position analytics, tooltip strings, Portfolio row, trading-view Funding column), with offsets.
  `evidence/35/chunk_hashes_2026-10-26T0808Z.txt` has the sha256 prefixes and sizes, and
  `evidence/35/trader_html_chunks_2026-10-26T0808Z.txt` lists the chunks the trader page's HTML loads (it includes `237i2newtrhuo.js`).
- `evidence/35/docs_excerpt_2026-10-26T0809Z.txt`: the hosted SDK Position analytics table, the same lines from the 0.32.1
  tarball, and the funding-settlement line from the dreamDEX docs.
- `evidence/35/pnl_gap_check.mjs`, `evidence/35/read_both_tabs.js`: the two read-only scripts used.

## Suggested fix
- In the trader page's PERPS MARGIN row (`0z_hhyg7mkeef.js`), take **Unrealized PnL** from the same rows the Positions
  tab uses: Σ `row.pnl`, as `deriveScopedPerps` already does for the Portfolio. Add the funding as its own figure, e.g.
  **Funding owed** = Σ `accruedFunding` (the rows already carry it as `funding`). Account value stays the same:
  Collateral + Unrealized PnL − Funding owed equals today's Collateral + (equity − unlocked).
- Add the **Funding** column to the trader page's Positions table, as the trading view's table already has, so each
  position's PnL and funding can be read side by side.
- If the funding-inclusive number is meant to stay, rename the column (e.g. "Unrealized PnL, net of funding") and give
  it a hint. The `accountEquity` hint ("Your perps account's collateral plus unrealized PnL across open positions.")
  leaves funding out as well, and could add "… minus funding owed".

## Environment
- App: app.testnet.dreamdex.io as served 2026-10-26. The trader page was read at 06:56–07:08, 07:44–07:47 and 08:06–08:08 UTC.
  Chunks were re-fetched 08:08 UTC, sha256 prefixes: `237i2newtrhuo.js` `ccfbc4cd59d445a5`, `0z_hhyg7mkeef.js` `e4126baceea384f4`,
  `18l-mhgnij1hv.js` `cd77a29940d14b26`, `1srgxumia-zst.js` `2de6b1c82b1f32ca`, `1j1mgf8g_71p9.js` `f57c09c3ef0624b3`,
  `10iy8gq7y45i-.js` `6c5814eb1daccee1`, `3w46wu70iystk.js` `7676aa31feaed15e`, `2da5cl5v3wvz_.js` `2d9d72e91dd355b8`.
- Browser: Chrome 155.0.8059.84 on Linux, signed in as an unrelated Somnia Account (the trader page is public).
- Network: Somnia Tokyo testnet ("Hideki" in the docs, the DreamDEX region in the app), chain id 50383, RPC
  `https://api.hideki2.infra.testnet.somnia.network`. MarginBank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394`, as listed on
  `app.dreamdex.io/docs/developers/perps-testnet`. Pools: HYPE `0x63B47eD4A7DE0FdE659b0d82441dD74828b7297A`,
  BTC `0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0`, SUI `0x1Be21287cfB865a7c462Ff3c4f275E70BcccefE4`.
- Tools: node v22.22.1 with viem 2.57.7; cast 1.8.5.
- `@somnia-chain/markets-sdk` 0.32.1: docs read only (tarball read as text, not executed).
- Wallet: read-only, no transactions sent.
