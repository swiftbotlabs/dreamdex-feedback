#!/bin/sh
# Read-only. Which testnet pool does the dreamDEX testnet indexer (the one app.testnet.dreamdex.io queries for Lend history) follow?
Q='{ byUser: LendAction(where:{user:{_eq:"0xf06fc64627c7853ca1db2022661aa1c11d11cd25"}}, limit:5) { kind reserve amount blockNumber } usdso: LendAction(where:{reserve:{_eq:"0x9c32f3827a1a99f0cf9b213de8b53ec3d57bb171"}}, limit:5) { kind user blockNumber } reserves: LendRateUpdate(distinct_on: reserve) { reserve } latest: LendAction(limit:1, order_by:{blockNumber:desc}) { kind reserve user counterparty blockNumber timestamp txHash } other: LendAction(where:{user:{_eq:"0x74e9aa912b384f4dd9f436db82e76aed352774c0"}}, order_by:{blockNumber:asc}) { kind reserve amount counterparty blockNumber txHash } }'
curl -s -m 60 https://dev.smk.somnia.host/v1/graphql -H 'content-type: application/json' -d "$(printf '%s' "$Q" | python3 -c 'import json,sys; print(json.dumps({"query": sys.stdin.read()}))')"
echo
