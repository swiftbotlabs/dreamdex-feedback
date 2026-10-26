// Read-only check (no keys, no txs): the docs' `order` subscribe examples on both testnet WebSocket hosts.
// Usage: node order_sub_verify.mjs
// 1) picks the newest order id that emitted OrderRested on the SOMI:USDso pool (Shannon 50312 RPC);
// 2) on each host, opens a FRESH connection per variant and sends exactly one subscribe frame;
//    records the first reply (or none within 6 s).
import { createPublicClient, http, toEventSelector, parseAbiItem } from "viem";

const POOL = "0x259fD6559214dd5aD3752322426eA9F9fABEFff4";
const RPC = "https://api.infra.testnet.somnia.network";
const HOSTS = [
  "wss://stg.api.dreamdex.io/v0/ws/public",   // docs Connection table: Testnet (Somnia Shannon)
  "wss://api.testnet.dreamdex.io/v0/ws",      // api.testnet async.json servers.testnet
];
const ts = () => new Date().toISOString();
const rested = toEventSelector(parseAbiItem("event OrderRested(uint128 indexed orderId)"));
const c = createPublicClient({ transport: http(RPC, { timeout: 30000 }) });
const head = await c.getBlockNumber();
const logs = await c.request({ method: "eth_getLogs", params: [{ address: POOL, topics: [rested], fromBlock: "0x" + (head - 900n).toString(16), toBlock: "0x" + head.toString(16) }] });
if (!logs.length) { console.log("no OrderRested logs in last 900 blocks"); process.exit(1); }
const last = logs.at(-1);
const id = BigInt(last.topics[1]);
const dec = id.toString(), hex = "0x" + id.toString(16);
console.log(ts(), `head ${head} OrderRested logs ${logs.length}; picked order ${dec} = ${hex} (block ${BigInt(last.blockNumber)}, tx ${last.transactionHash})`);

const variants = [
  ["d0 control {symbol, decimal}", { symbol: "SOMI:USDso", orderId: dec }],
  ["a docs step-2 {symbol, hex}", { symbol: "SOMI:USDso", orderId: hex }],
  ["b docs reference/QuickStart {hex only}", { orderId: hex }],
  ["c {decimal only}", { orderId: dec }],
  ["d1 control {symbol, decimal}", { symbol: "SOMI:USDso", orderId: dec }],
];

function one(url, label, params) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const frames = [];
    let done = false;
    const finish = (why) => { if (done) return; done = true; try { ws.close(1000); } catch {} resolve({ label, why, frames }); };
    ws.onopen = () => {
      const m = { operation: "subscribe", channel: "order", params };
      console.log(ts(), url, `>> ${label}:`, JSON.stringify(m));
      ws.send(JSON.stringify(m));
      setTimeout(() => finish("timeout 6s"), 6000);
    };
    ws.onmessage = (e) => {
      const s = String(e.data);
      console.log(ts(), url, `<< ${label}:`, s.slice(0, 400));
      frames.push(s);
      try { const j = JSON.parse(s); if (j.type === "error" || j.type === "subscribed") setTimeout(() => finish(j.type), j.type === "subscribed" ? 2500 : 300); } catch {}
    };
    ws.onerror = (e) => { console.log(ts(), url, "ws error", e?.message ?? ""); finish("ws error"); };
    ws.onclose = (e) => { if (!done) { console.log(ts(), url, "closed", e.code, e.reason); finish("closed " + e.code); } };
  });
}

const summary = {};
for (const url of HOSTS) {
  for (const [label, params] of variants) {
    const r = await one(url, label, params);
    const first = r.frames[0] ? JSON.parse(r.frames[0]) : null;
    (summary[url] ??= []).push(`${label} => ${first ? (first.type === "error" ? "ERROR " + first.errorName + ": " + first.message : first.type) : r.why}`);
    await new Promise((s) => setTimeout(s, 700));
  }
}
console.log(ts(), "SUMMARY order", dec, hex);
for (const [u, rows] of Object.entries(summary)) { console.log(u); for (const r of rows) console.log("   ", r); }
process.exit(0);
