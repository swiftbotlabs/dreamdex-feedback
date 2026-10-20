#!/usr/bin/env bash
# Reproduces: report 04 (which accounts the SDK's MarginEvents query fails for).
# Run:  bash scripts/indexer_accounts.sh <account...>   (needs curl and bc). Read-only GraphQL POSTs.
# Per account: does it have more than 100,000 MarginEvent rows (offset 100000 returns a row), and how long the SDK's
# getMarginEvents query (kinds Deposit/Credited/Withdraw, order_by timestamp desc, limit 50) takes, ok or ERROR.
U=https://hideki-dev.smk.somnia.host/v1/graphql
q(){ s=$(date +%s.%N); r=$(curl -s -m 60 -H 'content-type: application/json' --data "$1" "$U" | head -c 300); e=$(date +%s.%N); printf "%.2fs|%s" "$(echo "$e - $s" | bc)" "$r"; }
Q='query MarginEvents($where: MarginEvent_bool_exp!, $limit: Int, $offset: Int) { MarginEvent(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { id account kind pool amount granter timestamp txHash } }'
for A in "$@"; do
  p=$(q "{\"query\":\"{ MarginEvent(where:{account:{_eq:\\\"$A\\\"}}, offset:100000, limit:1) { id } }\"}")
  case "$p" in *'"id"'*) big=">100k";; *'"MarginEvent":[]'*) big="<=100k";; *) big="unknown (count probe also failed)";; esac
  r=$(q "{\"query\":\"$Q\",\"variables\":{\"where\":{\"account\":{\"_eq\":\"$A\"},\"kind\":{\"_in\":[\"Deposit\",\"Credited\",\"Withdraw\"]}},\"limit\":50,\"offset\":0}}")
  t=${r%%|*}; b=${r#*|}; case "$b" in *errors*) res="ERROR $(echo "$b" | grep -o '"message":"[^"]*"' | head -1)";; *) res="ok rows=$(echo "$b" | grep -o '"id"' | wc -l)";; esac
  echo "$A rows:$big (probe ${p%%|*}) | SDK shape: $t $res"
done
