#!/usr/bin/env bash
# Read-only. Shows that the TESTNET explorer's Markets section (where the Tokyo pages link) is wired to Somnia
# MAINNET (chain 5031): its footer, the indexer it reads and the pools it lists are mainnet's, while the Tokyo
# perp pool it is sent to exists only on Tokyo (Hideki, 50383). No keys, no transactions.
set -u
X=https://explorer.testnet.somnia.network
TOKYO_POOL=0x2a73129f26917124bd2a47a9b355c395c537f050   # ZEC/USDso perp on Tokyo (a live-feed row on /tokyo links here)
LIT_POOL=0xdcb0ad226727b2ce92857f0af5751389d42b2a3f     # LIT/USDso perp on Tokyo (the bounty's example trade)
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141 Safari/537.36'
echo "run $(date -u +%FT%TZ)"
code_len() {  # bytes of code at $1 on RPC $2; retries a slow RPC up to 3 times
  for i in 1 2 3; do
    out=$(curl -s -m 30 -H 'content-type: application/json' --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getCode\",\"params\":[\"$1\",\"latest\"]}" "$2")
    n=$(printf '%s' "$out" | python3 -I -c "import json,sys
try: r=json.load(sys.stdin)['result']; print((len(r)-2)//2)
except Exception: print('')" 2>/dev/null)
    [ -n "$n" ] && { echo "$n"; return; }
    sleep 2
  done
  echo "rpc-error"
}
echo; echo "== 1. Server-rendered footer of the testnet explorer's Markets pages (which chain they are bound to)"
for p in "/markets" "/markets/perps" "/markets?pool=$TOKYO_POOL" "/markets/pools/$LIT_POOL" "/tokyo"; do
  html=$(curl -s -A "$UA" "$X$p")
  foot=$(printf '%s' "$html" | sed 's/<[^>]*>/ /g' | tr -s ' \n' ' ' | grep -o 'somnia explorer *· *[a-z ]* *· *chain *[0-9]*' | head -1)
  echo "  $p  ->  footer: \"$foot\""
done
echo "  (the Tokyo overview /tokyo hydrates to 'tokyo testnet · chain 50383'; the Markets pages are server-rendered as chain 5031)"
echo; echo "== 2. The indexer the Markets pages query in the browser (prd.smk.somnia.host) vs the Tokyo indexer"
Q='{"query":"query { chain_metadata { chain_id latest_processed_block } Market(where:{poolAddress:{_in:[\"'$TOKYO_POOL'\",\"'$LIT_POOL'\",\"0xa936da11b57b50a344e1293aaae5232885ea2bde\"]}}) { marketType baseSymbol quoteSymbol poolAddress } perps: Market_aggregate(where:{marketType:{_eq:\"PERP\"}}) { aggregate { count } } }"}'
for G in https://prd.smk.somnia.host/v1/graphql https://hideki-dev.smk.somnia.host/v1/graphql; do
  echo "  $G"; echo "    $(curl -s -m 40 "$G" -H 'content-type: application/json' --data "$Q")"
done
echo; echo "== 3. Where the pools live: bytes of code at each address on each chain's RPC"
printf '  %-44s %-10s %-10s %-10s\n' pool mainnet shannon tokyo
for A in 0xa936da11b57b50a344e1293aaae5232885ea2bde 0x25bff6b7b5e2243424f38e75de7ab03c0522a5ea 0x440f5a79857cd632ae45439410969c3f4049cc41 $TOKYO_POOL $LIT_POOL; do
  row="  $A"
  for R in https://api.infra.mainnet.somnia.network https://api.infra.testnet.somnia.network https://api.hideki2.infra.testnet.somnia.network; do
    n=$(code_len "$A" "$R")
    row="$row $(printf '%-10s' $n)"
  done
  echo "$row"
done
echo "  (0xa936… WETH/USDso and 0x25bf… WBTC/USDso are the pairs the testnet /markets page lists; 0x440f… is a dreamDEX ADA perp on Shannon)"
