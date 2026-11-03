# DreamFly (event contracts): the recorder reads a window's open only from `openingAnswer`, which is null for fixed-strike markets, and every Event Contract on mainnet, Shannon and Hideki has been fixed-strike since Oct 1. So `lead_bps`, `z` and `prob_up` are null in every book sample, the `ec_late` arm can never place a bet, and the fly sees `|z| = 0` on every decision
Severity: major
Area: bot kit (DreamFly v1.0.0) | SDK usage

> **Summary.** DreamFly's event-contract fly has two trading arms. `ec_late` is the "oracle-lead late taker": it bets on the
> favourite when the live oracle price is far enough from the window's threshold (`prob_up >= 0.95` and `|z| >= 1.6`).
> The recorder sidecar (`perp/ec_recorder.mjs`) computes that lead from the window's **open**, and it reads the open from one
> place only: `getMarketResolution(id).openingAnswer` (`readResolution()`, line 205, called by `readOpen()`, line 278).
> SDK 0.32.1 documents `openingAnswer` as "null for fixed-strike markets"; their threshold is `Market.strike`.
>
> Every live Event Contract market is fixed-strike: 6 of 6 on mainnet, 11 of 11 on Shannon, 4 of 4 on Hideki (the
> question reads "Will BTC/USDC's price be at or above 77084.75 at unix time …"). The last open-price
> ("closes at or above its opening price") market was created on **2026-10-01 06:55 UTC** on mainnet and
> 2026-09-30 18:16 UTC on Shannon. Hideki has never had one. DreamFly v1.0.0 shipped a month later.
>
> We ran DreamFly's own recorder for 6 minutes on mainnet and on Hideki. It learned **no** open price (0 `ec_openprice`
> rows), and **96 of 96** mainnet book samples carry the oracle price but `open`, `lead_bps`, `z` and `prob_up` are null.
> `plan_take("ec_late", …)` returns nothing when `prob_up` or `z` is null (`flybot/live/ec_live.py` line 71), so the
> arm can never bet on any network. Nothing logs an error. On every decision the fly is also handed `z_abs = 0`, because
> `features_of()` sets it to NaN and `selectors._vec()` runs `np.nan_to_num`.
>
> Two smaller items in the same module: a closing-price-split void is scored at 0.50 in the paper result (item 2), and the
> start-up and 6-hourly claim sweep throws for good once the wallet holds more than 200 nonzero positions, which DreamFly
> reaches by itself because it never redeems losing bets (item 3).
>
> **Checked 2026-11-03, 12:12–12:44 UTC**, read-only. The recorder ran without a key in a sandbox that can only reach
> `*.somnia.network` and `*.somnia.host`. Evidence: `evidence/77/`.

## Steps to reproduce
1. Which threshold mode the live markets use, and when the last open-price market was created (Python standard library):
   ```sh
   python3 evidence/77/strike_mode_by_network.py
   ```
