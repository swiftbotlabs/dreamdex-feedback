# Report 71: compare two saved /api/quests/me bodies (ours) and print scoring time, week-4 (2026-W45 / 2026-11-03) progress and the all-time volume counter.
import json, sys, datetime
f = lambda ms: datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
for path in sys.argv[1:]:
    d = json.load(open(path))
    wk = [p for p in d["progress"] if "W45" in p["questId"] or "2026-11-03" in p["questId"]]
    done = [c for c in d["completions"] if "W45" in c["questId"] or "2026-11-03" in c["questId"]]
    vol = next((p["observed"] for p in d["progress"] if p["questId"] == "perps-arena:onboard-first-trade"), None)
    print(f"{path}: scoredAt {f(d['enrolments'][0]['scoredAt'])} UTC | week-4 progress rows {len(wk)} | week-4 completions {len(done)} | all-time volume counter {vol}")
