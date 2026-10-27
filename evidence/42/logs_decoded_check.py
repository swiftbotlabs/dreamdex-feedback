#!/usr/bin/env python3
"""Read-only: are event logs decoded by /api/v2/transactions/<hash>/logs on new.explorer.somnia.network?
Compares with explorer.somnia.network (Blockscout v10.2.6, same chain 5031) and shows that the emitting
contracts are verified on the new explorer itself (/api/v2/smart-contracts/<addr>).
usage: python3 logs_decoded_check.py <tx hash> [<tx hash> ...]"""
import json, sys, time, urllib.request, datetime
NEW = 'https://new.explorer.somnia.network'; OLD = 'https://explorer.somnia.network'; UA = {'User-Agent': 'curl/8.18.0'}
def get(base, path):
    with urllib.request.urlopen(urllib.request.Request(base + path, headers=UA), timeout=60) as f:
        return json.loads(f.read()), f.headers.get('x-api-backend')
def now(): return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
for h in sys.argv[1:]:
    n, xb = get(NEW, f'/api/v2/transactions/{h}/logs'); time.sleep(1)
    o, _ = get(OLD, f'/api/v2/transactions/{h}/logs'); time.sleep(1)
    print(f'== {now()} tx {h}')
    nd = sum(1 for l in n['items'] if l.get('decoded')); od = sum(1 for l in o['items'] if l.get('decoded'))
    print(f'   new.explorer  /logs (x-api-backend: {xb}): {len(n["items"])} logs, {nd} with "decoded"')
    print(f'   explorer      /logs (Blockscout):          {len(o["items"])} logs, {od} with "decoded"')
    oi = {l['index']: l for l in o['items']}; seen = set()
    for l in n['items']:
        a = l['address']['hash']; ol = oi.get(l['index'], {})
        if not (ol.get('decoded')) or a in seen: continue
        seen.add(a)
        sc, _ = get(NEW, f'/api/v2/smart-contracts/{a}'); time.sleep(1)
        ad, _ = get(NEW, f'/api/v2/addresses/{a}'); time.sleep(1)
        impl = [i.get('address_hash') or i.get('address') for i in ad.get('implementations') or []]
        print(f'   log #{l["index"]} {a}: new.explorer decoded={l.get("decoded")!r:5}  | Blockscout decoded={ol["decoded"]["method_call"]!r}')
        print(f'      new.explorer /api/v2/smart-contracts/{a[:10]}…: name={sc.get("name")!r} verified_at={sc.get("verified_at")!r}; /addresses: is_verified={ad.get("is_verified")} implementations={impl}')
