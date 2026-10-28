#!/usr/bin/env python3
"""Read-only check: Etherscan-style `module=account&action=txlist` on the new explorer for busy and
less busy accounts, with page=1&offset=5&sort=desc (the smallest normal request), next to the same
request on explorer.somnia.network (Blockscout, same chain), the new explorer's own transaction count
(/api/v2/addresses/<a>/counters) and its REST list (/api/v2/addresses/<a>/transactions).
No keys, no writes.  usage: txlist_busy_accounts_check.py [address ...]"""
import json, sys, time, urllib.request, urllib.error

NEW = "https://new.explorer.somnia.network"
BS = "https://explorer.somnia.network"
RPC = "https://api.infra.mainnet.somnia.network/"
HDR = {"User-Agent": "Mozilla/5.0 (feedback repro)", "Accept": "application/json"}
DEFAULT = [
    "0x5E5205CF39E766118C01636bED000A54D93163E6",  # the explorer's Charts page calls it AgentRequester
    "0x59c53Ec71c94362a271d807518Be6877b0Ab6e33",
    "0x4Df3481691589a02d081246aBE3658E52f265E0e",
    "0x9F1fC6149C21aFdDD730a02264780AEc0eE4125D",
    "0x601b691a3C6372d6D7345df4f7E5D30d51535aCd",
    "0x1a9Fa14e6Fb2825A1815e2E760F0F32e5003d073",  # control
    "0xa2842ED9149047AB152b2102553c4c45F76547cD",  # control
    "0x046EDe9564A72571df6F5e44d0405360c0f4dCab",  # control (WSOMI)
]

def get(url, timeout=90):
    req = urllib.request.Request(url, headers=HDR)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, json.loads(r.read()), time.time() - t0
    except urllib.error.HTTPError as e:
        if e.code in (403, 429):
            raise SystemExit(f"stopping: HTTP {e.code} from {url}")
        return e.code, {}, {"error": e.read()[:200].decode("latin1")}, time.time() - t0

def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"content-type": "application/json", **HDR})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["result"]

def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def txlist(base, a):
    c, h, j, dt = get(f"{base}/api?module=account&action=txlist&address={a}&page=1&offset=5&sort=desc")
    r = j.get("result")
    rows = len(r) if isinstance(r, list) else None
    newest = r[0]["blockNumber"] if isinstance(r, list) and r else None
    return f"HTTP {c} status {j.get('status')} {j.get('message')!r} rows {rows} newest block {newest} ({dt:.1f}s)"

addrs = sys.argv[1:] or DEFAULT
print(f"== {now()} RPC head {int(rpc('eth_blockNumber', []), 16):,}")
for a in addrs:
    code = rpc("eth_getCode", [a, "latest"]); nonce = int(rpc("eth_getTransactionCount", [a, "latest"]), 16)
    c, h, cn, _ = get(f"{NEW}/api/v2/addresses/{a}/counters"); time.sleep(1)
    print(f"\n{a}  {'contract' if code != '0x' else 'EOA'}, nonce {nonce:,}, new explorer counters.transactions_count {cn.get('transactions_count')}")
    print(f"  {now()} NEW txlist: {txlist(NEW, a)}"); time.sleep(1.5)
    c, h, j, dt = get(f"{NEW}/api/v2/addresses/{a}/transactions"); time.sleep(1.5)
    print(f"  {now()} NEW /api/v2/addresses/<a>/transactions: HTTP {c} items {len(j.get('items', []))} newest block {(j.get('items') or [{}])[0].get('block_number')} ({dt:.1f}s)")
    print(f"  {now()} BS  txlist: {txlist(BS, a)}"); time.sleep(1.5)

head = int(rpc("eth_blockNumber", []), 16)
a = addrs[0]
for back in (200_000, 2_000_000):
    c, h, j, dt = get(f"{NEW}/api?module=account&action=txlist&address={a}&startblock={head - back}&endblock={head}&page=1&offset=5&sort=desc")
    r = j.get("result")
    print(f"\n{now()} NEW txlist {a} with startblock=head-{back:,}: status {j.get('status')} {j.get('message')!r} "
          f"rows {len(r) if isinstance(r, list) else None} ({dt:.1f}s)")
    time.sleep(1.5)
