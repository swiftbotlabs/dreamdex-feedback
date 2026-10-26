#!/usr/bin/env bash
# Read-only: prints the PerpPosition field descriptions for entryFundingIndex, size and isLong
# on the three indexer deployments (one introspection query each).
set -euo pipefail
Q='{"query":"{ __type(name:\"PerpPosition\"){ fields { name description } } }"}'
for U in https://hideki-dev.smk.somnia.host/v1/graphql https://dev.smk.somnia.host/v1/graphql https://prd.smk.somnia.host/v1/graphql; do
  echo "== $U  $(date -u +%FT%TZ)"
  curl -s --max-time 30 "$U" -H 'content-type: application/json' -d "$Q" \
    | python3 -I -c 'import json,sys; d=json.load(sys.stdin)
for f in d["data"]["__type"]["fields"]:
    if f["name"] in ("entryFundingIndex","size","isLong"): print(f["name"], "::", (f["description"] or "").replace("\n"," "))'
done
