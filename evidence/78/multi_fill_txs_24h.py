#!/usr/bin/env python3
"""Mainnet spot fills over the last N hours (default 24), grouped by transaction shape: one fill, several fills in one
pool, or legs in two pools (SpotRouter). Python standard library only. usage: python3 multi_fill_txs_24h.py [hours]"""
import json, sys, time, collections, urllib.request
API, IDX = "https://api.dreamdex.io", "https://prd.smk.somnia.host/v1/graphql"
H = float(sys.argv[1]) if len(sys.argv) > 1 else 24
def gq(q):
    r = urllib.request.Request(IDX, json.dumps({"query": q}).encode(), {"content-type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=60))["data"]
mk = {m["contract"].lower(): m["symbol"] for m in json.load(urllib.request.urlopen(API + "/v0/markets", timeout=30))["markets"]}
now = int(time.time()); frm = now - int(H * 3600); rows = []
for pool in mk:
    off = 0
    while True:
        p = gq('{ Fill(where:{pool:{_eq:"%s"}, timestamp:{_gte:"%d", _lt:"%d"}}, order_by:[{timestamp:asc},{logIndex:asc}], limit:1000, offset:%d) { pool txHash } }' % (pool, frm, now, off))["Fill"]
        rows += p; off += 1000
        if len(p) < 1000: break
bytx = collections.defaultdict(list)
for r in rows: bytx[r["txHash"]].append(r)
shape = collections.Counter("two pools" if len({x["pool"] for x in v}) > 1 else ("several fills, one pool" if len(v) > 1 else "one fill") for v in bytx.values())
print(time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(frm)), "to", time.strftime("%H:%M UTC", time.gmtime(now)), f": {len(rows)} fills in {len(bytx)} transactions")
for k, v in shape.most_common(): print(f"  {k:25s} {v}")
print("  two-pool pairs:", collections.Counter(tuple(sorted({mk[x['pool']] for x in v})) for v in bytx.values() if len({x['pool'] for x in v}) > 1).most_common())
