#!/usr/bin/env python3
"""Read-only check: who created a contract, and in which transaction?  For each contract it prints the
new explorer's /api/v2/addresses/<a> creator fields and its Etherscan getcontractcreation answer, the
same two on explorer.somnia.network (Blockscout, same chain), and checks the creation transaction on
the RPC (receipt.contractAddress for a direct create, otherwise a create inside the trace is assumed).
Default list: 6 verified contracts from the explorer's own /api/v2/smart-contracts plus 3 more.
No keys, no writes.  usage: contract_creator_check.py [address ...]"""
import json, sys, time, urllib.request, urllib.error

NEW = "https://new.explorer.somnia.network"
BS = "https://explorer.somnia.network"
RPC = "https://api.infra.mainnet.somnia.network/"
HDR = {"User-Agent": "Mozilla/5.0 (feedback repro)", "Accept": "application/json"}
EXTRA = [
    "0x046EDe9564A72571df6F5e44d0405360c0f4dCab",  # WSOMI (verified), created directly by an EOA
    "0x5ebFC083628aC3f2AB6275BC660d9AE96dB44Cf4",  # VestingSchedule8, created by a factory
    "0x5E5205CF39E766118C01636bED000A54D93163E6",  # the contract the explorer's Charts page calls AgentRequester
]

def get(url, timeout=90):
    req = urllib.request.Request(url, headers=HDR)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code in (403, 429):
            raise SystemExit(f"stopping: HTTP {e.code} from {url}")
        return e.code, {}

def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"content-type": "application/json", **HDR})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read()).get("result")

def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def creation(base, a):
    c, j = get(f"{base}/api?module=contract&action=getcontractcreation&contractaddresses={a}")
    r = j.get("result")
    r = r[0] if isinstance(r, list) and r else (r or {})
    if isinstance(r, dict) and r.get("txHash"):
        return f"OK creator {r.get('contractCreator')} tx {r.get('txHash')}", r.get("txHash")
    return f"{j.get('status')} {j.get('message')!r}", None

addrs = sys.argv[1:]
if not addrs:
    c, j = get(f"{NEW}/api/v2/smart-contracts")
    addrs = [x["address"]["hash"] for x in j.get("items", [])[:6]] + EXTRA
    time.sleep(1)
print(f"== {now()}")
for a in addrs:
    c, n = get(f"{NEW}/api/v2/addresses/{a}"); time.sleep(0.8)
    c, b = get(f"{BS}/api/v2/addresses/{a}"); time.sleep(0.8)
    ncr, _ = creation(NEW, a); time.sleep(0.8)
    bcr, btx = creation(BS, a); time.sleep(0.8)
    chain = ""
    if btx:
        rc = rpc("eth_getTransactionReceipt", [btx]) or {}
        direct = (rc.get("contractAddress") or "").lower() == a.lower()
        chain = f"RPC: tx {btx[:12]}… exists (block {int(rc['blockNumber'], 16):,}), " + ("receipt.contractAddress = this contract (direct create)" if direct else f"to {rc.get('to')} (created inside the call)")
    print(f"\n{a}  {n.get('name')!r}  verified {n.get('is_verified')}")
    print(f"  NEW /api/v2/addresses: creator_address_hash {n.get('creator_address_hash')}  creation_transaction_hash {n.get('creation_transaction_hash')}")
    print(f"  NEW getcontractcreation: {ncr}")
    print(f"  BS  /api/v2/addresses: creator_address_hash {b.get('creator_address_hash')}  creation_transaction_hash {b.get('creation_transaction_hash')}")
    print(f"  BS  getcontractcreation: {bcr}")
    if chain:
        print(f"  {chain}")
