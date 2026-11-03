# Read-only. Lists every Event Contract series (asset, window length) on an indexer for the last 7 days, with gaps.
# Usage: python3 evidence/70/ec_series.py <indexer host>   (run from the repo root; needs evidence/70/gq.sh)
import json,subprocess,collections,datetime,time,sys
host=sys.argv[1]; since=int(time.time())-7*86400
rows=[]; off=0
while True:
    q='{ Market(where:{marketType:{_eq:BINARY}, expiry:{_gt:"%d"}}, limit:3000, offset:%d, order_by:[{expiry:asc},{id:asc}]) { asset intervalSec expiry voided tradingStart tradeCount } }'%(since,off)
    out=subprocess.run(['bash','evidence/70/gq.sh',host,q],capture_output=True,text=True).stdout
    d=json.loads(out)
    if 'errors' in d: print(d); break
    page=d['data']['Market']; rows+=page; off+=3000
    if len(page)<3000: break
json.dump(rows,open('/dev/null','w'))
print('markets',len(rows))
by=collections.defaultdict(list)
for r in rows: by[(r['asset'],int(r['intervalSec']))].append(int(r['expiry']))
now=int(time.time())
for k in sorted(by):
    ex=sorted(set(by[k])); iv=k[1]
    gaps=[(a,b) for a,b in zip(ex,ex[1:]) if b-a>iv]
    dup=len(by[k])-len(ex)
    print(k, 'n',len(ex),'first',datetime.datetime.fromtimestamp(ex[0],datetime.UTC).strftime('%m-%d %H:%M'),'last',datetime.datetime.fromtimestamp(ex[-1],datetime.UTC).strftime('%m-%d %H:%M'),'gaps',len(gaps),'missing windows',sum((b-a)//iv-1 for a,b in gaps),'dupExpiry',dup)
    for a,b in gaps[:6]: print('    gap', datetime.datetime.fromtimestamp(a,datetime.UTC).strftime('%m-%d %H:%M'),'->',datetime.datetime.fromtimestamp(b,datetime.UTC).strftime('%m-%d %H:%M'), (b-a)//iv-1,'windows')
