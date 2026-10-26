// Read-only repro: the WebSocket `order` channel vs the Real-Time Feed docs
// (https://app.dreamdex.io/docs/developers/websocket-api/real-time-feed) and each host's AsyncAPI spec
// (/.well-known/async.json). No keys, no transactions.
// Usage: node order_channel_repro.mjs [wsUrl] [seconds]
// 1) reads the last ~900 blocks of the SOMI:USDso SpotPool on Somnia Shannon (50312) and picks
//    R = an order that RESTED (OrderPlaced + OrderRested) and was later cancelled or filled, and
//    T = an order PLACED AND FULLY FILLED IN ONE TX (taker side of an OrderFilled, never rested);
// 2) subscribes with the exact param shapes the docs show + the spec shape:
//    a) docs "Order Lifecycle Tracking" step 2: {symbol, orderId:"0x<hex>"}
//    b) docs reference example + Order-tracking guide Option C: {orderId:"0x<hex>"} (no symbol)
//    c) {orderId:"<decimal>"} (no symbol)
//    d) spec example shape: {symbol, orderId:"<decimal>"}  (for R, and again for T)
// 3) prints every frame and checks order frames against the docs schema.
import { createPublicClient, http, toEventSelector, decodeEventLog, parseAbi } from "viem";
const WSURL = process.argv[2] ?? "wss://stg.api.dreamdex.io/v0/ws/public";
const SECS = Number(process.argv[3] ?? 25);
const POOL = "0x259fD6559214dd5aD3752322426eA9F9fABEFff4"; // SOMI:USDso "contract" (GET /v0/markets on both hosts)
const RPC = "https://api.infra.testnet.somnia.network";      // Shannon RPC from the dreamDEX Contracts page
const abi = parseAbi([
  "event OrderPlaced(uint128 indexed orderId, (uint128 orderId, bool isBid, address owner, uint64 userData, uint256 price, uint256 fullQuantity, uint256 quantityRemaining, uint64 expireTimestampNs) placedOrder)",
  "event OrderRested(uint128 indexed orderId)",
  "event OrderCancelled(uint128 indexed orderId)",
  "event OrderFilled(uint128 indexed takerOrderId, uint128 indexed makerOrderId, uint256 quantityFilled, uint256 takerRemainingQuantity, uint256 makerRemainingQuantity, uint256 fillPrice)",
]);
const T0 = { placed: toEventSelector(abi[0]), rested: toEventSelector(abi[1]), cancelled: toEventSelector(abi[2]), filled: toEventSelector(abi[3]) };
const ts = () => new Date().toISOString();
const c = createPublicClient({ transport: http(RPC, { timeout: 30000 }) });
const head = await c.getBlockNumber();
const logs = await c.request({ method: "eth_getLogs", params: [{ address: POOL, topics: [[T0.placed, T0.rested, T0.cancelled, T0.filled]], fromBlock: "0x" + (head - 900n).toString(16), toBlock: "0x" + head.toString(16) }] });
const hist = new Map(); // orderId -> [{ev, block, tx, logIndex}]
const add = (id, ev, l, extra = {}) => { const k = id.toString(); if (!hist.has(k)) hist.set(k, []); hist.get(k).push({ ev, block: Number(BigInt(l.blockNumber)), tx: l.transactionHash, li: Number(BigInt(l.logIndex)), ...extra }); };
for (const l of logs) {
  const d = decodeEventLog({ abi, data: l.data, topics: l.topics });
  if (d.eventName === "OrderPlaced") add(d.args.orderId, "placed", l, { qty: d.args.placedOrder.fullQuantity.toString(), price: d.args.placedOrder.price.toString() });
  else if (d.eventName === "OrderRested") add(d.args.orderId, "rested", l);
  else if (d.eventName === "OrderCancelled") add(d.args.orderId, "cancelled", l);
  else { add(d.args.takerOrderId, "filled(taker)", l, { q: d.args.quantityFilled.toString(), rem: d.args.takerRemainingQuantity.toString() }); add(d.args.makerOrderId, "filled(maker)", l, { q: d.args.quantityFilled.toString(), rem: d.args.makerRemainingQuantity.toString() }); }
}
const evs = (k) => hist.get(k).map(e => `${e.ev}@${e.block}#${e.li}`.replace(/@.*/, "")); // chain order (block, logIndex)
const ids = [...hist.keys()];
// R: placed + rested + later terminal, most recent; T: placed + filled(taker) in the same tx, never rested, remaining 0
const R = ids.filter(k => { const e = evs(k); return e[0] === "placed" && e.includes("rested") && (e.includes("cancelled") || e.some(x => x.startsWith("filled"))); }).at(-1);
const T = ids.filter(k => { const h = hist.get(k); const p = h.find(e => e.ev === "placed"); return p && !evs(k).includes("rested") && h.some(e => e.ev === "filled(taker)" && e.tx === p.tx && e.rem === "0"); }).at(-1);
console.log(ts(), "Shannon head", head.toString(), "logs", logs.length, "orders", ids.length);
for (const [lab, k] of [["R", R], ["T", T]]) console.log(`  ${lab} ${k} (0x${BigInt(k).toString(16)}) chain:`, JSON.stringify(hist.get(k)));
const reqs = [
  ["a R docs step 2 {symbol, hex}", { symbol: "SOMI:USDso", orderId: "0x" + BigInt(R).toString(16) }],
  ["b R docs example {hex only}", { orderId: "0x" + BigInt(R).toString(16) }],
  ["c R {decimal only}", { orderId: R }],
  ["d R spec shape {symbol, decimal}", { symbol: "SOMI:USDso", orderId: R }],
  ["e T spec shape {symbol, decimal}", { symbol: "SOMI:USDso", orderId: T }],
];
const ws = new WebSocket(WSURL);
const stats = { orderSnapshotFrames: 0, orderUpdateFrames: 0, framesWithOrderObject: 0, framesWithOrderStatus: 0, events: {}, perOrderSequence: {} };
let k = 0;
const next = () => { if (k >= reqs.length) return; const [label, params] = reqs[k++]; const m = { operation: "subscribe", channel: "order", params }; console.log(ts(), `>> ${label}:`, JSON.stringify(m)); ws.send(JSON.stringify(m)); setTimeout(next, 1200); };
ws.onopen = () => { console.log(ts(), "open", WSURL); next(); };
const pinger = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ operation: "ping" })), 20000);
ws.onmessage = (e) => {
  const s = String(e.data); const j = JSON.parse(s); console.log(ts(), "<<", s.slice(0, 520));
  if (j.channel === "order" && j.type === "snapshot") stats.orderSnapshotFrames++;
  if (j.channel === "order" && j.type === "update") {
    stats.orderUpdateFrames++; if (j.order) stats.framesWithOrderObject++; if (j.order?.status) stats.framesWithOrderStatus++;
    stats.events[j.event] = (stats.events[j.event] ?? 0) + 1;
    (stats.perOrderSequence[j.orderId] ??= []).push(j.event);
  }
};
ws.onclose = (e) => console.log(ts(), "closed", e.code, JSON.stringify(e.reason));
setTimeout(() => {
  console.log(ts(), "SUMMARY", WSURL, JSON.stringify(stats));
  console.log("  docs expect: `order:snapshot` first, then `order:update` frames each carrying `order` {id, market, side, price, quantity, filled, status, createdAt, updatedAt}; terminal = order.status filled|cancelled");
  console.log("  chain order of events: R", JSON.stringify(evs(R)), "| T", JSON.stringify(evs(T)));
  clearInterval(pinger); ws.close(1000); setTimeout(() => process.exit(0), 300);
}, SECS * 1000);
