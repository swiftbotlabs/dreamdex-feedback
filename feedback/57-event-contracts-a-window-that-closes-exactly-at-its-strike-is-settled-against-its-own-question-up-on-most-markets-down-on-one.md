# Event Contracts: a window that closes exactly at its strike settles inconsistently, and mostly against the market's own question. The oracle records "at or above <strike + 0.005>" and the app asks "settle above $<strike>?", yet 29 mainnet and 16 Tokyo ties paid Up (one with an outside trader's Down stake), while 5 mainnet and 1 Tokyo identical ties paid Down
Severity: critical
Area: contracts | app | docs

> **Summary.** Most rolling Up/Down markets store their line twice, and the two copies differ by half a cent:
> - the **on-chain strike** is the window's opening price at 2 decimals (`2397.25`), and the payout compares the close
>   against it, at or above → Up;
> - the **oracle's recorded question**, the text the support FAQ calls the receipt, says
>   `"Will ETH/USDC's price be at or above 2397.255 at unix time 1792749000?"`, i.e. strike + 0.005, which a 2-decimal
>   close can only meet by being strictly above the strike.
>
> The app adds a third wording: the ticket asks **"Will ETH settle above $2,313.46 at 20:30 UTC?"** (strictly above), while
> the info tooltip on the same ticket says **"Up wins if the closing price is at or above it."** The docs give both rules too.
>
> All of this only matters when the close **equals** the strike, and that happens. On Tokyo, 21 windows closed exactly at their strike: **20 paid Up, 1 paid Down**,
> although all 21 have the same shape (2-decimal close == strike, question line = strike + 0.005). On **Somnia mainnet**,
> 40 windows closed exactly at their strike: **35 paid Up, 5 paid Down**, and 29 of the Up ones contradict their own question.
> One of the mainnet ties had an outside trader: `0x4e3e…3852` bought 9.652 Down for 4.845304 USDso six seconds before expiry. The close was 2496.33, the question asked "at or above 2496.335", and the app would have asked "settle above
> $2,496.33?". The market paid Up, and the 9.652 Down tokens are still in that wallet, worth nothing.
>
> **Checked 2026-10-29 between 20:20 and 20:35 UTC.** Every resolved Up/Down market on both networks was read from the indexers,
> and four markets were re-read on chain (payout vector, the oracle's answer event with its question text, the trader's token
> balance). The two runs of the check gave the same list. Evidence: `evidence/57/`.

## Steps to reproduce
1. List every resolved Up/Down market whose outcome contradicts its own question, and every window that closed exactly at
   its strike, with the side that won. The script is read-only (GraphQL reads, Python 3 standard library):
   ```sh
   python3 evidence/57/ec_tie_check.py tokyo     # Somnia Tokyo testnet indexer, hideki-dev.smk.somnia.host
   python3 evidence/57/ec_tie_check.py mainnet   # Somnia mainnet indexer, prd.smk.somnia.host
   ```
   For each oracle answer it takes the line from the question (`at or above X at unix time T`), the close (`numericValue`,
   2 decimals), the outcome (`outcomeIdx` 0 = Up/YES, 1 = Down/NO) and the market's `strike`.
2. Re-read the markets on chain: the market's `payoutNumerators()`, the oracle's answer event (it carries the outcome, the
   value and the question text), and for the mainnet trade the trader's outcome-token balances:
   ```sh
   npm install   # viem 2.57.7, pinned in package.json
   # mainnet 0x…9de4: ETH 5m, expiry 2026-10-10 05:45 UTC, one outside trade
   node evidence/57/ec_tie_onchain.mjs https://api.infra.mainnet.somnia.network \
     0x7b952b91b327c1609e9a32b2a446ddf5edda8395 \
     0xbb7fe9c4351bdf0dc145e0fd4ab3aae199edad6511900a64830fede16c457eab \
     35436498462159485898222428027678165603911703749273434408126325549687471014529 \
     0x24f4636d72c4816aa5ab3ef748b476a976fb552fa8ae487b370acd0f94a4a62d \
     0x4e3e5c8ea20783dc7af53af21dfeb86a7cd13852 \
     5372558120660603433337030817624564224127084169917863731248380491476737 \
     5372558120660603433337030817624564224127084169917863731248380491476736
   # Tokyo 0x…2617 (tie, Up won) and 0x…26d1 (tie, Down won), five hours apart on 2026-10-11
   node evidence/57/ec_tie_onchain.mjs https://api.hideki2.infra.testnet.somnia.network \
     0xd05452eee05b6f24e3a4f1e45b1b72896f03f6f9 0x076fb4c36679bb0ea8727db05384caafa394d66a48cda445f75e3ef52a6e9893 \
     36057844165646952027565275991391489960020966204043787697584497318415681951828
   node evidence/57/ec_tie_onchain.mjs https://api.hideki2.infra.testnet.somnia.network \
     0x1c1af67cacaa7b95f09838f704f9a31e428aae61 0x1c301ea5fdd33a4d1b6fc6bce3538ba64b130096fa4ded9bcaf72ac7cce818a9 \
     6615429806980880100284284292811105156291805006223572918372092812061452535895
   ```
