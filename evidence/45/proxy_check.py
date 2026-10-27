#!/usr/bin/env python3
"""Read-only: does new.explorer.somnia.network recognise EIP-1967 proxies that are not verified?
For each address: the EIP-1967 implementation slot and beacon slot read with eth_getStorageAt (and the beacon's
implementation() via eth_call), next to proxy_type / implementations from /api/v2/addresses/<addr> on
new.explorer.somnia.network and on explorer.somnia.network (Blockscout v10.2.6, same chain 5031).
usage: python3 proxy_check.py <address> [<address> ...]"""
import json, sys, time, urllib.request, datetime
NEW = 'https://new.explorer.somnia.network'; OLD = 'https://explorer.somnia.network'; RPC = 'https://api.infra.mainnet.somnia.network/'
UA = {'User-Agent': 'curl/8.18.0'}
IMPL = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'   # bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)
BEACON = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50' # bytes32(uint256(keccak256('eip1967.proxy.beacon')) - 1)
def now(): return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
def get(base, p):
    with urllib.request.urlopen(urllib.request.Request(base + p, headers=UA), timeout=60) as f: return json.loads(f.read()), f.headers.get('x-api-backend')
def rpc(m, p):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode()
    with urllib.request.urlopen(urllib.request.Request(RPC, data=body, headers={**UA, 'content-type': 'application/json'}), timeout=30) as f:
        return json.loads(f.read()).get('result')
def word_addr(w): return None if not w or w == "0x" or int(w, 16) == 0 else '0x' + w[-40:]
for a in sys.argv[1:]:
    impl = word_addr(rpc('eth_getStorageAt', [a, IMPL, 'latest'])); beacon = word_addr(rpc('eth_getStorageAt', [a, BEACON, 'latest']))
    bimpl = word_addr(rpc('eth_call', [{"to": beacon, "data": "0x5c60da1b"}, 'latest'])) if beacon else None   # implementation()
    n, xb = get(NEW, f'/api/v2/addresses/{a}'); time.sleep(1); o, _ = get(OLD, f'/api/v2/addresses/{a}'); time.sleep(1)
    li = lambda d: [i.get('address_hash') or i.get('address') for i in d.get('implementations') or []]
    print(f'== {now()} {a}')
    print(f'   RPC  EIP-1967 implementation slot: {impl}   beacon slot: {beacon}' + (f' -> beacon.implementation() = {bimpl}' if beacon else ''))
    print(f'   new.explorer (x-api-backend: {xb}): is_contract={n.get("is_contract")} is_verified={n.get("is_verified")} proxy_type={n.get("proxy_type")} implementations={li(n)}')
    print(f'   explorer.somnia.network (Blockscout): is_verified={o.get("is_verified")} proxy_type={o.get("proxy_type")} implementations={li(o)}')
