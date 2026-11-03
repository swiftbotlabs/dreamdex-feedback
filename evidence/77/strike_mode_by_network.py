#!/usr/bin/env python3
"""Per network: live Event Contract markets by threshold mode, and when the last reference-mode
(open-price) market and the first fixed-strike market were created. Python standard library only.
`strike` == "0" is the protocol's reference-mode sentinel; anything else is a fixed strike."""
import json, time, datetime, urllib.request

HOSTS = {"mainnet": "https://prd.smk.somnia.host/v1/graphql",
         "shannon": "https://dev.smk.somnia.host/v1/graphql",
         "hideki": "https://hideki-dev.smk.somnia.host/v1/graphql"}

def gq(url, q):
    req = urllib.request.Request(url, json.dumps({"query": q}).encode(), {"content-type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))["data"]["Market"]

iso = lambda t: datetime.datetime.fromtimestamp(int(t), datetime.UTC).isoformat()
for name, url in HOSTS.items():
    now = int(time.time())
    live = gq(url, '{ Market(where:{marketType:{_eq:BINARY}, expiry:{_gt:"%d"}}, limit:200) { strike question } }' % now)
    fixed = sum(1 for r in live if r["strike"] not in (None, "0"))
    print(f"{name}: live markets {len(live)}, fixed-strike {fixed}, reference-mode {len(live) - fixed}")
    if live: print(f"   e.g. {live[0]['question']}  (strike field {live[0]['strike']})")
    ref = gq(url, '{ Market(where:{marketType:{_eq:BINARY}, strike:{_eq:"0"}}, order_by:{createdAtTimestamp:desc}, limit:1) { createdAtTimestamp question } }')
    fx = gq(url, '{ Market(where:{marketType:{_eq:BINARY}, strike:{_neq:"0"}}, order_by:{createdAtTimestamp:asc}, limit:1) { createdAtTimestamp question } }')
    print("   last reference-mode market created:", f"{iso(ref[0]['createdAtTimestamp'])} {ref[0]['question']!r}" if ref else "none ever")
    print("   first fixed-strike market created: ", f"{iso(fx[0]['createdAtTimestamp'])} {fx[0]['question']!r}" if fx else "none")
