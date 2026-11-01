#!/usr/bin/env python3
"""Read-only. Re-tests every "tie" listed by ec_tie_check.py against the full-precision on-chain price feed.
The oracle's numericValue and the market's strike are floored to 2 decimals; the feed's `spot` is not.
For each tie it prints the question's line, the feed's spot at T-1, T and T+1, the winner, and whether
`spot(T) >= line` gives the same winner. Python 3 stdlib only.
usage: python3 ec_ties_vs_price_feed.py mainnet evidence/57/ec_tie_check_mainnet_2026-10-29T2028Z.txt
       python3 ec_ties_vs_price_feed.py tokyo   evidence/57/ec_tie_check_tokyo_2026-10-29T2032Z.txt
"""
import json, re, sys, urllib.request
from decimal import Decimal as D
FEED = {"mainnet": "https://price-feed.prd.oracle.somnia.host/v1/graphql",
        "tokyo": "https://price-feed.hideki-dev.oracle.somnia.host/v1/graphql"}[sys.argv[1]]
def q(s):
    r = urllib.request.Request(FEED, data=json.dumps({"query": s}).encode(),
                               headers={"content-type": "application/json", "user-agent": "curl/8"})
    with urllib.request.urlopen(r, timeout=60) as f:
        return json.load(f)["data"]
rows = []
for l in open(sys.argv[2]):
    m = re.match(r"(\S+ \S+) \| \"Will (\w+)/USDC's price be at or above ([0-9.]+) at unix time (\d+)\?\" \| close ([0-9.]+) \| (Up|Down) \|", l)
    if m: rows.append(m.groups())
ok = alt = other = miss = 0
print("time | asset | line | 2-dp close | spot(T-1) | spot(T) | spot(T+1) | winner | verdict")
for t, asset, line, T, close, win in rows:
    T, line = int(T), D(line)
    pts = q('{ PricePoint(limit: 8, order_by: {blockNumber: asc}, where: {feed_id: {_eq: "%s/USDC"}, blockTimestamp: {_gte: "%d", _lte: "%d"}}) { blockTimestamp spot } }' % (asset, T - 1, T + 1))["PricePoint"]
    s = {}
    for p in pts: s[int(p["blockTimestamp"])] = D(p["spot"]) / 10**18
    a, b, c = s.get(T - 1), s.get(T), s.get(T + 1)
    if b is None: miss += 1; v = "no feed row at T"
    elif (b >= line) == (win == "Up"): ok += 1; v = "matches spot(T) vs line"
    elif a is not None and (a >= line) == (win == "Up"): alt += 1; v = "matches spot(T-1) vs line (row published before expiry)"
    else: other += 1; v = "matches neither row"
    print(f"{t} | {asset} | {line} | {close} | {a} | {b} | {c} | {win} | {v}")
print(f"ties {len(rows)}: spot(T) {ok}, spot(T-1) only {alt}, neither {other}, no feed row {miss}")
