#!/usr/bin/env python3
"""Every on-chain spot fill in a capture's time window (indexer Fill rows) against what the public feed sent as
trades:update. A fill counts as delivered when an unused trades:update has the same symbol, price and quantity and a
timestamp within 3 s. Fills are grouped by transaction shape: one fill; several fills in one pool; legs in two pools
(a SpotRouter swap). Then, per 1-minute bucket with a fill, the last ohlcv:update the feed sent vs GET /candles.
Python standard library only. usage: python3 ws_vs_fills.py <capture.jsonl> [mainnet|testnet]"""
import json, sys, datetime, collections, urllib.request
cap = sys.argv[1]; net = sys.argv[2] if len(sys.argv) > 2 else "mainnet"
API, IDX = {"mainnet": ("https://api.dreamdex.io", "https://prd.smk.somnia.host/v1/graphql"),
            "testnet": ("https://stg.api.dreamdex.io", "https://dev.smk.somnia.host/v1/graphql")}[net]
def get(u): return json.load(urllib.request.urlopen(u, timeout=30))
def gq(q):
    r = urllib.request.Request(IDX, json.dumps({"query": q}).encode(), {"content-type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=60))["data"]
hms = lambda t: datetime.datetime.fromtimestamp(t, datetime.UTC).strftime("%H:%M:%S")
msgs = [json.loads(l) for l in open(cap)]
t0, t1 = msgs[0]["t"] // 1000 + 5, msgs[-1]["t"] // 1000 - 5          # leave the edges out
mk = {m["contract"].lower(): m for m in get(API + "/v0/markets")["markets"] if m.get("kind") in (None, "spot")}
fills = []
for pool, m in mk.items():
    q = '{ Fill(where:{pool:{_eq:"%s"}, timestamp:{_gte:"%d", _lte:"%d"}}, order_by:[{blockNumber:asc},{logIndex:asc}], limit:1000) { fillPrice quantity timestamp txHash blockNumber logIndex takerIsBid } }' % (pool, t0, t1)
    for f in gq(q)["Fill"]:
        f.update(symbol=m["symbol"], px=int(f["fillPrice"]) / 1e18, qty=int(f["quantity"]) / 10 ** m["baseDecimals"]); fills.append(f)
bytx = collections.defaultdict(list)
for f in fills: bytx[f["txHash"]].append(f)
def shape(tx):
    v = bytx[tx]
    return "two pools" if len({x["symbol"] for x in v}) > 1 else ("several fills" if len(v) > 1 else "one fill")
ws = [dict(x["m"]["trade"], symbol=x["m"]["symbol"], used=False) for x in msgs if x["m"].get("channel") == "trades" and x["m"].get("type") == "update"]
res = collections.Counter(); missed = []
for f in sorted(fills, key=lambda f: (int(f["blockNumber"]), f["logIndex"])):
    hit = next((w for w in ws if not w["used"] and w["symbol"] == f["symbol"] and abs(float(w["price"]) - f["px"]) < 1e-9 * max(1, f["px"])
                and abs(float(w["quantity"]) - f["qty"]) < 1e-12 * max(1, f["qty"]) and abs(w["timestamp"] / 1000 - int(f["timestamp"])) <= 3), None)
    if hit: hit["used"] = True
    else: missed.append(f)
    res[(shape(f["txHash"]), "delivered" if hit else "NOT SENT")] += 1
    print(f"{hms(int(f['timestamp']))} {f['symbol']:13s} {f['px']:<10g} {f['qty']:<12g} {'buy ' if f['takerIsBid'] else 'sell'} {shape(f['txHash']):13s} block {f['blockNumber']} log {f['logIndex']:3d} tx {f['txHash']}  {'feed id ' + hit['id'] if hit else 'NOT SENT ON THE FEED'}")
extra = [w for w in ws if not w["used"] and t0 * 1000 <= w["timestamp"] <= t1 * 1000]
print(f"\nwindow {hms(t0)}-{hms(t1)} UTC: {len(fills)} fills in {len(bytx)} txs; feed trades in the window with no matching fill: {len(extra)}")
for k, v in sorted(res.items()): print("  ", k, v)
last = {}
for x in msgs:
    m = x["m"]
    if m.get("channel") == "ohlcv" and m.get("type") == "update": last[(m["symbol"], m["candle"]["timestamp"])] = m["candle"]
print("\n1m candles with a fill, last ohlcv:update from the feed vs GET /v0/markets/{symbol}/candles:")
for s in sorted({f["symbol"] for f in fills}):
    rc = {c["timestamp"]: c for c in get(f"{API}/v0/markets/{s}/candles?interval=1m&limit=200")["candles"]}
    for b in sorted({(int(f["timestamp"]) // 60) * 60000 for f in fills if f["symbol"] == s}):
        w, r = last.get((s, b)), rc.get(b)
        ws_txt = f"vol {w['volume']} o {w['open']} h {w['high']} l {w['low']} c {w['close']}" if w else "no update"
        r_txt = f"vol {r['volume']} o {r['open']} h {r['high']} l {r['low']} c {r['close']}" if r else "none"
        flag = "" if (w and r and w["volume"] == r["volume"] and w["high"] == r["high"] and w["low"] == r["low"]) else "   <-- differs"
        print(f"  {s:13s} {hms(b // 1000)[:5]}  feed {ws_txt:45s} REST {r_txt}{flag}")
