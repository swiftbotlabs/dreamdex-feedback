# DreamFly: the daily loss stop decides the next episode on the equity from before the episode that just lost, so a perp run opens one more episode past the stop
Severity: normal
Area: SDK | docs

> **Summary.** `docs/live-trading.md`: "The daily loss stop counts the perps account's equity". The equity is read in `Runner.feed_tapes` **after** `PerpFly.on_row` returns, but `on_row` itself finishes the episode and
> immediately calls `decide()` for the next one in the same call. So `decide()` compares the stale reading with the stop. On a run with one perp market, the first loss past the limit is seen one whole episode late.
>
> **Checked 2026-11-01, 11:50 UTC** on DreamFly v1.0.0 (commit `d33b722`), offline with the project's own classes.

## Steps to reproduce
1. Install DreamFly at `d33b722` as in report 61 and copy `evidence/61/test_dreamfly_perp_mirror.py` into `tests/`.
2. `pytest -q -s tests/test_dreamfly_perp_mirror.py -k daily_stop`

The test wires `WalletLedger` and `PerpFly.day_loss` as `Runner` does. The account loses 60 USDso during an episode, against a 50 USDso stop.

## Expected
The episode that starts after the loss is forced flat (`guard_flat: true`).

## Actual
```
episode ended; day P&L the decision saw: 0.0 | day P&L one call later: -60.0 | guard_flat: False
```
The decision saw 0.0. The ledger read -60.0 one call later. Nothing forced that next episode flat, so it may open a position and hold it for its full 60 minutes.

Code: `flybot/live/perp_live.py` `on_row` (`done = self.finish(cur)`, then `self.decide(cur)`), and `flybot/live/runner.py` `feed_tapes` (`done = f.on_row(...)`, then `self.ledger.update_perps()`).

With several perp markets the first market to finish in a tape pass is the one affected, and later ones see the new reading.

## Evidence
`evidence/61/test_dreamfly_perp_mirror.py`, output `evidence/61/test_output_2026-11-01T1154Z.txt`.

## Suggested fix
Refresh the ledger between `finish` and `decide`: for example a callback on `PerpFly` run at the end of `finish`, or read `update_perps()` inside `day_loss`.

## Environment
- `somnia-chain/dreamdex-dreamfly` v1.0.0, commit `d33b7225d9de2bd4da98052b7feecc67cac59cef`
- Python 3.14, numpy 2.5.4, pandas 3.1.0; offline, no transactions sent
