#!/usr/bin/env python3
"""Read-only. For every resolved Up/Down Event Contract on one network, compare three things:
  - the line in the oracle's recorded question ("... at or above X at unix time T?"),
  - the market's on-chain strike (the indexer's Market.strike, 2 decimals),
  - the oracle's answer (numericValue, 2 decimals) and outcome (0 = Up/YES, 1 = Down/NO).
It lists every market whose outcome contradicts its own question text, and every tie
(close == strike) with the side that won. Python 3 stdlib only; GraphQL reads only.
usage: python3 ec_tie_check.py [mainnet|tokyo]
"""
import json, re, sys, urllib.request, collections, datetime
from decimal import Decimal
HOSTS = {"mainnet": "https://prd.smk.somnia.host/v1/graphql", "tokyo": "https://hideki-dev.smk.somnia.host/v1/graphql"}
net = sys.argv[1] if len(sys.argv) > 1 else "mainnet"
HOST = HOSTS[net]
def q(s):
    req = urllib.request.Request(HOST, data=json.dumps({"query": s}).encode(), headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.load(r)
    if "errors" in d: raise SystemExit(d["errors"])
    return d["data"]
def page(entity, fields, where=""):
    out, off = [], 0
    while True:
        b = q('{ %s(limit: 2000, offset: %d, order_by: {id: asc}%s) { %s } }' % (entity, off, where, fields))[entity]
        out += b
        if len(b) < 2000: return out
        off += 2000
print(f"# {net} ({HOST}) at {datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')}")
answers = page("OracleAnswer", "oracleQuestionId numericValue outcomeIdx outcomeLabel resolvedAt voided txHash")
markets = page("Market", "id marketId question strike oracleQuestionId tradeCount cumulativeQuoteVolume payoutNumerators marketAddress", ', where: {marketType: {_eq: BINARY}}')
byq = collections.defaultdict(list)
for m in markets: byq[m["oracleQuestionId"]].append(m)
pat = re.compile(r"at or above ([0-9.]+) at unix time (\d+)")
n = collections.Counter(); bad = []; ties = collections.Counter(); tie_rows = []
for a in answers:
    if a["voided"]: n["voided"] += 1; continue
    mt = pat.search(a["outcomeLabel"] or "")
    if not mt or a["numericValue"] is None: n["other question format"] += 1; continue
    n["checked"] += 1
    line = Decimal(mt.group(1)); close = Decimal(a["numericValue"]) / 100
    ms = byq.get(a["oracleQuestionId"], [])
    strike = Decimal(ms[0]["strike"]) / 100 if ms and ms[0]["strike"] else None
    up = a["outcomeIdx"] == 0
    if strike is not None and close == strike:
        ties["tie (close == on-chain strike), won by " + ("Up" if up else "Down")] += 1
        tie_rows.append((a, line, close, strike, ms[0]))
    if up != (close >= line):
        n["outcome contradicts the question text"] += 1
        bad.append((a, line, close, strike, ms[0] if ms else None))
print("answers", len(answers), "binary markets", len(markets), dict(n))
print("ties:", dict(ties))
print("\nevery tie (close == on-chain strike): time | question | close | winner | market id | answer tx")
for a, line, close, strike, m in sorted(tie_rows, key=lambda x: int(x[0]["resolvedAt"])):
    t = datetime.datetime.fromtimestamp(int(a["resolvedAt"]), datetime.timezone.utc).strftime("%Y-%m-%d %H:%M")
    print(f"{t} | \"{a['outcomeLabel']}\" | close {close} | {'Up' if a['outcomeIdx'] == 0 else 'Down'} | {m['marketId']} | {a['txHash']}")
print("\nmarkets whose outcome contradicts the question (line in question | close | on-chain strike | winner | trades, quote volume | market id | answer tx)")
for a, line, close, strike, m in sorted(bad, key=lambda x: int(x[0]["resolvedAt"])):
    t = datetime.datetime.fromtimestamp(int(a["resolvedAt"]), datetime.timezone.utc).strftime("%Y-%m-%d %H:%M")
    vol = Decimal(m["cumulativeQuoteVolume"] or 0) / 10**18 if m else 0
    print(f"{t} | \"{a['outcomeLabel']}\" | line {line} | close {close} | strike {strike} | {'Up' if a['outcomeIdx'] == 0 else 'Down'} | trades {m['tradeCount'] if m else '?'}, {vol} USDso | {m['marketId'] if m else '?'} | {a['txHash']}")
