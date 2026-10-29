# Contracts: a stage-3 liquidation closes the whole position and charges 1% of its full notional even when the account is cents below maintenance margin. Docs say positions are closed "until the account is back above maintenance margin" and that an account that comes back just above it "pays nothing". 36 of 37 ETH/WLD/LINK liquidations closed 100%: fees 12,060 USDso against about 101 for the smallest close that restores maintenance
Severity: major
Area: contracts | docs

> **Summary.** The trader docs (Margin & Liquidations → Liquidations) say:
> "Your open orders are cancelled first, then positions are closed on the order book one at a time **until the account is
> back above maintenance margin**." and "A liquidation on the book charges a fee of up to 1% of the notional it closes,
> taken only from the surplus the close creates: **an account that comes back just above maintenance margin pays
> nothing.**" The SDK calls the stage `CLOBPartial`.
>
> On the Tokyo testnet the LiquidationEngine almost always closes the **entire** position, however small the shortfall, and
> the 1% fee is then charged on the whole notional:
> - `0x262d…094a`, SOL long, **0.15 USDso** under maintenance (409.69 equity vs 409.84 required). A close of about
>   10 USDso notional restores maintenance. The engine closed **16,393.76 USDso, 100%**, and charged **163.94 USDso**: 40% of the
>   account's equity.
> - `0x4882…616c`, ETH, **0.05 USDso** under: closed 33,172.80 (100%), fee **331.98**.
> - `0x12f2…4261`, SOL, 1.45 USDso under: closed 58,293.33 (82.8%; 122.13 of 709.7 SOL stayed open), fee **582.81**.
>
> Across the 37 most recent single-market liquidations on 18-decimal markets (ETH, WLD, LINK), **36 closed 100%** and one
> 96.4%. They charged **12,060.09 USDso** in fees, where the smallest close that puts each account back at maintenance
> (with the full 1% fee on it) would have cost **100.87**. The documented behaviour does exist: `0xecca…7000` (SOL, 2.38
> under) had 1.85% closed, came back just above maintenance and paid **0**. One block earlier `0x5d4c…818c` (SOL, 1.79 under)
> was closed 100% and paid 255.93. Same market, same keeper call (`0x03159a8f(account, 0, 0)` through `0x03ca…1cc`),
> opposite treatment.
>
> **Checked 2026-10-29, 20:05–20:45 UTC**, read-only, in five runs of the same script (all markets and 18-decimal markets,
> same pattern every time; three runs are saved). Evidence: `evidence/58/`.

## Steps to reproduce
1. Run the read-only scan. It finds recent `AccountLiquidated` rows with `stageReached` 1 (`CLOBPartial`) and one
   position processed in the Tokyo indexer. For each, it reads `MarginBank.getAccountHealth` and `getAccountState` **on
   chain at block − 1 and at the block**, the pool's `maintenanceMarginBps`, the position before and after
   (`PerpPositionChange`) and the `LiquidationFee` row (`PerpFeeRecord`). Accounts with more than one market are skipped,
   so the arithmetic is exact up to slippage.
   ```sh
   npm install                               # viem 2.57.7, pinned
   node evidence/58/liq_close_size.mjs 30               # 30 most recent single-market liquidations, all markets
   DECIMALS=18 node evidence/58/liq_close_size.mjs 40   # 40 most recent on markets with an 18-decimal base (ETH, BNB, AVAX, LINK, ...)
   ```
   Per liquidation it prints: size before → after (% closed), equity / maintenance requirement before (and the
   shortfall), the **smallest restoring close**, the notional actually closed, the fee charged, and equity / maintenance
   / initial requirement after.
   The smallest restoring close is the notional `x` with `equity − 1%·x ≥ mmRate·(notional − x)`, i.e.
   `x = shortfall / (mmRate − 1%)`. It assumes the full fee and no slippage, so it leans toward a bigger close.
2. Check any row by hand: `MarginBank.getAccountHealth(account)` at `blockNumber − 1` and at `blockNumber`, and the indexer
   `PerpPositionChange(where: {txHash, account})` and `PerpFeeRecord(where: {txHash})` for the tx.
3. Compare with `/docs/trading/perps-testnet/margin-and-liquidations` (Liquidations section).

## Expected
As documented: the engine closes on the book only until the account is back above maintenance margin, and the fee comes
only from the surplus that close creates, so an account that ends just above maintenance pays (close to) nothing. For
`0x262d…094a` that is a close of about 10 USDso notional and a fee of at most about 0.10 USDso, not 16,394 and 163.94.

If closing whole positions is intended, the docs should say so: a liquidation closes the entire position whatever the
shortfall, and costs 1% of its notional (up to 40% of equity at 20×), so traders and bot builders can size against it.
Either way one rule should apply. Two near-identical SOL accounts one block apart should not get a 1.85% close with no fee
and a 100% close with a 255.93 fee.

## Actual
`evidence/58/liq_close_size_recent_2026-10-29T2030Z.txt` (all markets) and
`evidence/58/liq_close_size_18dec_markets_2026-10-29T2030Z.txt` (ETH/WLD/LINK), both re-run from the earlier 20:06–20:09 UTC
runs with the same pattern:

