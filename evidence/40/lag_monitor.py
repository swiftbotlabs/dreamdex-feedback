#!/usr/bin/env python3
"""Read-only: poll how far behind the RPC head the newest row of several new.explorer.somnia.network lists is.
usage: python3 lag_monitor.py <rounds> <seconds between rounds>   (about 9-10 requests per round, 1.2 s apart)"""
import json,urllib.request,time,datetime,sys
EXP='https://new.explorer.somnia.network'; RPC='https://api.infra.mainnet.somnia.network/'
def get(p):
    r=urllib.request.Request(EXP+p,headers={'User-Agent':'curl/8'})
    t0=time.time()
    with urllib.request.urlopen(r,timeout=30) as f: return json.loads(f.read()), f.headers.get('x-api-backend'), time.time()-t0
def rpc(m,p):
    r=urllib.request.Request(RPC,data=json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),headers={'content-type':'application/json','User-Agent':'curl/8'})
    with urllib.request.urlopen(r,timeout=30) as f: return json.loads(f.read())['result']
A1='0x1DCE9E1F3843572020ADdEF2c5A7B1F1b0A56c0c'; A2='0xa2842ED9149047AB152b2102553c4c45F76547cD'; A3='0x12cc1960eF5d0927cFF8Cfbbe831620e58FaAbF0'; A4='0x601b691a3C6372d6D7345df4f7E5D30d51535aCd'
probes=[('addr '+A1[:10]+' /transactions',f'/api/v2/addresses/{A1}/transactions',lambda d:d['items'][0]['block_number']),
        ('addr '+A2[:10]+' /transactions',f'/api/v2/addresses/{A2}/transactions',lambda d:d['items'][0]['block_number']),
        ('addr '+A3[:10]+' /token-transfers',f'/api/v2/addresses/{A3}/token-transfers',lambda d:d['items'][0]['block_number']),
        ('addr '+A4[:10]+' /transactions',f'/api/v2/addresses/{A4}/transactions',lambda d:d['items'][0]['block_number']),
        ('/api/v2/token-transfers (global list)','/api/v2/token-transfers',lambda d:d['items'][0]['block_number']),
        ('etherscan txlist '+A2[:10],f'/api?module=account&action=txlist&address={A2}&page=1&offset=1&sort=desc',lambda d:int(d['result'][0]['blockNumber'])),
        ('/api/v2/transactions (global list)','/api/v2/transactions',lambda d:d['items'][0]['block_number']),
        ('/api/v2/blocks','/api/v2/blocks',lambda d:d['items'][0]['height']),
        ('/api/v2/stats total_blocks','/api/v2/stats',lambda d:int(d['total_blocks']))]
rounds=int(sys.argv[1]); gap=float(sys.argv[2])
for r in range(rounds):
    head=int(rpc('eth_blockNumber',[]),16); ts=datetime.datetime.now(datetime.timezone.utc).strftime('%FT%T')+'Z'
    print(f'== {ts} RPC head {head}',flush=True)
    for name,p,f in probes:
        try:
            d,xb,dt=get(p); b=f(d)
            print(f'   {name:42s} newest block {b}  behind head by {head-b:>6} blocks  ({dt:.1f}s, x-api-backend={xb})',flush=True)
        except Exception as e:
            print(f'   {name:42s} ERROR {e}',flush=True)
        time.sleep(1.2)
    if r<rounds-1: time.sleep(gap)
