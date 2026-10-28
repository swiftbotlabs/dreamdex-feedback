"""Report 56 (read-only): count an account's fills (as taker or maker) per market type on both testnet indexers.
Usage: python3 evidence/56/fills_by_region.py 0xACCOUNT [0xACCOUNT ...]"""
import json, sys, time, urllib.request

HOSTS = [("Tokyo / DreamDEX region, chain 50383 (hideki-dev indexer)", "https://hideki-dev.smk.somnia.host/v1/graphql"),
         ("Global region, Shannon chain 50312 (dev indexer, the one the page's Spot/Event trades and Open orders tabs query)", "https://dev.smk.somnia.host/v1/graphql")]

def gql(url, query):
    req = urllib.request.Request(url, data=json.dumps({"query": query}).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0"})
    return json.load(urllib.request.urlopen(req, timeout=60))

for raw in sys.argv[1:]:
    a = raw.lower()
    out = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "account": a}
    for label, url in HOSTS:
        res = {}
        for mt in ("SPOT", "PERP", "BINARY"):
            r = gql(url, '{ Fill(where:{_or:[{taker:{_eq:"%s"}},{maker:{_eq:"%s"}}], marketType:{_eq:"%s"}}, limit:3, order_by:{timestamp:desc}) { marketType market_id txHash timestamp } }' % (a, a, mt))
            if "errors" in r:
                res[mt] = {"error": "; ".join(e["message"] for e in r["errors"])}
            else:
                res[mt] = {"latest_up_to_3": [{"tx": f["txHash"], "utc": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(int(f["timestamp"]))), "market_id": f["market_id"]} for f in r["data"]["Fill"]]}
        out[label] = res
    print(json.dumps(out, indent=1))
