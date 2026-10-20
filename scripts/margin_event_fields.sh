#!/usr/bin/env bash
# Reproduces: report 12 (the indexer's MarginEvent rows have no block number, so margin flows cannot be read by block).
# Run:  bash scripts/margin_event_fields.sh   (needs curl and python3). Read-only: GraphQL introspection + 3 queries + 2 RPC reads.
U=https://hideki-dev.smk.somnia.host/v1/graphql
RPC=https://api.hideki2.infra.testnet.somnia.network
gql(){ curl -s -m 60 -H 'content-type: application/json' --data "$1" "$U"; echo; }
fields(){ gql "{\"query\":\"{ __type(name:\\\"$1\\\") { fields { name } } }\"}" | python3 -I -c "import sys,json; t=(json.load(sys.stdin).get('data') or {}).get('__type'); print('$1:', 'type not found' if not t else ' '.join(f['name'] for f in t['fields']))"; }
echo "## entity fields (introspection)"
for T in MarginEvent LiquidationEvent Fill Order; do fields "$T"; done
echo; echo "## select blockNumber on MarginEvent"
gql '{"query":"{ MarginEvent(limit:1) { id blockNumber } }"}'
echo "## filter MarginEvent by blockNumber (what sinceBlock/toBlock would need)"
gql '{"query":"{ MarginEvent(where:{blockNumber:{_gte:27700000}}, limit:1) { id } }"}'
echo "## a real Deposit row (our account): only timestamp + txHash locate it"
gql '{"query":"{ MarginEvent(where:{account:{_eq:\"0x2a11e7388d1d2f9690f2636846d44b478f61bf08\"}, kind:{_eq:\"Deposit\"}}) { id account kind amount timestamp txHash } }"}'
echo "## the block it is in, from the RPC (one extra request per row)"
curl -s -m 30 -H 'content-type: application/json' "$RPC" --data '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["0x50811a18373415fd960f73c2dbce1d12c247a61fc4f2b1275fbd427cf46fec82"]}' | python3 -I -c "import sys,json; r=json.load(sys.stdin)['result']; print('blockNumber', int(r['blockNumber'],16), 'status', r['status'])"
echo "## how many blocks share one timestamp second (block time)"
python3 -I - "$RPC" <<'PY'
import json, sys, urllib.request
rpc = sys.argv[1]
def blk(n):
    req = urllib.request.Request(rpc, data=json.dumps({"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":[hex(n), False]}).encode(), headers={"content-type":"application/json"})
    return int(json.load(urllib.request.urlopen(req, timeout=30))["result"]["timestamp"], 16)
b = 27699377; t = blk(b)
lo = b
while blk(lo - 1) == t: lo -= 1
hi = b
while blk(hi + 1) == t: hi += 1
print(f"block {b} timestamp {t}: blocks {lo}..{hi} ({hi - lo + 1} blocks) share that timestamp")
PY
