// Read-only repro: `trades` channel snapshot vs the Real-Time Feed docs ("Contains the most recent trades up to
// the requested limit (default 100). Trades are ordered by timestamp descending (newest first).", `trades` array
// required) and vs the same host's REST trades endpoint. Usage: node trades_snapshot_repro.mjs [wsUrl] [restBase] [symbol]
const WSURL = process.argv[2] ?? "wss://stg.api.dreamdex.io/v0/ws/public";
const REST = process.argv[3] ?? "https://stg.api.dreamdex.io/v0";
const SYM = process.argv[4] ?? "SOMI:USDso";
const ts = () => new Date().toISOString();
const iso = (ms) => new Date(Number(ms)).toISOString().slice(11, 23);
const r = await fetch(`${REST}/markets/${encodeURIComponent(SYM)}/trades?limit=100`);
const body = await r.json().catch(() => null);
const rows = Array.isArray(body) ? body : (body?.trades ?? body?.data ?? []);
const rts = rows.map(x => Number(x.timestamp));
console.log(ts(), `REST GET ${REST}/markets/${SYM}/trades?limit=100 -> HTTP ${r.status}, ${rows.length} rows, newest ${iso(Math.max(...rts))}, oldest ${iso(Math.min(...rts))}, rows in the last 120 s: ${rts.filter(t => t > Date.now() - 120000).length}`);
const lims = [1, 3, 10, 100, undefined];
let i = 0;
const ws = new WebSocket(WSURL);
const sub = () => { const p = { symbols: [SYM], ...(lims[i] === undefined ? {} : { limit: lims[i] }) }; const m = { operation: "subscribe", channel: "trades", params: p }; console.log(ts(), ">>", JSON.stringify(m)); ws.send(JSON.stringify(m)); };
ws.onopen = sub;
ws.onmessage = (ev) => {
  const s = String(ev.data); const j = JSON.parse(s);
  if (j.type === "snapshot" && j.channel === "trades") {
    const tr = j.trades;
    if (!Array.isArray(tr)) console.log(ts(), `<< snapshot limit=${lims[i]}: trades = ${JSON.stringify(tr)}  raw ${s.slice(0, 160)}`);
    else {
      const t = tr.map(x => x.timestamp);
      const order = tr.length < 2 ? "n/a" : t.every((v, k) => k === 0 || t[k - 1] >= v) ? "DESC (newest first)" : t.every((v, k) => k === 0 || t[k - 1] <= v) ? "ASC (oldest first)" : "MIXED";
      const inRest = tr.filter(x => rows.some(y => String(y.id) === String(x.id))).length;
      console.log(ts(), `<< snapshot limit=${lims[i]}: ${tr.length} trades, order ${order}, first ${tr.length ? iso(t[0]) : "-"} last ${tr.length ? iso(t.at(-1)) : "-"}, ids e.g. ${tr.slice(0, 2).map(x => x.id).join(", ")}, ids also in REST: ${inRest}/${tr.length}`);
    }
    ws.send(JSON.stringify({ operation: "unsubscribe", channel: "trades", params: { symbols: [SYM] } }));
  } else if (j.type === "unsubscribed") { i++; if (i >= lims.length) { ws.close(1000); return; } setTimeout(sub, 400); }
  else if (j.type === "error") { console.log(ts(), "<<", s); i++; if (i < lims.length) setTimeout(sub, 400); else ws.close(1000); }
};
ws.onclose = () => { console.log(ts(), "REST id examples:", rows.slice(0, 2).map(x => x.id).join(", ")); process.exit(0); };
setTimeout(() => process.exit(0), 25000);
