// Read-only check: one subscribe for all 3 stg markets with a given limit; prints per-symbol snapshot counts + time ranges.
// Usage: node trades_snapshot_multisymbol.mjs <wsUrl> <limit>
const [WSURL, LIM] = process.argv.slice(2);
const SYMS = ["SOMI:USDso", "WETH:USDso", "WBTC:USDso"];
const now = () => new Date().toISOString();
const hms = (ms) => new Date(Number(ms)).toISOString().slice(11, 23);
const ws = new WebSocket(WSURL);
const got = {};
ws.onopen = () => { const m = { operation: "subscribe", channel: "trades", params: { symbols: SYMS, limit: Number(LIM) } }; console.log(now(), ">>", JSON.stringify(m)); ws.send(JSON.stringify(m)); };
ws.onmessage = (ev) => {
  const j = JSON.parse(String(ev.data));
  if (j.channel === "trades" && j.type === "snapshot") {
    const tr = j.trades; const t = Array.isArray(tr) ? tr.map(x => x.timestamp) : [];
    got[j.symbol] = Array.isArray(tr) ? tr.length : String(tr);
    console.log(now(), `<< ${j.symbol} limit=${LIM}: ${Array.isArray(tr) ? tr.length + " trades" : "trades=" + JSON.stringify(tr)}${t.length ? `, ${hms(Math.min(...t))}..${hms(Math.max(...t))}` : ""}`);
    if (Object.keys(got).length === SYMS.length) { const sum = Object.values(got).reduce((a, v) => a + (typeof v === "number" ? v : 0), 0); console.log(now(), `sum over symbols = ${sum} (limit ${LIM})`); ws.close(1000); }
  } else if (j.type === "error") { console.log(now(), "<<", JSON.stringify(j)); }
};
ws.onclose = () => process.exit(0);
setTimeout(() => { console.log(now(), "timeout; got", JSON.stringify(got)); process.exit(0); }, 10000);