3. Open any live market, e.g. https://app.dreamdex.io/event-contracts/WETH:USDso/15m (mainnet, logged out) or
   https://app.testnet.dreamdex.io/event-contracts/tokyo/WBTC:USDso/15m. The header asks "Will ETH settle **above**
   $2,313.46 at 20:30 UTC?". Hover **STRIKE**: "The price this market settles against, fixed when the market was created. Up
   wins if the closing price is **at or above** it." (`evidence/57/app_mainnet_eth15m_ticket_above_vs_tooltip_at_or_above_2026-10-29T2024Z.png`
   shows both on one screen.)

## Expected
One tie rule, applied on every market and stated the same way everywhere:
- the settlement (oracle answer + payout vector),
- the oracle's recorded question, which the FAQ "My Event Contract settled against me" sends traders to as "the receipt",
- the app's ticket question and its Strike tooltip,
- the docs.

Two identical ties (2-decimal close == strike) must never settle on opposite sides.

## Actual
**The texts disagree on a tie** (close == strike):

| Source | Wording | A tie resolves |
|---|---|---|
| Oracle's recorded question (on chain, in the answer event) | "at or above **2397.255**" (strike + 0.005) | Down |
| App ticket header | "Will ETH settle **above** $2,313.46 at 20:30 UTC?" | Down |
| App STRIKE tooltip | "Up wins if the closing price is **at or above** it" | Up |
| Docs, Event Contracts / Settlement & Voids / FAQ | "if the asset closes the window at or above its opening price, Up wins" | Up |
| Docs, FAQ "settled against me" | "a fixed-strike market resolves Up only if the close is *above* the strike" (the tooltip says the strike is "fixed when the market was created") | Down |
| Payout vector on chain | Tokyo: 20 of 21 ties `[1e7, 0]`, 1 tie `[0, 1e7]`. Mainnet: 35 of 40 ties `[1e7, 0]`, 5 ties `[0, 1e7]` | both |

**Ties that settled on opposite sides** (Tokyo, both BTC, same day, same question shape; `evidence/57/ec_tie_onchain_2026-10-29T2028Z.txt`):

| Market | Expiry (UTC) | Oracle question (as recorded on chain) | Close (oracle value) | Payout vector | Winner |
|---|---|---|---|---|---|
| `0x…2617` (`0xd054…f6f9`) | 2026-10-11 02:40 | "at or above 83018.575" | 83018.57 | `[10000000, 0]` | **Up** |
| `0x…26d1` (`0x1c1a…ae61`) | 2026-10-11 07:50 | "at or above 82945.555" | 82945.55 | `[0, 10000000]` | **Down** |

**The mainnet tie with an outside trader** (`0x…9de4`, ETH 5m, expiry 2026-10-10 05:45:00 UTC, market `0x7b95…8395`):
- Window opened at 2496.33 (strike `249633`); the oracle recorded the question "Will ETH/USDC's price be at or above
  **2496.335** at unix time 1791611100?".
- 05:44:54 UTC, tx `0x24f4636d…a62d`: `0x4e3e5c8e…3852` bought **9.652 Down** at 0.502 (indexer `Fill` `MINT_A_PAIR`,
  taker BUY_NO, maker BUY_YES at 0.498). On chain it paid **4.999736 USDso** to the pool and got **0.154432** back, net
  **4.845304 USDso** (`evidence/57/ec_fill_transfers_2026-10-29T2031Z.txt`).
- Oracle answer tx `0xbb7fe9c4…eab` (block 434,572,500): outcome **0 (Up)**, value **249633 = 2496.33**, question text
  "at or above 2496.335".
- Market `payoutNumerators()` = `[10000000, 0]`, `isResolved` true. `balanceOf(0x4e3e…3852, noTokenId)` = **9.652**,
  unredeemed and worth 0. Wallet `0xd251…615e`, which redeemed both sides of all 29 contradicting mainnet markets (the
  seeding wallet), redeemed **322.152** Up for 322.152 USDso here and 312.5 Down for 0: the extra 9.652 Up is the size of
  the trader's Down purchase.

