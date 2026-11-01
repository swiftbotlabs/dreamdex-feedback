#!/usr/bin/env python3
"""Read-only. Do mainnet Event Contracts' oracle question ids exist on the oracle explorer the app and docs link to?
Finds the switch from numeric ids to hash ids by bisection on the market list, then asks the explorer's own GraphQL
(the endpoint its question page reads) for a sample on each side. Python 3 stdlib only.
"""
import datetime, json, urllib.request
IDX = "https://prd.smk.somnia.host/v1/graphql"
ORA = "https://prd.oracle.somnia.host/v1/graphql"
def post(url, s):
    r = urllib.request.Request(url, data=json.dumps({"query": s}).encode(), headers={"content-type": "application/json", "user-agent": "curl/8"})
    with urllib.request.urlopen(r, timeout=90) as f:
        return json.load(f)["data"]
total = post(IDX, '{ Market_aggregate(where: {marketType: {_eq: BINARY}}) { aggregate { count } } }')["Market_aggregate"]["aggregate"]["count"]
def at(off):
    return post(IDX, '{ Market(where: {marketType: {_eq: BINARY}}, limit: 1, offset: %d, order_by: [{expiry: asc}, {id: asc}]) { marketId expiry oracleQuestionId question } }' % off)["Market"][0]
lo, hi = 0, total - 1
while hi - lo > 1:
    mid = (lo + hi) // 2
    if len(at(mid)["oracleQuestionId"] or "") > 12: hi = mid
    else: lo = mid
a, b = at(lo), at(hi)
t = lambda m: datetime.datetime.fromtimestamp(int(m["expiry"]), datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
print("checked", datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"))
print(f"mainnet Up/Down markets: {total}")
print(f"last numeric id:  market {a['marketId'][-6:]} expiry {t(a)} oracleQuestionId {a['oracleQuestionId']} question: {a['question']}")
print(f"first hash id:    market {b['marketId'][-6:]} expiry {t(b)} oracleQuestionId {b['oracleQuestionId']} question: {b['question']}")
print(f"markets with hash ids: {total - hi}")
def sample(off):
    return [m["oracleQuestionId"] for m in post(IDX, '{ Market(where: {marketType: {_eq: BINARY}}, limit: 200, offset: %d, order_by: [{expiry: asc}, {id: asc}]) { oracleQuestionId } }' % off)["Market"]]
for name, ids in (("200 numeric ids before the switch", sample(max(0, lo - 200))), ("200 hash ids just after the switch", sample(hi)), ("200 newest hash ids", sample(total - 200))):
    ids = sorted(set(ids))
    found = post(ORA, '{ Question(where: {id: {_in: %s}}) { id } }' % json.dumps(ids))["Question"]
    print(f"{name}: {len(ids)} distinct, found on the explorer: {len(found)}")
print("explorer totals:", post(ORA, '{ Question_aggregate { aggregate { count } } }')["Question_aggregate"]["aggregate"]["count"], "questions")
lastp = post(ORA, '{ Question(limit: 1, where: {questionText: {_ilike: "What is the price of %"}}, order_by: {resolutionTime: desc}) { id questionText resolutionTime } }')["Question"][0]
print("newest price question on the explorer:", lastp)
