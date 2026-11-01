"""Repro for DreamFly v1.0.0 (d33b722) perp order mirror. Copy into the repo's tests/ folder, then: pytest -q -s tests/test_dreamfly_perp_mirror.py
It uses the project's own classes and its own FakeAccount test double. Nothing is sent to any network."""
import sys
from pathlib import Path
import pytest
from flybot.live.perp_execution import PerpMirror
from flybot.live.perp_live import PerpFly
from flybot.live.settings import Settings
from flybot.mb.graph import load_graph
from flybot.perp import PerpCosts, PerpPaperEpisode, rows_to_frame
from tests.test_perp import rows
from tests.test_perp_execution import FakeAccount, PAPER, episode, frame, mirror, places, settings

MB_DIR = Path(__file__).resolve().parents[1] / "data" / "mb"

class MissedClose(FakeAccount):
    """The IOC goes out, but nothing (or only part) is resting inside the 20 bps buffer: the executor's real reply shape."""
    filled_frac = 0.0
    def close(self, symbol):
        self.calls.append(("close",))
        got = abs(self.pos) * self.filled_frac
        self.pos = self.pos - got if self.pos > 0 else self.pos + got
        return {"sent": True, "filled": got, "left": abs(self.pos), "no_fill": got == 0}

def test_guard_flatten_that_fills_nothing_is_not_tried_again():
    ex, df = MissedClose(), frame()
    m = mirror(ex)
    ep = episode("p_trend", df, trend_dir=1)
    m.on_start(ep)
    held = ex.pos
    assert held > 0
    ep.pos, ep.guarded = 0.0, True            # the paper guard fired
    m.on_row(ep)                              # first attempt: IOC sent, 0 filled
    for _ in range(59):                       # the rest of the hour-long episode, one row per minute
        m.on_row(ep)
    closes = [c for c in ex.calls if c == ("close",)]
    print("closes sent over 60 rows:", len(closes), "position still open:", ex.pos, "last_target:", m.last_target)
    assert len(closes) == 1 and ex.pos == held and m.last_target == 0.0

def test_partial_close_is_not_finished_either():
    ex, df = MissedClose(), frame()
    ex.filled_frac = 0.25
    m = mirror(ex)
    ep = episode("p_carry", frame(funding=0.0005))
    m.on_start(ep)
    held = ex.pos
    ep.pos, ep.guarded = 0.0, True
    for _ in range(60):
        m.on_row(ep)
    print("carry held", held, "after 60 rows", ex.pos, "closes", len([c for c in ex.calls if c == ("close",)]))
    assert ex.pos == pytest.approx(held * 0.75)

def fly(tmp_path, ex):
    f = PerpFly("BTC/USDso:USDso", load_graph(MB_DIR), tmp_path, PerpCosts(stake=1000.0), {}, seed=0, episode_min=60)
    f.mirror = PerpMirror(ex, f.symbol, PerpCosts(stake=1000.0).stake, PerpCosts(stake=1000.0).leverage, settings(), f.log)
    return f

def test_kill_file_leaves_a_paying_carry_position_open(tmp_path):
    ex = FakeAccount()
    f = fly(tmp_path, ex)
    rs = rows(200, funding=0.0005)
    for r in rs[:40]:                         # warm the features
        f.mirror, keep = None, f.mirror
        f.rows.append(r); f.rows = f.rows[-600:]
        f.mirror = keep
    f.frame = rows_to_frame(f.rows)
    # a p_carry episode is running: the same object the fly builds in decide() after choosing the arm
    f.episode = PerpPaperEpisode("p_carry", f.costs, {})
    cur = f.frame.iloc[-1]
    f.episode.start(cur, 0)
    f.episode_start = int(cur["timestamp"])
    f.mirror.on_start(f.episode)
    held = ex.pos
    assert held != 0.0
    # state/live/KILL exists: the runner calls on_row(row, kill=True) for every new tape row
    for r in rs[40:45]:
        f.on_row(r, kill=True)
    print("KILL requested. episode:", f.episode, "open_pos (paper):", f.open_pos, "account position:", ex.pos, "calls:", ex.calls)
    assert f.episode is None                  # the fly stopped: no episode, no mirror calls from now on
    assert ex.pos == held                     # and the account still holds the whole position
    assert ("close",) not in ex.calls


def test_daily_stop_reads_the_equity_from_before_the_episode_that_lost(tmp_path):
    from flybot.live.execution import WalletLedger
    ex = FakeAccount(); ex.eq = 100.0
    f = fly(tmp_path, ex)
    ledger = WalletLedger(None, perps=ex)
    ledger.update_perps()                     # the baseline, as Runner._attach_perp takes it
    f.day_loss = lambda: ledger.day_pnl       # as Runner.perp_fly wires it for a live run
    f.daily_loss_stop = 50.0
    rs = rows(200, funding=0.0005)
    f.rows = rs[:40]; f.frame = rows_to_frame(f.rows)
    f.episode = PerpPaperEpisode("p_trend", f.costs, {})
    cur = f.frame.iloc[-1]
    f.episode.start(cur, 1)
    f.episode_start = int(cur["timestamp"])
    f.mirror.on_start(f.episode)
    decisions = []
    orig = f.decide
    f.decide = lambda c: (decisions.append(ledger.day_pnl), orig(c))[1]
    ex.eq = 40.0                              # the episode lost 60 USDso, past the 50 USDso stop
    done = None
    for r in rs[40:110]:
        done = f.on_row(r) or done
        if done:
            ledger.update_perps()             # what Runner.feed_tapes does, after on_row has returned
            break
    print("episode ended; day P&L the decision saw:", decisions[-1], "| day P&L one call later:", ledger.day_pnl,
          "| guard_flat:", f.last_decision.get("guard_flat"), "| next arm:", f.episode.arm if f.episode else None)
    assert decisions[-1] == 0.0 and ledger.day_pnl == -60.0
    assert f.last_decision["guard_flat"] is False
