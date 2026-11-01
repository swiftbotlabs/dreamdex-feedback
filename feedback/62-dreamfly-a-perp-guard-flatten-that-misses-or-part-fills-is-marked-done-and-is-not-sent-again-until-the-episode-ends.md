# DreamFly: a perp guard flatten that fills nothing, or only part, is marked done and is not sent again for the rest of the hour-long episode
Severity: normal
Area: SDK | docs

> **Summary.** The mirror retries a close only when it could not be **sent**. A close is a 20 bps taker order, and when it reaches the pool and
> fills nothing or only part, the executor answers `sent: true`. `_sync_position` then records the target as reached, so `on_row` sees
> `want == last_target` and never tries again. For `p_trend` and `p_carry`, the guard flatten is the only loss protection during an episode, and a missed
> one leaves the position open until the episode ends, up to 59 minutes later. The spot mirror's docs promise a second, wider attempt for the same case, and the perp
> code comment promises a retry only for "a close that could not be sent".
>
> **Checked 2026-11-01, 11:30–11:54 UTC** on DreamFly v1.0.0 (commit `d33b722`), offline with the project's own classes, plus the real
> `sent: true, filled: 0` reply from the sidecar on Hideki.

## Steps to reproduce
1. Install DreamFly at `d33b722` as in report 61 and copy `evidence/61/test_dreamfly_perp_mirror.py` into `tests/`.
2. `pytest -q -s tests/test_dreamfly_perp_mirror.py -k "guard_flatten or partial_close"`

The test double's `close` returns the reply shape of `perp/executor.mjs` for an IOC that reached the pool: `{"sent": true, "filled": 0, "left": <position>, "no_fill": true}`.

## Expected
A guard close stays owed until the account is flat, and is sent again on the next row, as the maker path already does (`ep.guarded` calls `_sync_position(ep, 0.0)` on every row).

## Actual
```
closes sent over 60 rows: 1 position still open: 0.39997485474616923 last_target: 0.0
carry held -0.39997485474616923 after 60 rows -0.2999811410596269 closes 1
```
- One close in 60 rows, and `last_target` already reads 0 while the account still holds the whole position.
- With a 25% partial fill, the other 75% stays open for all 60 rows.

From `flybot/live/perp_execution.py`:
```python
r = self.executor.close(self.symbol)
if r.get("left"):
    self.log("orders", {... "action": "close_left" ...})
if r.get("sent") or r.get("dry_run") or r.get("reason") == "flat":
    self.last_target = want
```
The `close_left` row is written and nothing acts on it. The same pattern affects a non-zero target: `self.last_target = want` runs after `place` whatever the reply, so an entry that was refused or
did not cross is never retried either, and the paper position and the account drift apart for the hour.

**How likely.** The sidecar's reply is real: on Hideki an IOC that did not cross returned `{"sent":true,"filled":0,"no_fill":true,"reason":"nothing crossed"}`
(`evidence/61/executor_live_round_trip_hideki_2026-11-01T1130Z.txt`). At today's books a 40 USDso default close fits inside 20 bps on all 21 markets (`evidence/61/book_depth_hideki_2026-11-01T1153Z.txt`), so the
miss needs a fast move between the book read and the order, a larger `LIVE_STAKE_USDSO`, or a thin moment. It is those moments that a guard exists for, which is why it is worth fixing, but this is why we rate it normal.

## Evidence
`evidence/61/test_dreamfly_perp_mirror.py`, output `evidence/61/test_output_2026-11-01T1154Z.txt`, plus the two files above.

## Suggested fix
Set `last_target = want` only when `left` is 0, or re-read the position in `on_row` while the episode is guarded, as the maker path does. After a miss, widen the buffer, as the spot mirror does.

## Environment
- `somnia-chain/dreamdex-dreamfly` v1.0.0, commit `d33b7225d9de2bd4da98052b7feecc67cac59cef`
- `@somnia-chain/markets-sdk` 0.32.1
- Somnia Tokyo testnet (Hideki, chain 50383), wallet `0x2A11e7388D1D2F9690f2636846d44b478f61bF08`
