#!/usr/bin/env python3
"""Read-only. Event Contract void policies per network (indexer Market.voidPolicy: 0 = UNIFORM 0.5/0.5,
2 = CLOB_SNAPSHOT, the split by the market's closing price), the newest markets' policy, and every voided market
with its stored payout vector and redemptions. Python 3 stdlib only; GraphQL reads only.
usage: python3 void_policy_check.py [mainnet|tokyo]"""
import json, sys, urllib.request, datetime
HOSTS = {"mainnet": "https://prd.smk.somnia.host/v1/graphql", "tokyo": "https://hideki-dev.smk.somnia.host/v1/graphql"}
net = sys.argv[1] if len(sys.argv) > 1 else "mainnet"
def q(s):
    req = urllib.request.Request(HOSTS[net], data=json.dumps({"query": s}).encode(), headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.load(r)
    if "errors" in d: raise SystemExit(d["errors"])
    return d["data"]
ts = lambda t: datetime.datetime.fromtimestamp(int(t), datetime.timezone.utc).strftime("%Y-%m-%d %H:%M") if t else "-"
print(f"# {net} ({HOSTS[net]}) at {datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')}")
d = q('{ p0: Market_aggregate(where: {marketType: {_eq: BINARY}, voidPolicy: {_eq: 0}}) { aggregate { count } } p2: Market_aggregate(where: {marketType: {_eq: BINARY}, voidPolicy: {_eq: 2}}) { aggregate { count } } }')
print("binary markets by voidPolicy: 0 (UNIFORM) =", d["p0"]["aggregate"]["count"], " 2 (CLOB_SNAPSHOT) =", d["p2"]["aggregate"]["count"])
d = q('{ last0: Market(where: {marketType: {_eq: BINARY}, voidPolicy: {_eq: 0}}, limit: 1, order_by: {createdAtTimestamp: desc}) { createdAtTimestamp } first2: Market(where: {marketType: {_eq: BINARY}, voidPolicy: {_eq: 2}}, limit: 1, order_by: {createdAtTimestamp: asc}) { createdAtTimestamp } }')
print("last market created with voidPolicy 0:", ts(d["last0"][0]["createdAtTimestamp"]) if d["last0"] else "-", "| first with voidPolicy 2:", ts(d["first2"][0]["createdAtTimestamp"]) if d["first2"] else "-")
import time
since = int(time.time()) - 86400
d = q('{ p0: Market_aggregate(where: {marketType: {_eq: BINARY}, voidPolicy: {_eq: 0}, createdAtTimestamp: {_gte: "%d"}}) { aggregate { count } } p2: Market_aggregate(where: {marketType: {_eq: BINARY}, voidPolicy: {_eq: 2}, createdAtTimestamp: {_gte: "%d"}}) { aggregate { count } } }' % (since, since))
print("created in the last 24 h: voidPolicy 0 =", d["p0"]["aggregate"]["count"], " voidPolicy 2 =", d["p2"]["aggregate"]["count"])
d = q('{ Market(where: {marketType: {_eq: BINARY}}, limit: 6, order_by: {createdAtTimestamp: desc}) { marketId question voidPolicy createdAtTimestamp marketAddress } }')
print("\nnewest markets:")
for m in d["Market"]: print(f"  {ts(m['createdAtTimestamp'])} voidPolicy {m['voidPolicy']} {m['marketAddress']} \"{m['question']}\"")
d = q('{ Market(where: {marketType: {_eq: BINARY}, voided: {_eq: true}}, limit: 500, order_by: {resolvedAtTimestamp: asc}) { id marketId question voidPolicy payoutNumerators payoutDenominator resolvedAtTimestamp marketAddress tradeCount } }')
vm = d["Market"]
print(f"\nvoided markets: {len(vm)}; with a payout other than 0.5/0.5:")
for m in vm:
    if m["payoutNumerators"] and len(set(m["payoutNumerators"])) > 1:
        den = int(m["payoutDenominator"]); pn = [int(x) / den for x in m["payoutNumerators"]]
        r = q('{ RedemptionRecord(where: {market_id: {_eq: "%s"}}) { holder outcomeIdx amountBurned collateralOut txHash } }' % m["id"])["RedemptionRecord"]
        print(f"  {ts(m['resolvedAtTimestamp'])} voidPolicy {m['voidPolicy']} payout Up {pn[0]} / Down {pn[1]} trades {m['tradeCount']} {m['marketAddress']} \"{m['question']}\"")
        for x in r: print(f"      redeemed outcome {x['outcomeIdx']}: {int(x['amountBurned']) / 1e18} -> {int(x['collateralOut']) / 1e18} USDso by {x['holder']} tx {x['txHash']}")
