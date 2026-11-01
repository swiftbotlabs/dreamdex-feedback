# DreamFly: the emergency KILL file leaves a paying carry position open and unmanaged, though the docs say it closes any position within a minute
Severity: major
Area: SDK | docs

> **Summary.** `docs/live-trading.md` gives one way to stop trading at once: "create the file `state/live/KILL`. Within a minute the
> runner cancels the resting quotes, closes any position and opens no new episode". For a perp market running the `p_carry` arm while funding
> still pays, it does not close the position. `PerpFly.on_row(row, kill=True)` ends the episode through the normal finish path. That path
> sets `keep_open` when the carry still pays, so `PerpMirror.finish` keeps the position. `kill=True` then blocks the next episode, and with
> no episode running the mirror is never called again. The position stays open on the account with no guard and no exit, for as long as
> the KILL file exists. This is the operator's emergency brake, on the one arm built to hold a position across hours.
>
> **Checked 2026-11-01, 11:30–11:54 UTC**, on `somnia-chain/dreamdex-dreamfly` v1.0.0 (commit `d33b722`, published 2026-10-30), using
> the project's own classes and its own `FakeAccount` test double. The order path itself was run for real on Hideki (below).

## Steps to reproduce
1. `git clone https://github.com/somnia-chain/dreamdex-dreamfly && cd dreamdex-dreamfly && git checkout d33b722`, install with `.[dev]`.
2. Copy `evidence/61/test_dreamfly_perp_mirror.py` into `tests/`.
3. `pytest -q -s tests/test_dreamfly_perp_mirror.py -k kill_file`

The test runs the real `PerpFly` and `PerpMirror`. It starts a `p_carry` episode with funding at +0.05% per 8 h, then feeds five rows with
`kill=True`, which is exactly what `Runner.feed_tapes` passes when `state/live/KILL` exists.

## Expected
After KILL the account is flat, as the docs say. A paying carry position is closed like any other.

## Actual
```
KILL requested. episode: None open_pos (paper): -20.02419233967078 account position: -0.4004838467934156
calls: [('place', 'short', 99.98, 0.400483847, 'market')]
```
The only order ever sent is the entry. No `close`. The fly has no episode, so no later row reaches the mirror.

The code path, `flybot/`:
- `live/perp_live.py` `on_row`: `if ts - self.episode_start >= self.episode_min * 60_000 or kill: done = self.finish(cur)`, then
  `if self.episode is None and not kill ...: self.decide(cur)`.
- `perp.py` `PerpPaperEpisode.finish`: `if self.arm == "p_carry" and self.pos != 0.0 and not self.guarded and np.sign(self.pos) == self._carry_side(row, entering=False): self.keep_open = True`.
  It does not know about `kill`.
- `live/perp_execution.py` `PerpMirror.finish`: `want = self._target(ep) if (ep is not None and ep.keep_open) else 0.0`, so the target stays the open position.
- `tests/` has no test that combines KILL with a carry.

## Evidence
- `evidence/61/test_dreamfly_perp_mirror.py`, output `evidence/61/test_output_2026-11-01T1154Z.txt`.
- `evidence/61/executor_live_round_trip_hideki_2026-11-01T1130Z.txt`: the same sidecar (`perp/executor.mjs`, SDK 0.32.1 from the repo's lockfile) on Hideki with our own key: a
  taker open (tx `0x605c670b…cfce7`, 0.004 ETH), the position read back, a `close` (tx `0xce60552b…747e`), and flat. So this is about the mirror's decision, not about the order path.
- Docs: `docs/live-trading.md`, "Before you go live", step 6.

## Suggested fix
Pass `kill` into the finish path. In `PerpFly.finish`, or in `PerpPaperEpisode.finish(row, keep=not kill)`, never set `keep_open` when a stop was requested. Add a test that
holds a paying carry, sets KILL and asserts the account is flat.

## Environment
- `somnia-chain/dreamdex-dreamfly` v1.0.0, commit `d33b7225d9de2bd4da98052b7feecc67cac59cef`
- `@somnia-chain/markets-sdk` 0.32.1, Python 3.14, numpy 2.5.4, pandas 3.1.0
- Network for the live order check: Somnia Tokyo testnet (Hideki, chain 50383), wallet `0x2A11e7388D1D2F9690f2636846d44b478f61bF08`
