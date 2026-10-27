#!/usr/bin/env python3
"""Read-only: is the token holder list on new.explorer.somnia.network sorted by balance and free of zero balances?
Fetches the first page of /api/v2/tokens/<token>/holders, then reads balanceOf() for every listed holder in ONE
JSON-RPC batch at the latest block. Same check on explorer.somnia.network (Blockscout) for comparison.
usage: python3 holders_check.py [token]   (default: USDso 0x00000022dA000002656c64D9eA6011ea952D008A)"""
import json, sys, time, urllib.request, datetime
TOK = sys.argv[1] if len(sys.argv) > 1 else '0x00000022dA000002656c64D9eA6011ea952D008A'
RPC = 'https://api.infra.mainnet.somnia.network/'; UA = {'User-Agent': 'curl/8.18.0'}
def now(): return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60) as f: return json.loads(f.read()), f.headers.get('x-api-backend')
def rpc(batch):
    body = json.dumps([{"jsonrpc": "2.0", "id": i, "method": m, "params": p} for i, (m, p) in enumerate(batch)]).encode()
    with urllib.request.urlopen(urllib.request.Request(RPC, data=body, headers={**UA, 'content-type': 'application/json'}), timeout=60) as f:
        return [r['result'] for r in sorted(json.loads(f.read()), key=lambda r: r['id'])]
for base in ('https://new.explorer.somnia.network', 'https://explorer.somnia.network'):
    t = now(); d, xb = get(f'{base}/api/v2/tokens/{TOK}/holders'); time.sleep(1)
    items = d['items']
    calls = [('eth_call', [{"to": TOK, "data": "0x70a08231" + i['address']['hash'][2:].lower().rjust(64, '0')}, "latest"]) for i in items]
    res = rpc(calls + [('eth_blockNumber', [])]); blk = int(res[-1], 16); res = res[:-1]
    v = [int(i['value']) for i in items]; chain = [int(r, 16) for r in res]
    zeros = [k + 1 for k, x in enumerate(v) if x == 0]
    breaks = [(k + 1, v[k] / 1e18, v[k + 1] / 1e18) for k in range(len(v) - 1) if v[k] < v[k + 1]]
    match = sum(1 for a, b in zip(v, chain) if a == b)
    print(f'== {t} GET {base}/api/v2/tokens/{TOK}/holders (x-api-backend: {xb or "none"}); balanceOf batch at block {blk:,} ({now()})')
    print(f'   {len(v)} holders on page 1; listed value == on-chain balanceOf for {match} of {len(v)}')
    print(f'   zero-balance holders listed at rank: {zeros or "none"}')
    print(f'   ranks where the next holder has MORE than this one (rank, value, next value): {[(r, round(a, 6), round(b, 6)) for r, a, b in breaks] or "none"}')
    for k, (i, a, b) in enumerate(zip(items, v, chain)):
        if a == 0 or (k + 1) in [r for r, _, _ in breaks] or (k + 1) in [r + 1 for r, _, _ in breaks]:
            print(f'      #{k+1:<3} {i["address"]["hash"]}  listed {a/1e18:>16,.6f}  balanceOf {b/1e18:>16,.6f}')
