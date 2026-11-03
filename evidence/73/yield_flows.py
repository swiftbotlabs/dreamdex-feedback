#!/usr/bin/env python3
# Read-only. Where the daily USDso maker-yield stream on Somnia mainnet has gone since 2026-10-13.
# Sources: the dreamDEX mainnet indexer (YieldPayout table) and the Somnia mainnet explorer's public token-transfer API.
# Usage: python3 evidence/73/yield_flows.py
import json, time, urllib.request, urllib.parse, collections, datetime
IDX = "https://prd.smk.somnia.host/v1/graphql"
EXP = "https://explorer.somnia.network/api/v2/addresses/{}/token-transfers"
FUNDER = "0x44d650a2ce847098c26e6e874a308f280817d4ac"       # receives the daily USDso mint, splits it
DISTRIBUTOR = "0xf1da6d99cf64c1ccf810c04cdcc844878d2510da"  # sends every YieldPayout row the indexer has
SAFE = "0xddc4f8a5664f91cda4abc13c80bbb8e4f2f6a280"         # Safe-type proxy contract
NAMES = {FUNDER: "funder 0x44D6", DISTRIBUTOR: "distributor 0xf1da", SAFE: "Safe 0xDDc4", "0x0000000000000000000000000000000000000000": "mint"}
def get(url, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, headers={"content-type": "application/json", "user-agent": "Mozilla/5.0"})
    return json.load(urllib.request.urlopen(req, timeout=60))
def day(ts): return datetime.datetime.fromtimestamp(int(ts), datetime.UTC).strftime("%Y-%m-%d")
# 1) YieldPayout rows per day, all time
rows, off = [], 0
while True:
    q = "{ YieldPayout(limit:2000, offset:%d, order_by:[{blockNumber:asc},{id:asc}]) { amount blockNumber maker timestamp txHash } }" % off
    page = get(IDX, {"query": q})["data"]["YieldPayout"]; rows += page; off += 2000
    if len(page) < 2000: break
per = collections.defaultdict(lambda: [0, 0.0, set()])
for r in rows:
    p = per[day(r["timestamp"])]; p[0] += 1; p[1] += int(r["amount"]) / 1e18; p[2].add(r["maker"])
print(f"== 1. Indexer YieldPayout: {len(rows)} rows, first {day(rows[0]['timestamp'])}, last {day(rows[-1]['timestamp'])} (block {rows[-1]['blockNumber']}, tx {rows[-1]['txHash']})")
print("   day          rows  payees   USDso")
for d in sorted(per):
    if d >= "2026-09-25": print(f"   {d}  {per[d][0]:5d}  {len(per[d][2]):6d}  {per[d][1]:9.4f}")
last = rows[-1]; print(f"   last row: {int(last['amount'])/1e18:.5f} USDso to {last['maker']} (= {NAMES.get(last['maker'], 'other')})")
# 2) the funder's USDso flows per day, from the explorer
def transfers(addr, since):
    items, params = [], None
    for _ in range(200):
        d = get(EXP.format(addr) + ("?" + urllib.parse.urlencode(params) if params else ""))
        items += d.get("items", []); params = d.get("next_page_params")
        if not params or (items and items[-1]["timestamp"] < since): break
        time.sleep(0.4)
    return [x for x in items if x["timestamp"] >= since]
fl = transfers(FUNDER, "2026-10-01")
tab = collections.defaultdict(lambda: collections.defaultdict(float))
for x in fl:
    v = int(x["total"]["value"]) / 10 ** int(x["total"]["decimals"]); f, t = x["from"]["hash"].lower(), x["to"]["hash"].lower(); d = x["timestamp"][:10]
    if t == FUNDER: tab[d]["minted in"] += v
    else: tab[d]["to " + NAMES.get(t, t[:10])] += v
print(f"\n== 2. Funder {FUNDER} USDso flows per day since 2026-10-01 ({len(fl)} transfers, all USDso: {all(x['token']['symbol']=='USDso' for x in fl)})")
for d in sorted(tab): print("   " + d + "  " + "; ".join(f"{k} {v:.4f}" for k, v in sorted(tab[d].items())))
tot = collections.defaultdict(float)
for d, kv in tab.items():
    if d >= "2026-10-14":
        for k, v in kv.items(): tot[k] += v
print("   totals 2026-10-14 .. now: " + "; ".join(f"{k} {v:.4f}" for k, v in sorted(tot.items())))
# 3) did the distributor or the Safe send anything since?
for a in (DISTRIBUTOR, SAFE):
    out = [x for x in transfers(a, "2026-10-13") if x["from"]["hash"].lower() == a]
    print(f"\n== 3. Outgoing token transfers from {NAMES[a]} since 2026-10-13: {len(out)}")
    for x in out: print(f"   {x['timestamp']} -> {x['to']['hash']} {int(x['total']['value'])/10**int(x['total']['decimals']):.5f} {x['token']['symbol']} tx {x['transaction_hash']}")
