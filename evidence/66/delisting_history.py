#!/usr/bin/env python3
"""Read-only. The one perp delisting so far: SWBTCC on Somnia Shannon (chain 50312). Prints its lifecycle events and force-settlement rows from the
indexer, then how the REST API shows the market today. Python 3 stdlib only."""
import datetime, json, urllib.request
IDX = "https://dev.smk.somnia.host/v1/graphql"
API = "https://api.testnet.dreamdex.io/v0"
POOL = "0x50b817fbe3772548a5e5769ae879ffdfc9b50ac5"
def q(s):
    r = urllib.request.Request(IDX, data=json.dumps({"query": s}).encode(), headers={"content-type": "application/json", "user-agent": "curl/8"})
    with urllib.request.urlopen(r, timeout=60) as f:
        return json.load(f)["data"]
def get(p):
    r = urllib.request.Request(API + p, headers={"user-agent": "curl/8"})
    with urllib.request.urlopen(r, timeout=30) as f:
        return f.status, json.load(f)
t = lambda s: datetime.datetime.fromtimestamp(int(s), datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC") if s else None
print("checked", datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"))
ev = q('{ PerpMarketLifecycleEvent(limit: 60, order_by: {blockNumber: asc}, where: {market_id: {_eq: "%s"}, kind: {_in: ["SettlementEntered", "SettlementBatchProcessed", "StaleOrdersCancelled", "MarketDelisted"]}}) { kind timestamp settlementPrice sampleCount twapWindowSec settled feeCharged ordersCancelled txHash } }' % POOL)["PerpMarketLifecycleEvent"]
for e in ev:
    print(t(e["timestamp"]), e["kind"], {k: v for k, v in e.items() if v is not None and k not in ("kind", "timestamp")})
rows = q('{ PerpSettlementPairing(limit: 200, order_by: {timestamp: asc}) { account counterparty feeCharged price sizeSettled accountFullyClosed market_id } }')["PerpSettlementPairing"]
rows = [r for r in rows if r["market_id"] == POOL]
fee = sum(int(r["feeCharged"]) for r in rows) / 1e18
notional = sum(int(r["sizeSettled"]) / 1e8 * int(r["price"]) / 1e18 for r in rows)
print(f"pairings {len(rows)}, notional settled {notional:.2f} USDso, fee charged {fee:.2f} USDso, fee / notional {fee / notional:.4%}")
s, m = get("/markets/SWBTCC:USDso?kind=perp")
print("REST market row:", json.dumps(m)[:700])
s, l = get("/markets?kind=perp")
print("REST /markets?kind=perp lists SWBTCC:", any(x["symbol"] == "SWBTCC:USDso" for x in l["markets"]), "| keys on a row:", sorted(l["markets"][0]), "| keys in perp:", sorted(l["markets"][0]["perp"]))
