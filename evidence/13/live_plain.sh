#!/bin/bash
# Inside the jail. LIVE: real kit perp-maker (commit 2579866) under plain `tsx` (= what `npm start -w perp-maker` runs), CONTROL,
# own-account mode for the throwaway bot key, XRP-PERP, small post-only quotes 1% away from the mark.
cd /w
export NETWORK=hideki DRY_RUN=false PERP_SYMBOL=XRP-PERP PERP_MM_NOTIONAL_USDSO=10 PERP_MM_LEVERAGE=10 PERP_MM_HALF_SPREAD_BPS=100 PERP_MM_REFRESH_MS=5000
log=/w/out/live_tsx_plain.log; : > "$log"
setsid /w/node_modules/.bin/tsx strategies/perp-maker/src/index.ts > "$log" 2>&1 < /dev/null &
pid=$!
for i in $(seq 1 1800); do [ "$(grep -c 'placed quote' "$log")" -ge 2 ] && break; grep -q -E "^MarginBank has|cannot open|Error|error" "$log" && break; sleep 0.1; done
sleep 3
{ echo "=== live tsx (plain, = npm start), pgid=$pid"; ps -o pid,pgid,ppid,args -g "$pid"; echo "SIGINT -> process group -$pid at $(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"; } > "$log.meta"
kill -INT -- "-$pid"
sleep 12
wait "$pid" 2>/dev/null; echo "leader exit status: $? at $(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)" >> "$log.meta"
cat "$log.meta"; echo "--- output:"; cat "$log"
