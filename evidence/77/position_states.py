#!/usr/bin/env python3
"""A wallet's nonzero Event Contract positions on mainnet, by settlement state (indexer OutcomeBalance + Market).
Python standard library only. usage: python3 position_states.py <address>..."""
import json, sys, time, collections, urllib.request
IDX = "https://prd.smk.somnia.host/v1/graphql"
def gq(q):
    req = urllib.request.Request(IDX, json.dumps({"query": q}).encode(), {"content-type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))["data"]
now = int(time.time())
for a in sys.argv[1:]:
    rows = gq('{ OutcomeBalance(where:{account:{_eq:"%s"}, balance:{_gt:"0"}}, limit:1000) { outcomeIndex market { expiry winningOutcome voided } } }' % a.lower())["OutcomeBalance"]
    c = collections.Counter(); oldest = None
    for r in rows:
        m = r["market"]
        if m["voided"]: k = "voided (claimable)"
        elif m["winningOutcome"] is None: k = "not settled yet" if int(m["expiry"]) > now - 600 else "expired, unresolved"
        elif int(m["winningOutcome"]) == r["outcomeIndex"]: k = "settled, winning side (claimable)"
        else: k = "settled, losing side (pays 0, never claimable)"
        c[k] += 1
        if k.startswith("settled, winning"): oldest = min(oldest or 10**12, int(m["expiry"]))
    print(a, len(rows), "nonzero positions:", dict(c))
    if oldest: print("   oldest unclaimed winning window expired", time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(oldest)))
