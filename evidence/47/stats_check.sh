#!/bin/bash
# Read-only: /api/v2/stats on new.explorer.somnia.network vs explorer.somnia.network (Blockscout v10.2.6, same chain 5031)
F='total_blocks total_transactions total_addresses total_gas_used transactions_today gas_used_today average_block_time'
for base in https://new.explorer.somnia.network https://explorer.somnia.network; do
  H=$(mktemp); B=$(curl -s --max-time 30 -D "$H" "$base/api/v2/stats"); C=$(head -1 "$H" | tr -d '\r'); XB=$(grep -i '^x-api-backend' "$H" | tr -d '\r' | cut -d' ' -f2); rm -f "$H"
  echo "== $(date -u +%FT%TZ) GET $base/api/v2/stats -> $C (x-api-backend: ${XB:-none})"
  echo "$B" | python3 -c "import json,sys; d=json.load(sys.stdin); [print('   %-20s %r' % (k, d.get(k))) for k in '$F'.split()]"
  sleep 1
done
echo "== $(date -u +%FT%TZ) GET https://new.explorer.somnia.network/api?module=stats&action=ethsupply -> $(curl -s --max-time 30 'https://new.explorer.somnia.network/api?module=stats&action=ethsupply' | head -c 200)"
