#!/usr/bin/env python3
"""Read-only. Which price feed row does each mainnet Up/Down settlement use?
For every oracle answer in [since, until) it reads the feed rows around expiry T and compares the answer's 2-decimal
value with floor(spot, 2 dp) of each row, then compares the outcome with `spot(T) >= the question's line`.
Python 3 stdlib only. usage: python3 ec_settlement_rule.py 2026-10-30 2026-11-01
"""
import collections, datetime, json, re, sys, time, urllib.request
from decimal import Decimal as D
IDX = "https://prd.smk.somnia.host/v1/graphql"
FEED = "https://price-feed.prd.oracle.somnia.host/v1/graphql"
def post(url, s):
    for i in range(3):
        try:
            r = urllib.request.Request(url, data=json.dumps({"query": s}).encode(), headers={"content-type": "application/json", "user-agent": "curl/8"})
            with urllib.request.urlopen(r, timeout=120) as f:
                return json.load(f)["data"]
        except Exception as e:
            time.sleep(3)
    raise SystemExit("request failed")
ts = lambda d: int(datetime.datetime.fromisoformat(d).replace(tzinfo=datetime.timezone.utc).timestamp())
since, until = ts(sys.argv[1]), ts(sys.argv[2])
answers, off = [], 0
while True:
    b = post(IDX, '{ OracleAnswer(limit: 1000, offset: %d, order_by: {resolvedAt: asc}, where: {resolvedAt: {_gte: "%d", _lt: "%d"}}) { numericValue outcomeIdx outcomeLabel voided } }' % (off, since, until))["OracleAnswer"]
    answers += b
    if len(b) < 1000: break
    off += 1000
pat = re.compile(r"Will (\w+)/USDC's price be at or above ([0-9.]+) at unix time (\d+)")
keys = collections.defaultdict(list)
for a in answers:
    m = pat.search(a["outcomeLabel"] or "")
    if m and not a["voided"]: keys[(m.group(1), int(m.group(3)))].append((a, D(m.group(2))))
items = sorted(keys); rows = {}
for i in range(0, len(items), 30):
    chunk = items[i:i + 30]
    qs = " ".join('k%d: PricePoint(limit: 8, order_by: {blockNumber: asc}, where: {feed_id: {_eq: "%s/USDC"}, blockTimestamp: {_gte: "%d", _lte: "%d"}}) { blockTimestamp spot }' % (j, a, T - 2, T + 1) for j, (a, T) in enumerate(chunk))
    d = post(FEED, "{ %s }" % qs)
    for j, k in enumerate(chunk): rows[k] = d["k%d" % j]
    time.sleep(0.15)
c = collections.Counter()
for (asset, T), group in keys.items():
    r = {int(x["blockTimestamp"]): int(x["spot"]) for x in rows[(asset, T)]}
    if T not in r: c["no feed row at T"] += 1; continue
    a0 = group[0][0]; num = int(a0["numericValue"])
    fl = lambda t: None if t not in r else r[t] // 10**16
    if fl(T) == num and fl(T - 1) == num: c["answer == floor(spot) at T and at T-1 (same price)"] += 1
    elif fl(T) == num: c["answer == floor(spot) at T only"] += 1
    elif fl(T - 1) == num: c["answer == floor(spot) at T-1 only"] += 1
    else: c["answer matches neither row"] += 1
    for a, line in group:
        c["markets"] += 1
        if (D(r[T]) / 10**18 >= line) != (a["outcomeIdx"] == 0): c["markets whose outcome differs from spot(T) >= line"] += 1
print(f"# mainnet answers resolved {sys.argv[1]} to {sys.argv[2]}: {len(answers)}, distinct (asset, expiry) {len(keys)}")
for k, v in sorted(c.items()): print(f"{v:6d}  {k}")