**How often:** Tokyo: 16,107 answers checked, 16 outcomes contradict their question, 21 ties (20 Up, 1 Down).
Mainnet: 23,275 answers checked, 29 outcomes contradict their question, 40 ties (35 Up, 5 Down; the 5 Down ties have the
same x.xx5 question shape as the 29 contradicting Up ones, e.g. "at or above 2508.455", close 2508.45, 2026-10-11 02:00 UTC). All the contradicting
markets are listed with their answer tx in the `ec_tie_check_*` outputs. Ties are rare (about 0.1–0.2 % of windows), but
each one settles real stakes on mainnet, and nothing the trader can read tells them which way it will go.

**Where the half cent comes from:** in the windows above the question's line is the previous window's 2-decimal close
plus 0.005. For example, Tokyo ETH window 2026-10-23 09:45–09:50 opened at 2397.25 (oracle value at 1792748700) and its
question says 2397.255; the 09:40–09:45 window opened at 2392.51 and says 2392.515. So the question generator writes a
strictly-above line, while the strike and the payout use at-or-above. The one Down tie shows that at least one code
path (or one oracle version) did honour the question's line.

## Evidence
- `evidence/57/ec_tie_check.py`; outputs `ec_tie_check_tokyo_2026-10-29T2026Z.txt`, `ec_tie_check_tokyo_2026-10-29T2032Z.txt`
  (second run: the same 16 markets and 21 ties; 4 newer answers) and `ec_tie_check_mainnet_2026-10-29T2028Z.txt`: every
  contradicting market and every tie with its question, close, winner, market id and answer tx.
- `evidence/57/ec_fill_transfers.mjs`, output `ec_fill_transfers_2026-10-29T2031Z.txt`: the USDso the mainnet trader paid.
- `evidence/57/ec_tie_onchain.mjs`, output `ec_tie_onchain_2026-10-29T2028Z.txt`: on-chain payout vectors, the oracle answer
  events (outcome, value, recorded question) for mainnet `0x…9de4` and Tokyo `0x…2617`, `0x…26d1`, `0x…47b8`, and the
  trader's token balances.
- `evidence/57/app_mainnet_eth15m_ticket_above_vs_tooltip_at_or_above_2026-10-29T2024Z.png`: mainnet ticket, logged out:
  header "settle above $2,313.46" next to the open STRIKE tooltip "at or above it".
- `evidence/57/app_tokyo_btc5m_ticket_2026-10-29T2021Z.png`: Tokyo ticket, "Will BTC settle above $80,317.32 at 20:25 UTC?".
- Docs (`https://app.dreamdex.io/llms-full.txt`, unchanged since 2026-10-29): Event Contracts ("at or above its opening
  price, Up wins"), Settlement & Voids (same), FAQ "My Event Contract settled against me" ("Settlement price at or above
  the opening price: Up wins" and "a fixed-strike market resolves Up only if the close is *above* the strike").

## Suggested fix
1. Pick the tie rule and make the oracle compare against exactly the number the question states. If ties are Down
   (strictly above, which the question generator and the ticket header already say), store the strike so that a close
   equal to the opening price fails it, e.g. compare `close > open`, or keep 3 decimals. If ties are Up, write the
   question as "at or above <opening price>" without the 0.005.
2. Find why `0x…26d1` settled Down while 20 identical Tokyo ties settled Up (rounding of `x.xx5 × 100` when the threshold
   is derived from the question text would do it: `82945.555 × 100` is `8294555.4999…` in binary floating point,
   `83018.575 × 100` is `8301857.5`).
3. Make the ticket header, the Strike tooltip and the docs use the same words as the oracle question.
4. For the mainnet ties already settled (40 markets, list in the evidence), check whether any other outside positions were
   settled against a rule the trader was shown, as `0x4e3e…3852`'s was. By the indexer only `0x…9de4` had a trade.

## Environment
- Somnia mainnet (chain 5031, RPC https://api.infra.mainnet.somnia.network, indexer https://prd.smk.somnia.host/v1/graphql)
  and Somnia Tokyo testnet (Hideki, chain 50383, RPC https://api.hideki2.infra.testnet.somnia.network, indexer
  https://hideki-dev.smk.somnia.host/v1/graphql)
- App: https://app.dreamdex.io and https://app.testnet.dreamdex.io as served 2026-10-29 20:20–20:25 UTC (deployment
  `dpl_CUpD5NJSpD617ntFvu77xKbfFu5H`), Chrome on Linux, 1600×786; mainnet page logged out
- Node 22.22 with viem 2.57.7; Python 3 (standard library only); read-only, no transactions sent
