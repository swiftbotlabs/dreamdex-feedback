#!/usr/bin/env python3
# usage: python3 ec_late_with_strike.py <dir with DreamFly ec_recorder *.jsonl tape> https://prd.smk.somnia.host/v1/graphql
# Counterfactual: DreamFly's own ec_late rule (RULE defaults, ec_live.plan_take + seller_ok) on its own recorded
# book rows, once with the recorded open (null -> no plan, what v1.0.0 does) and once with the window's strike
# (the question line) as the open, using the recorder's own baselineProb (zero-drift normal, sigma from the tape).
import json,sys,math,re,glob,urllib.request,collections
RULE={"act_max_s":25.0,"min_s":6.0,"fav_min":0.95,"z_min":1.6,"max_ask":0.95,"min_gap":0.06,"max_discount":0.08}
def ncdf(z):
    t=1/(1+0.2316419*abs(z)); d=0.3989423*math.exp(-z*z/2)
    p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274)))); return 1-p if z>=0 else p
def best_ask(b):
    a=(b or {}).get('asks') or []
    return (float(a[0][0]),float(a[0][1])) if a and a[0][0] is not None and a[0][1] and float(a[0][1])>0 else None
def plan(pu,z):
    if pu is None or z is None: return None
    side='up' if pu>=0.5 else 'down'; conf=pu if side=='up' else 1-pu
    if conf<RULE['fav_min'] or abs(z)<RULE['z_min']: return None
    return side,min(RULE['max_ask'],conf-RULE['min_gap'])
def seller(row,side,cap):
    a=best_ask(row.get(side))
    return a if a is not None and a[0]<=cap and cap-a[0]<=RULE['max_discount'] else None
rows=[json.loads(l) for f in sorted(glob.glob(sys.argv[1]+'/*.jsonl')) for l in open(f)]
books=[r for r in rows if r.get('type')=='ec_book']
ids=sorted(set(r['marketId'] for r in books))
q='{ Market(where:{marketId:{_in:%s}}) { marketId question } }'%json.dumps(ids)
req=urllib.request.Request(sys.argv[2],json.dumps({"query":q}).encode(),{"content-type":"application/json"})
line={m['marketId']:float(re.search(r'at or above ([0-9.]+)',m['question']).group(1)) for m in json.load(urllib.request.urlopen(req,timeout=60))['data']['Market']}
res={r['marketId']:r for r in rows if r.get('type')=='ec_resolution'}
by=collections.defaultdict(list)
for r in books: by[r['marketId']].append(r)
tot=collections.Counter()
for mid,rs in by.items():
    sym=rs[0]['symbol']; acted=[r for r in rs if RULE['min_s']<=r['secondsLeft']<=RULE['act_max_s']]
    v1=sum(1 for r in acted if plan(r.get('prob_up'),r.get('z')))
    cf=[]
    for r in acted:
        o,sig=r.get('oracle'),r.get('sigma_bps')
        if not (o and sig and sig>0): continue
        lead=(o/line[mid]-1)*1e4; z=lead/(sig*math.sqrt(max(r['secondsLeft'],1))); pu=ncdf(z)
        p=plan(pu,z)
        if p: cf.append((r['secondsLeft'],p[0],round(p[1],3),seller(r,p[0],p[1]),round(z,2)))
    truth=res.get(mid,{}).get('truth')
    first=next((c for c in cf if c[3]),None)
    tot['windows']+=1; tot['v1_plans']+=v1; tot['cf_windows_with_plan']+=bool(cf); tot['cf_windows_with_seller']+=bool(first)
    if first: tot['cf_seller_side_won']+=(first[1]==truth)
    print(f"{sym:34s} acted rows {len(acted):2d} | v1.0.0 plans {v1} | with strike: plans {len(cf):2d}, first with a seller {first} | resolved {truth}")
print(dict(tot))
