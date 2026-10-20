#!/usr/bin/env bash
# Reproduces: report 04.
# Run:  bash scripts/indexer_timing.sh [account]   (default 0x420691db9d2b5a79210fda48c177471386b6dfd1; needs curl and bc)
# Read-only GraphQL POSTs. Expect: the SDK shape fails with "database query error" after ~10.5 s.
# Re-runs the MarginEvents query shapes from feedback/04 against the Hideki indexer and prints timing + ok/ERROR.
U=https://hideki-dev.smk.somnia.host/v1/graphql
A=${1:-0x420691db9d2b5a79210fda48c177471386b6dfd1}
run(){ s=$(date +%s.%N); r=$(curl -s -m 60 -H 'content-type: application/json' --data "$2" "$U" | head -c 100); e=$(date +%s.%N); printf "%-44s %.2fs %s\n" "$1" "$(echo "$e - $s" | bc)" "$(echo "$r" | grep -q errors && echo ERROR || echo ok)"; }
Q='query MarginEvents($where: MarginEvent_bool_exp!, $limit: Int, $offset: Int) { MarginEvent(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { id account kind pool amount granter timestamp txHash } }'
for i in 1 2 3; do run "SDK shape: account + kinds D/C/W, ts desc" "{\"query\":\"$Q\",\"variables\":{\"where\":{\"account\":{\"_eq\":\"$A\"},\"kind\":{\"_in\":[\"Deposit\",\"Credited\",\"Withdraw\"]}},\"limit\":50,\"offset\":0}}"; done
run "account only, ts desc" "{\"query\":\"$Q\",\"variables\":{\"where\":{\"account\":{\"_eq\":\"$A\"}},\"limit\":50,\"offset\":0}}"
run "account + kinds Locked, ts desc" "{\"query\":\"$Q\",\"variables\":{\"where\":{\"account\":{\"_eq\":\"$A\"},\"kind\":{\"_in\":[\"Locked\"]}},\"limit\":50,\"offset\":0}}"
run "account + kinds D/C/W, order id desc" "{\"query\":\"query(\$where: MarginEvent_bool_exp!) { MarginEvent(where: \$where, order_by: {id: desc}, limit: 50) { id kind } }\",\"variables\":{\"where\":{\"account\":{\"_eq\":\"$A\"},\"kind\":{\"_in\":[\"Deposit\",\"Credited\",\"Withdraw\"]}}}}"
run "account + kinds D/C/W, no order" "{\"query\":\"query(\$where: MarginEvent_bool_exp!) { MarginEvent(where: \$where, limit: 50) { id kind } }\",\"variables\":{\"where\":{\"account\":{\"_eq\":\"$A\"},\"kind\":{\"_in\":[\"Deposit\",\"Credited\",\"Withdraw\"]}}}}"
run "distinct_on kind" '{"query":"query { MarginEvent(distinct_on: kind) { kind } }"}'
run "aggregate count for account" "{\"query\":\"query { MarginEvent_aggregate(where:{account:{_eq:\\\"$A\\\"}}) { aggregate { count } } }\"}"
