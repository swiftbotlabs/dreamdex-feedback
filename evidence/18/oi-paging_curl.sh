#!/usr/bin/env bash
# Minimal read-only repro with curl + jq: the SDK 0.32.1 OpenInterestHistory query for the PUMP pool,
# pages at offset 300 and 400 (limit 100, the SDK default) and one read of 1000 rows from offset 0.
# Prints only the rows of block 31777970 (timestamp 1792829880) with their position in the result.
set -euo pipefail
URL=https://hideki-dev.smk.somnia.host/v1/graphql
POOL=${1:-0x76c981a52530cdf9497559140aafcd8cd16836e7}
TS=${2:-1792829880}
Q='query OpenInterestHistory($pool: String!, $limit: Int, $offset: Int) { _sdkWatermark: chain_metadata { chain_id latest_processed_block } OpenInterestSnapshot(where: {pool: {_eq: $pool}}, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { id pool openInterest timestamp blockNumber } }'
for args in "300 100" "400 100" "0 1000"; do
  set -- $args
  echo "$(date -u +%FT%TZ) offset $1 limit $2:"
  jq -n --arg q "$Q" --arg p "$POOL" --argjson o "$1" --argjson l "$2" '{query:$q, variables:{pool:$p, limit:$l, offset:$o}}' \
    | curl -s -m 30 -H 'content-type: application/json' --data @- "$URL" \
    | jq -r --arg ts "$TS" --argjson o "$1" '.data.OpenInterestSnapshot | to_entries[] | select(.value.timestamp == $ts) | "  row \(.key) (absolute \(.key + $o)) \(.value.id[43:]) oi \(.value.openInterest)"'
  sleep 1
done
