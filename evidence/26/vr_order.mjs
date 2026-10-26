// Order-channel check (read-only, no keys). Usage:
//   node vr_order.mjs <wsUrl> <secs> <mode> [ids...]
// mode "fresh": find recent OrderRested ids on the SOMI:USDso SpotPool (Shannon) and subscribe to the newest 2
//               with 4 param shapes (symbol+hex, hex only [docs], decimal only, symbol+decimal [spec]).
// mode "ids":   subscribe {symbol, orderId:<decimal>} for each id given, plus hex-only shape for each.
// Logs every frame with UTC time and a per-id summary.
import { createPublicClient, http, parseAbi, toEventSelector } from "viem";
const [WSURL, SECS_S, MODE, ...IDS] = process.argv.slice(2);
const SECS = Number(SECS_S ?? 20);
const POOL = "0x259fD6559214dd5aD3752322426eA9F9fABEFff4";
const RPC = "https://api.infra.testnet.somnia.network";
const ts = () => new Date().toISOString();
let ids = IDS;
if (MODE === "fresh") {
  const c = createPublicClient({ transport: http(RPC, { timeout: 30000 }) });
  const head = await c.getBlockNumber();
  const t0 = toEventSelector(parseAbi(["event OrderRested(uint128 indexed orderId)"])[0]);
  const logs = await c.request({ method: "eth_getLogs", params: [{ address: POOL, topics: [t0], fromBlock: "0x" + (head - 300n).toString(16), toBlock: "0x" + head.toString(16) }] });
  console.log(ts(), "head", head.toString(), "OrderRested topic0", t0, "logs in last 300 blocks:", logs.length);
  const picked = logs.slice(-2);
  for (const l of picked) console.log(ts(), "  rested id", BigInt(l.topics[1]).toString(), "block", BigInt(l.blockNumber).toString(), "tx", l.transactionHash);
  ids = picked.map(l => BigInt(l.topics[1]).toString());
}
const reqs = [];
for (const id of ids) {
  const hex = "0x" + BigInt(id).toString(16);
  reqs.push([id, { symbol: "SOMI:USDso", orderId: id }]);
  reqs.push([id, { orderId: hex }]);
  if (MODE === "fresh") { reqs.push([id, { symbol: "SOMI:USDso", orderId: hex }]); reqs.push([id, { orderId: id }]); }
}
const per = {}; const all = { frames: 0, snapshotType: 0, withOrderObj: 0, withOrderStatus: 0, errors: 0 };
const norm = (x) => { try { return BigInt(x).toString(); } catch { return String(x); } };
const ws = new WebSocket(WSURL);
ws.onopen = () => {
  console.log(ts(), "open", WSURL);
  let i = 0; const step = () => { if (i >= reqs.length) return; const [, p] = reqs[i++]; const m = { operation: "subscribe", channel: "order", params: p }; console.log(ts(), ">>", JSON.stringify(m)); ws.send(JSON.stringify(m)); setTimeout(step, 700); }; step();
};
ws.onmessage = (e) => {
  const s = String(e.data); let j; try { j = JSON.parse(s); } catch { j = {}; }
  console.log(ts(), "<<", s.slice(0, 600));
  all.frames++;
  if (j.type === "error") all.errors++;
  if (j.channel === "order") {
    const k = norm(j.orderId ?? j.params?.orderId ?? j.order?.id ?? "?");
    const r = (per[k] ??= { subscribed: 0, snapshot: 0, update: 0, events: [], withOrderObj: 0, withOrderStatus: 0 });
    if (j.type === "subscribed") r.subscribed++;
    else if (j.type === "snapshot") { r.snapshot++; all.snapshotType++; }
    else if (j.type === "update") { r.update++; r.events.push(j.event); }
    if (j.order) { r.withOrderObj++; all.withOrderObj++; }
    if (j.order?.status || j.status) { r.withOrderStatus++; all.withOrderStatus++; }
  }
};
ws.onerror = (e) => console.log(ts(), "ws error", e.message ?? "");
ws.onclose = (e) => console.log(ts(), "closed", e.code, JSON.stringify(e.reason));
const pinger = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ operation: "ping" })), 20000);
setTimeout(() => {
  console.log(ts(), "SUMMARY", WSURL, JSON.stringify(all));
  for (const [k, v] of Object.entries(per)) console.log("  id", k, JSON.stringify(v));
  clearInterval(pinger); try { ws.close(1000); } catch {} setTimeout(() => process.exit(0), 300);
}, SECS * 1000);
