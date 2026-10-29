# Read-only: does each Up/Down market's strike equal the oracle price at the window start, and how far is the question's line from it?
# usage: python3 ec_strike_vs_open.py mainnet|tokyo [since_unix]   (markets created since that time; default 1792000000)
import json, urllib.request, re, sys, collections, datetime
from decimal import Decimal
HOST = {"mainnet": "https://prd.smk.somnia.host/v1/graphql", "tokyo": "https://hideki-dev.smk.somnia.host/v1/graphql"}[sys.argv[1]]
def q(s):
    req = urllib.request.Request(HOST, data=json.dumps({"query": s}).encode(), headers={"content-type": "application/json"})
    d = json.load(urllib.request.urlopen(req, timeout=180))
    if "errors" in d: raise SystemExit(d["errors"])
    return d["data"]
def page(entity, fields, where=""):
    out, off = [], 0
    while True:
        b = q('{ %s(limit: 2000, offset: %d, order_by: {id: asc}%s) { %s } }' % (entity, off, where, fields))[entity]
        out += b
        if len(b) < 2000: return out
        off += 2000
since = sys.argv[2] if len(sys.argv) > 2 else "1792000000"
ans = page("OracleAnswer", "numericValue outcomeLabel resolvedAt voided", ', where: {resolvedAt: {_gte: "%s"}}' % since)
pat = re.compile(r"Will (\w+)/USDC's price be at or above ([0-9.]+) at unix time (\d+)")
price = {}  # (asset, T) -> value
for a in ans:
    m = pat.search(a["outcomeLabel"] or "")
    if m and a["numericValue"] and not a["voided"]: price[(m.group(1), int(m.group(3)))] = Decimal(a["numericValue"]) / 100
mk = page("Market", "marketId question strike intervalSec expiry asset tradingStart createdAtTimestamp", ', where: {marketType: {_eq: BINARY}, createdAtTimestamp: {_gte: "%s"}}' % since)
c = collections.Counter(); ex = []
for m in mk:
    mm = pat.search(m["question"] or "")
    if not mm or not m["strike"] or not m["intervalSec"]: c["skip"] += 1; continue
    asset, line, T = mm.group(1), Decimal(mm.group(2)), int(mm.group(3))
    start = T - int(m["intervalSec"])
    v = price.get((asset, start))
    if v is None: c["no answer at window start"] += 1; continue
    strike = Decimal(m["strike"]) / 100
    if strike == v: c["strike == open"] += 1
    else:
        c["strike != open"] += 1
        if len(ex) < 15: ex.append((datetime.datetime.fromtimestamp(T, datetime.timezone.utc).strftime("%m-%d %H:%M"), asset, m["intervalSec"], str(line), str(strike), str(v), m["marketId"][-5:]))
    if (line - v) not in (Decimal("0.005"), Decimal("0")): c["line - open = %s" % (line - v)] += 1
print(sys.argv[1], dict(c))
for e in ex: print(e)
