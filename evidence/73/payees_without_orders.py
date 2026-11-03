#!/usr/bin/env python3
# Read-only. For every YieldPayout payee since 2026-10-09 (mainnet indexer), does the indexer hold any Order placed by it?
import json, urllib.request, time
IDX = "https://prd.smk.somnia.host/v1/graphql"
def q(s): return json.load(urllib.request.urlopen(urllib.request.Request(IDX, data=json.dumps({"query": s}).encode(), headers={"content-type": "application/json"}), timeout=60))["data"]
rows = q('{ YieldPayout(where:{timestamp:{_gte:"1791504000"}}, limit:500) { maker amount timestamp } }')["YieldPayout"]
mk = sorted(set(r["maker"] for r in rows))
print(f"{len(rows)} YieldPayout rows since 2026-10-09 00:00 UTC, {len(mk)} payees")
for m in mk:
    has = bool(q('{ a: Order(where:{owner:{_eq:"%s"}}, limit:1) { id } }' % m)["a"])
    amt = sum(int(r["amount"]) for r in rows if r["maker"] == m) / 1e18
    print(f"{m}  {amt:10.4f} USDso  {'has orders' if has else 'NO Order rows'}"); time.sleep(0.2)