| Block | Account | Market | Shortfall before (USDso) | Smallest restoring close (notional) | Closed (notional, % of position) | Fee charged | Equity after | Tx |
|---|---|---|---|---|---|---|---|---|
| 36,511,927 | `0x262d094a…` | SOL | 0.15 | 10.32 | 16,393.76 (100%) | **163.94** | 246.03 (was 409.69) | `0x0b83e52fcdf3…` |
| 36,511,972 | `0x0bd8e8da…` | SOL | 0.78 | 51.95 | 25,967.38 (100%) | **259.68** | 387.68 (was 648.45) | `0xf3b37c877c28…` |
| 36,511,537 | `0x3d2ff83e…` | SOL | 0.30 | 19.70 | 20,388.10 (100%) | **203.96** | 307.42 (was 509.57) | `0x49b8cdd03b2a…` |
| 36,510,027 | `0x12f267b5…` | SOL | 1.45 | 96.79 | 58,293.33 (82.8%) | **582.81** | 1,163.59 (was 1,758.80) | `0x1d1c9a962383…` |
| 36,510,384 | `0x5d4cb63b…` | SOL | 1.79 | 119.64 | 25,629.87 (100%) | **255.93** | 346.19 (was 638.95) | `0x6ad04cb29b…` |
| 36,510,385 | `0xeccabf1b…` | SOL | 2.38 | 158.61 | 433.45 (1.85%) | **0.00** | 578.59, maintenance 572.88: just above | `0x5c04eadaee5d…` |
| 30,356,266 | `0x4882616c…` | ETH | 0.05 | 3.57 | 33,172.80 (100%) | **331.98** | 522.68 (was 829.27) | `0xbe35554bc8…` |
| 35,233,818 | `0xf3ed3f5b…` | ETH | 5.33 | 355.38 | 190,955.38 (96.4%) | **1,911.94** | 2,794.90 (was 4,945.22) | `0x80dae6c6915f…` |

Summaries printed by the script:
- 18-decimal markets: `37 liquidations; closed notional / smallest restoring close: median 164.6x; >=10x on 35, >=100x on
  21; fees charged 12060.09 USDso vs 100.87 at the smallest restoring close; post status healthy(0) on 37` (re-run at
  20:37 UTC with `DECIMALS=18`: 36 rows, as one historical read did not answer; median 164.6x, fees 11,438.36 vs 93.25)
- All markets, 30 most recent: 20 full closes, 8 of them with a shortfall under 1 USDso; fees 5,474.68 vs 386.63.

All eight liquidations in the table went through the same entry point: a keeper EOA calls `0x03ca1f61…1cc` with selector
`0x03159a8f` and arguments `(account, 0, 0)`, the same call for the full closes and for the 1.85% one
(`evidence/58/liq_tx_entrypoint_*.txt`). The LiquidationEngine
configuration (`getLiquidationPenaltyBps` 100, min/max liquidation spread 50/500 bps, `getMaxLiquidationVolumePerBlock`
100,000 USDso) has no setting that explains closing 100% for a 0.05 USDso shortfall.

Smaller cases (HYPE, blocks 36,371,7xx–36,372,6xx, in the all-markets output) go the other way: the engine closed
0.07–2.6% per call and left the account still below maintenance (status 2 → 2), several times in a row. Those look
limited by book depth inside the engine's price bound (our reading; not verified) rather than sized to the shortfall.

## Evidence
- `evidence/58/liq_close_size.mjs`: the read-only scan (indexer to find transactions; chain reads for health before/after).
- `evidence/58/liq_close_size_recent_2026-10-29T2030Z.txt`: 30 most recent single-market stage-3 liquidations, all markets.
- `evidence/58/liq_close_size_18dec_markets_2026-10-29T2030Z.txt` and the later `…_18dec_markets_*.txt` run: 37 most recent on 18-decimal markets.
- `evidence/58/liq_tx_entrypoint.mjs` + output: sender, target and arguments of the eight table transactions.
- Each output ends with a `JSON` line holding every row, including the full tx hash.
- Docs: `https://app.dreamdex.io/llms-full.txt`, section `/docs/trading/perps-testnet/margin-and-liquidations`
  (unchanged since 2026-10-29 04:48 UTC). SDK 0.32.1 `docs/PERPS.md` "Reading a liquidation's stage" (`CLOBPartial`).

## Suggested fix
Size the stage-3 close to the shortfall: close the smallest quantity (rounded up to the lot, plus a small buffer for
slippage and the fee) that puts the account back above maintenance, as the docs describe. Charge the fee only on that
quantity. If the engine already tries to do this, find why it closes everything for most accounts but not for `0xecca…7000`.
If whole-position liquidation is the intended design, document it on the Margin & Liquidations page with the real cost,
and drop "an account that comes back just above maintenance margin pays nothing", since a single-market account can then
never come back just above.

## Environment
- Somnia Tokyo testnet (Hideki, chain 50383), RPC https://api.hideki2.infra.testnet.somnia.network, indexer
  https://hideki-dev.smk.somnia.host/v1/graphql; MarginBank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394`, LiquidationEngine
  `0xA66d3C24Ad4a389d863846905D8173e1017e9F4D` (implementation `0xf46c4966…702d` throughout the period checked)
- Node 22.22 with viem 2.57.7; read-only (eth_call at historical blocks and GraphQL reads), no transactions
