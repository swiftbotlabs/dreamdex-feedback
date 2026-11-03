#!/bin/sh
# Report 71: position changes since week 4 opened (2026-11-02 14:00:00 UTC = 1793628000) for one account, split at the board's activityThrough (17:46:59 UTC = 1793641619).
A=${1:-0x05e56d14dd82c695844d40e15ea4122f0b7683cf}
curl -s https://hideki-dev.smk.somnia.host/v1/graphql -H 'content-type: application/json' \
  -d "{\"query\":\"{ PerpPositionChange(where:{account:{_eq:\\\"$A\\\"}, timestamp:{_gte:\\\"1793628000\\\"}}, order_by:{timestamp:asc}, limit:2000){ kind timestamp txHash } }\"}" |
python3 -c '
import json,sys,datetime
r=json.load(sys.stdin)["data"]["PerpPositionChange"]
f=lambda t: datetime.datetime.fromtimestamp(int(t), datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
b=[x for x in r if int(x["timestamp"])<1793641619]
print("rows since week 4 opened:", len(r), "| before activityThrough 17:46:59:", len(b), "| after:", len(r)-len(b))
print("UTC days with rows:", sorted(set(f(x["timestamp"])[:10] for x in r)))
for x in r: print(f(x["timestamp"]), x["kind"], x["txHash"])
'
