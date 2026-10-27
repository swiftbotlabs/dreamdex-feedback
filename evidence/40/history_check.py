#!/usr/bin/env python3
"""Read-only: is an address's transaction history on new.explorer.somnia.network current?
usage: python3 history_check.py <address> [<address> ...]
For each address prints the RPC head and nonce, then the newest row of
  /api/v2/addresses/<a>/transactions, the Etherscan-style txlist, the /counters endpoint
  and the CSV export (today), with how far each is behind the chain head."""
import json, sys, time, urllib.request, datetime, csv, io
EXP = 'https://new.explorer.somnia.network'; RPC = 'https://api.infra.mainnet.somnia.network/'
UA = {'User-Agent': 'curl/8.18.0'}
def now(): return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
def get(path, raw=False):
    with urllib.request.urlopen(urllib.request.Request(EXP + path, headers=UA), timeout=60) as f:
        b = f.read(); return (b.decode() if raw else json.loads(b)), f.headers.get('x-api-backend')
def rpc(batch):
    body = json.dumps([{"jsonrpc": "2.0", "id": i, "method": m, "params": p} for i, (m, p) in enumerate(batch)]).encode()
    with urllib.request.urlopen(urllib.request.Request(RPC, data=body, headers={**UA, 'content-type': 'application/json'}), timeout=30) as f:
        return [r['result'] for r in sorted(json.loads(f.read()), key=lambda r: r['id'])]
def ts(sec): return datetime.datetime.fromtimestamp(int(sec), datetime.timezone.utc).strftime('%H:%M:%SZ')
for a in sys.argv[1:]:
    head, nonce = rpc([('eth_blockNumber', []), ('eth_getTransactionCount', [a, 'latest'])])
    head, nonce = int(head, 16), int(nonce, 16)
    print(f'== {now()} address {a}\n   RPC {RPC}: head block {head:,}, eth_getTransactionCount (txs sent) {nonce:,}')
    d, xb = get(f'/api/v2/addresses/{a}/transactions'); time.sleep(1)
    x = d['items'][0]
    print(f'   GET /api/v2/addresses/{a[:10]}…/transactions  (x-api-backend: {xb}) newest row: block {x["block_number"]:,} {x["timestamp"]} nonce {x["nonce"] if x["nonce"] is None else format(x["nonce"], ",")} {x["hash"][:12]}…  -> {head - x["block_number"]:,} blocks behind head')
    d, xb = get(f'/api?module=account&action=txlist&address={a}&page=1&offset=1&sort=desc'); time.sleep(1)
    if not d.get('result'):
        print(f'   GET /api?module=account&action=txlist&sort=desc  (x-api-backend: {xb}) -> {json.dumps(d)}')
    else:
        x = d['result'][0]
        print(f'   GET /api?module=account&action=txlist&sort=desc  (x-api-backend: {xb}) newest row: block {int(x["blockNumber"]):,} {ts(x["timeStamp"])} nonce {int(x["nonce"]):,}  -> {head - int(x["blockNumber"]):,} blocks behind head')
    d, xb = get(f'/api/v2/addresses/{a}/counters'); time.sleep(1)
    print(f'   GET /api/v2/addresses/{a[:10]}…/counters  (x-api-backend: {xb}) transactions_count {d["transactions_count"]}')
    day = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
    body, xb = get(f'/api/v2/addresses/{a}/transactions/csv?from_period={day}&to_period={day}', raw=True); time.sleep(1)
    rows = list(csv.DictReader(io.StringIO(body)))
    if rows:
        r = rows[0]
        print(f'   GET /api/v2/addresses/{a[:10]}…/transactions/csv?from_period={day}&to_period={day}  (x-api-backend: {xb}) {len(rows):,} rows, newest: block {int(r["BlockNumber"]):,} {r["UnixTimestamp"]}  -> {head - int(r["BlockNumber"]):,} blocks behind head')
