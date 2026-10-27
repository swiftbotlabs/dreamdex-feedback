#!/bin/bash
# Read-only: /api/v2/search on new.explorer.somnia.network vs explorer.somnia.network (Blockscout v10.2.6), same chain (5031).
# usage: bash search_check.sh <tx hash> <block number> <address> <token name>
TX=${1:-0x376f59f12e294b1ebf596c80bb6f1c7d0e7e26f895d01e18ebf69ec231fa4510}
BLK=${2:-449561818}
ADDR=${3:-0x00000022dA000002656c64D9eA6011ea952D008A}
NAME=${4:-USDso}
for q in "$TX" "$BLK" "$ADDR" "$NAME"; do
  for base in https://new.explorer.somnia.network https://explorer.somnia.network; do
    out=$(curl -s --max-time 30 -D /dev/stderr "$base/api/v2/search?q=$q" 2>/tmp/hdr.$$)
    xb=$(grep -i '^x-api-backend' /tmp/hdr.$$ | tr -d '\r' | cut -d' ' -f2)
    echo "== $(date -u +%FT%TZ) GET $base/api/v2/search?q=$q (x-api-backend: ${xb:-none})"
    echo "$out" | python3 -c "import json,sys; d=json.load(sys.stdin); its=d['items']; print('   items:',len(its),' types:',[i.get('type') for i in its][:8])"
    sleep 1
  done
done
rm -f /tmp/hdr.$$
echo "== $(date -u +%FT%TZ) for comparison, the new explorer's own redirect helper and search page:"
for q in "$TX" "$BLK" "$ADDR"; do
  echo "   GET /api/v2/search/check-redirect?q=$q -> $(curl -s --max-time 30 "https://new.explorer.somnia.network/api/v2/search/check-redirect?q=$q")"; sleep 1
  echo "   GET /search-results?q=$q -> $(curl -s --max-time 30 -o /dev/null -w '%{http_code} location: %{redirect_url}' "https://new.explorer.somnia.network/search-results?q=$q")"; sleep 1
done
echo "== $(date -u +%FT%TZ) quick search (the endpoint Blockscout front-ends use for the search drop-down):"
for q in "$TX" "$BLK" "$ADDR"; do
  for base in https://new.explorer.somnia.network https://explorer.somnia.network; do
    echo "   $base/api/v2/search/quick?q=$q -> $(curl -s --max-time 30 "$base/api/v2/search/quick?q=$q" | python3 -c "import json,sys; d=json.load(sys.stdin); d=d if isinstance(d,list) else d.get('items',[]); print(len(d),'items',[i.get('type') for i in d][:5])")"; sleep 1
  done
done