2. What `getMarketResolution()` returns for every live window. DreamFly reads `openingAnswer` from this call
   (`@somnia-chain/markets-sdk` 0.32.1, DreamFly's lockfile pin, and viem):
   ```sh
   node evidence/77/opening_answer_check.mjs mainnet   # also: testnet, hideki
   ```
3. Run DreamFly's recorder unchanged, read-only, and summarise its tape:
   ```sh
   cd dreamfly/perp && npm ci --ignore-scripts
   node ec_recorder.mjs --network mainnet --duration 360 --out /tmp/tape
   python3 evidence/77/tape_summary.py /tmp/tape/*.jsonl
   ```
4. Optional. Put the window's strike (the question line) in place of the missing open and apply DreamFly's own
   `ec_late` rule (`RULE` defaults, `plan_take` and `seller_ok`) to the same book rows:
   ```sh
   python3 evidence/77/ec_late_with_strike.py /tmp/tape https://prd.smk.somnia.host/v1/graphql
   ```

## Expected
- `flybot/ec.py`: `ec_late` is the "Oracle-lead late taker with the recorded filters: favourite >= fav_min and |z| >= z_min".
  `EC_ARMS = ("ec_late", "ec_sharp", "flat")`. With `EC_ENABLED=true`, both trading arms are available on mainnet (USDso)
  and on the two test networks (`flybot/live/settings.py`: "NETWORK=testnet (Shannon) and hideki run spot, perps and event
  contracts; mainnet runs spot and event contracts").
- `perp/ec_recorder.mjs` `oracle.view()`: each book sample carries "oracle price, lead vs the open, sigma, z, model
  probability of Up".
- SDK 0.32.1, `getMarketResolution()`: "`openingAnswer` is the reference-question answer (the OPENING price it resolves
  against, **null for fixed-strike markets**)". SDK `markets.d.ts`, binary market row field `mode`: "`fixed` — the threshold was set at
  creation ('at or above 77036.65') and is `strike` itself. There is no reference question, so an opening price does not
  exist and never will."

## Actual
**1. The threshold is never learned, so `ec_late` is dead on all three networks**

| | mainnet | Shannon | Hideki |
|---|---|---|---|
| Live EC markets, fixed-strike / total | 6 / 6 | 11 / 11 | 4 / 4 |
| Last open-price market created | 2026-10-01 06:55 UTC | 2026-09-30 18:16 UTC | never |
| `getMarketResolution().openingAnswer` on live windows | null on 6 of 6 | null on 11 of 11 | null on 4 of 4 |

DreamFly's recorder tape (`dreamfly_ec_recorder_tape_*_2026-11-03T1212Z.jsonl`, summary `tape_summary_2026-11-03T1219Z.txt`):

| | mainnet (10 windows: 5m, 15m, 1h) | Hideki (6 windows: 5m, 10m) |
|---|---|---|
| `ec_openprice` rows (open learned) | 0 | 0 |
| book samples with `oracle` | 96 of 96 | 0 of 48 |
| book samples with `open` / `lead_bps` / `z` / `prob_up` | 0 / 0 / 0 / 0 of 96 | 0 / 0 / 0 / 0 of 48 |
| `ec_resolution` rows | 4, all `open: null` | 2, all `open: null` |

A second, 25-minute mainnet tape (12:18–12:43 UTC, 18 windows, 12 settled) gives the same result: 0 `ec_openprice` rows,
and 288 of 288 book samples with `oracle` but none with `open`, `lead_bps`, `z` or `prob_up`
(`tape_summary_25min_2026-11-03T1244Z.txt`).

A sample row: `ETH-226420-03NOV26-1215/USDso`, 48.5 s left, `"oracle": 2266.875, "open": null, "lead_bps": null,
"z": null, "prob_up": null`, while the market asks whether ETH is at or above 2264.205 and the Up bid is 0.986.

The code path:
- `readResolution()`: `out.open = num(res.openingAnswer)`. `readOpen()`: `t.open = scaleToSpot(r.open, spot)`, retried up to
  20 times per window, never with another source.
- `oracle.view()`: `lead_bps`, `z` and `prob_up` are filled only `if (tick && open > 0)`.
- `plan_take("ec_late")`: `if pu is None or z is None: return None`.
- `features_of()`: `"z_abs": abs(float(z)) if z is not None else np.nan`. `selectors._vec()` then turns it into 0.

The threshold is available. `Market.strike` (indexer, and the SDK's unified market row) holds it, e.g. `226420` for the ETH
window above. DreamFly's own `scaleToSpot()` would rescale that to 2264.20. The market symbol carries it too
(`ETH-226420-…`). The bot kit's `ec-oracle-follow` strategy already reads `m.info.strike` for exactly this case.

On Hideki, the price feed is missing as well (`"oracle": null` in every sample; the recorder notes that "the SDK ships no
price feed preset for it"). So `sigma` is null there, and `ec_late` could not fire even with the strike.

**2. (minor) A closing-price-split void is scored at 0.50 in the paper result**

`readResolution()` detects a void correctly. `ECFly._settle()` then values a voided window at `units * 0.5 - cost`, and the
module docs say "a void pays both sides 0.5". Mainnet markets created since 2026-09-16 use the closing-price split
(`voidPolicy` 2, see our report 59). The two such voids so far paid Up 0.9295 / Down 0.0705 and Up 0.746 / Down 0.254
(`getMarketResolution()` events: `voided: true`, `payoutNumerators ["9295000","705000"]`). The fly's reward for a voided
window would then be off by up to 0.43 per share. The real money path is fine: `ec_executor.mjs claim()` redeems both sides
of a voided market. Both voided markets had 0 trades, so this has not cost anyone yet.

**3. The restart sweep stops working once a wallet holds more than 200 nonzero positions, and a DreamFly wallet gets there by itself**

`ec_executor.mjs sweep()`, the catch-up that runs at start and every 6 hours "for anything a restart left behind", calls
`client.getClaimable(who)`. SDK 0.32.1 documents that this throws `IncompletePortfolioError` for any wallet with more than
200 nonzero positions, and that losing and open positions count (`docs/BINARY.md`: "use `getClaimablePage` … and follow
`nextOffset` even when `claims` is empty. Losing and open positions still count"). DreamFly never redeems a losing bet:
`claim()` redeems only the winning side and returns "nothing to claim" for a loser, so every lost window leaves a nonzero
position behind for good. After about 200 lost bets, every sweep throws. `NodeECExecutor._safe()` writes an error row and
returns nothing, and every later sweep fails the same way. The per-window claim keeps working, but a window it has
not paid within `GIVE_UP_AFTER_S` (3 days) is dropped from the list, and the sweep was the only backstop for it.

Two real mainnet wallets show the SDK behaviour (`get_claimable_200_limit_2026-11-03T1227Z.txt`; we don't know what
software they run):

| wallet | nonzero positions | settled, losing (never claimable) | settled, winning (unclaimed) | `getClaimable()` | `getClaimablePage(limit 200)` |
|---|---|---|---|---|---|
| `0x9d13…48d1` | 357 | 244 | 113, the oldest from 2026-07-22 | throws `IncompletePortfolioError` | 53 claims, `nextOffset` 200 |
| `0x6c66…01ee` | 566 | 566 | 0 | throws `IncompletePortfolioError` | 0 claims, `nextOffset` 200 |

## Evidence
- `evidence/77/strike_mode_by_network.py`, output `strike_mode_by_network_2026-11-03T1216Z.txt`
- `evidence/77/opening_answer_check.mjs`, output `opening_answer_check_2026-11-03T1216Z.txt` (all three networks)
- `evidence/77/dreamfly_ec_recorder_tape_mainnet_2026-11-03T1212Z.jsonl`, `…_hideki_…jsonl`: DreamFly v1.0.0
  `perp/ec_recorder.mjs`, unchanged, `--network mainnet|hideki --duration 360`; `tape_summary.py`, output
  `tape_summary_2026-11-03T1219Z.txt`
- `evidence/77/dreamfly_ec_recorder_tape_mainnet_25min_2026-11-03T1218Z.jsonl`, summary `tape_summary_25min_2026-11-03T1244Z.txt`
- `evidence/77/ec_late_with_strike.py`, output `ec_late_with_strike_25min_2026-11-03T1244Z.txt`: the counterfactual in step 4.
  On the 25-minute tape, with the strike as the open, the `ec_late` rule formed a plan in 10 of 12 settled windows; v1.0.0
  formed 0. In this half hour none of those plans had a seller under the cap at those seconds: near expiry the
  favourite's asks were mostly gone. So we can't say how often a fixed `ec_late` would fill. What we can say is that today
  it never reaches that check.
- `evidence/77/get_claimable_check.mjs` and `position_states.py`, output `get_claimable_200_limit_2026-11-03T1227Z.txt`

## Why it matters
Someone who sets `EC_ENABLED=true` and stakes USDso gets a fly in which one of its two event-contract strategies can never trade, and
nothing says so: no error and no log row. The fly can still pick `ec_late` for a window; it then does nothing, books a
result of 0 for that window and learns from it. The `ec_late` tests pass because their fixtures are
September book rows that still carry `lead_bps: 20.0`, `prob_up` and `z` (`tests/test_ec_live.py`, `book()`), from the
open-price era. Separately, a long-running EC bot loses its restart catch-up for claims once it has lost about 200 bets,
which is when unclaimed winnings are most likely to have piled up.

## Suggested fix
In `readOpen()`, take the window's threshold from the market row when there is no reference question. If
`binaryResolutionMode(strike)` is `"fixed"` (or `strike` is not `"0"`), use `strike`, rescaled with the existing
`scaleToSpot()`, or the question line, which has full precision (2264.205). Fall back to `openingAnswer` only for
reference-mode markets. Log a warning when a window reaches its act window with `open == null`. Add a fixed-strike
fixture to `test_ec_live.py`. For voids, value the window at the market's `payoutNumerators / payoutDenominator`,
not 0.5. In `sweep()`, page with `getClaimablePage()` until `nextOffset` is null, as the SDK guide shows, and redeem losing
positions for 0 when a window settles (or skip them in the count), so the wallet's position list stays small.

## Environment
- DreamFly 1.0.0 (`pyproject.toml` version; `perp/package-lock.json` pins `@somnia-chain/markets-sdk` 0.32.1). The recorder
  ran under Node 22.22.1 with markets-sdk 0.32.1 from npm (integrity checked) and viem 2.57.7.
- Somnia mainnet (5031), indexer `https://prd.smk.somnia.host/v1/graphql`; Shannon (50312) `https://dev.smk.somnia.host`;
  Hideki (50383) `https://hideki-dev.smk.somnia.host`
