#!/usr/bin/env bash
# Read-only re-check of SDK 0.32.1 listPerpOrderHistory(account, {limit:100}) against the Hideki indexer.
# Usage: bash order_history_recheck.sh [account ...]   (run from this folder; needs curl + python3)
# Sends, one request at a time:
#   1) the minimal pair (owner + status != Open, sorted by lastUpdatedAtTimestamp vs placedAtTimestamp)
#   2) the exact SDK request body (sdk_body_ended_<acct>.json) with the owner swapped in, default "ended" sort
#   3) the same body with orderBy "placed"
#   4) the account's most recent order (owner only, placedAtTimestamp desc, limit 1), to show when it last traded
set -u
URL=https://hideki-dev.smk.somnia.host/v1/graphql
HERE=$(cd "$(dirname "$0")" && pwd)
ACCTS=("$@")
[ ${#ACCTS[@]} -eq 0 ] && ACCTS=(0x3024ad2acd22f31ce2c8ea37b7837d530ca46e50)

post() { # $1 = body file -> prints "<seconds>s HTTP<code> <ok rows=N | ERR:message>"
  local out t
  out=$(curl -s -m 30 -o "$HERE/.resp" -w '%{time_total} %{http_code}' -H 'content-type: application/json' "$URL" --data @"$1")
  python3 -I - "$HERE/.resp" "$out" <<'PY'
import json, sys
t, code = sys.argv[2].split()
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print(f"{float(t):.2f}s HTTP{code} NONJSON"); sys.exit()
if "errors" in d:
    print(f"{float(t):.2f}s HTTP{code} ERR:{d['errors'][0].get('message')}")
else:
    rows = d["data"]["Order"]
    extra = ""
    if len(rows) == 1 and "placedAtTimestamp" in rows[0]:
        import datetime
        p = int(rows[0]["placedAtTimestamp"])
        extra = f" last order placed {p} = {datetime.datetime.fromtimestamp(p, datetime.timezone.utc):%Y-%m-%dT%H:%M:%SZ} status {rows[0].get('status')}"
    print(f"{float(t):.2f}s HTTP{code} ok rows={len(rows)}{extra}")
PY
}

mk() { # $1 kind, $2 account, $3 out file
  python3 -I - "$HERE" "$1" "$2" "$3" <<'PY'
import json, sys
here, kind, acct, out = sys.argv[1:5]
acct = acct.lower()
if kind in ("ended", "placed"):
    b = json.load(open(f"{here}/sdk_body_{kind}_0x3024.json"))
    b["variables"]["where"]["owner"]["_eq"] = acct
elif kind in ("min_lastupdated", "min_placed"):
    col = "lastUpdatedAtTimestamp" if kind == "min_lastupdated" else "placedAtTimestamp"
    b = {"query": '{ Order(where:{owner:{_eq:"%s"}, status:{_neq:"Open"}}, order_by:[{%s:desc},{id:desc}], limit:100) { id status lastUpdatedAtTimestamp } }' % (acct, col)}
elif kind == "last":
    b = {"query": '{ Order(where:{owner:{_eq:"%s"}}, order_by:[{placedAtTimestamp:desc}], limit:1) { placedAtTimestamp lastUpdatedAtTimestamp status } }' % acct}
json.dump(b, open(out, "w"))
PY
}

echo "# start $(date -u +%FT%TZ)"
curl -s -m 20 -H 'content-type: application/json' "$URL" --data '{"query":"{ chain_metadata { chain_id latest_processed_block } }"}'; echo
for a in "${ACCTS[@]}"; do
  for kind in min_lastupdated min_placed ended placed last; do
    [ "$kind" != ended ] && [ "$kind" != last ] && [ "$a" != "${ACCTS[0]}" ] && continue
    mk "$kind" "$a" "$HERE/.body"
    echo "$a | $kind | @$(date -u +%TZ) $(post "$HERE/.body")"
  done
done
rm -f "$HERE/.body" "$HERE/.resp"
echo "# end $(date -u +%FT%TZ)"
