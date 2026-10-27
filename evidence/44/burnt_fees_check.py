#!/usr/bin/env python3
"""Read-only: burnt-fee fields of new.explorer.somnia.network vs the receipts and the documented burn share.
For each block: /api/v2/blocks/<n> (burnt_fees, base_fee_per_gas) and /api/v2/blocks/<n>/transactions
(fee, transaction_burnt_fee, gas_price) next to eth_getTransactionReceipt (gasUsed x effectiveGasPrice).
Docs (new.docs.somnia.network/concepts/tokenomics/gas-fees.md, "Fee distribution"): fees are collected by
NodeCommittee and at the end of each epoch "The burn share is currently 5% on mainnet".
usage: python3 burnt_fees_check.py <block> [<block> ...]"""
import json, sys, time, urllib.request, datetime
EXP = 'https://new.explorer.somnia.network'; RPC = 'https://api.infra.mainnet.somnia.network/'; UA = {'User-Agent': 'curl/8.18.0'}
def now(): return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
def get(p):
    with urllib.request.urlopen(urllib.request.Request(EXP + p, headers=UA), timeout=60) as f: return json.loads(f.read()), f.headers.get('x-api-backend')
def rpc(batch):
    body = json.dumps([{"jsonrpc": "2.0", "id": i, "method": m, "params": p} for i, (m, p) in enumerate(batch)]).encode()
    with urllib.request.urlopen(urllib.request.Request(RPC, data=body, headers={**UA, 'content-type': 'application/json'}), timeout=60) as f:
        return [r['result'] for r in sorted(json.loads(f.read()), key=lambda r: r['id'])]
S = lambda w: f'{w/1e18:.9f} SOMI'
for n in map(int, sys.argv[1:]):
    b, xb = get(f'/api/v2/blocks/{n}'); time.sleep(1)
    txs, _ = get(f'/api/v2/blocks/{n}/transactions'); time.sleep(1)
    rc = rpc([('eth_getTransactionReceipt', [t['hash']]) for t in txs['items']] + [('eth_getBlockByNumber', [hex(n), False])])
    blk = rc[-1]; rc = rc[:-1]
    print(f'== {now()} block {n:,} (x-api-backend: {xb}); RPC baseFeePerGas {int(blk["baseFeePerGas"],16)/1e9:g} gwei, gasUsed {int(blk["gasUsed"],16):,}')
    sf = sb = sr = 0
    for t, r in zip(txs['items'], rc):
        paid = int(r['gasUsed'], 16) * int(r['effectiveGasPrice'], 16)
        f, tb = int(t['fee']['value']), int(t['transaction_burnt_fee'])
        sf += f; sb += tb; sr += paid
        print(f'   tx {t["hash"][:14]}… gas_used {int(t["gas_used"]):>9,}  gas_price {int(t["gas_price"])/1e9:>4g} gwei (receipt effectiveGasPrice {int(r["effectiveGasPrice"],16)/1e9:g})'
              f'  fee {S(f)} (receipt {S(paid)})  transaction_burnt_fee {S(tb)} = {tb/f*100 if f else 0:.0f}% of fee')
    bf = int(b['burnt_fees'])
    print(f'   block burnt_fees {S(bf)} = gas_used {int(b["gas_used"]):,} x base_fee_per_gas {int(b["base_fee_per_gas"])/1e9:g} gwei')
    print(f'   sum of tx fees {S(sf)} (receipts {S(sr)}); sum of tx transaction_burnt_fee {S(sb)}')
    if sf: print(f'   -> block burnt_fees is {bf/sf:.2f}x the fees its transactions paid; documented burn (5% of fees) would be {S(sf*5//100)}')
    try:
        with urllib.request.urlopen(urllib.request.Request(f'https://explorer.somnia.network/api/v2/blocks/{n}', headers=UA), timeout=60) as f: ob = json.loads(f.read())
        time.sleep(1)
        with urllib.request.urlopen(urllib.request.Request(f'https://explorer.somnia.network/api/v2/transactions/{txs["items"][0]["hash"]}', headers=UA), timeout=60) as f: ot = json.loads(f.read())
        print(f'   for comparison, explorer.somnia.network (Blockscout): block burnt_fees {S(int(ob["burnt_fees"]))} (burnt_fees_percentage {ob.get("burnt_fees_percentage")}), tx {txs["items"][0]["hash"][:14]}… transaction_burnt_fee {ot.get("transaction_burnt_fee")}')
        time.sleep(1)
    except Exception as e:
        print(f'   (Blockscout comparison failed: {e})')
