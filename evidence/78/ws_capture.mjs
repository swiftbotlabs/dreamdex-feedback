// Record the public dreamDEX feed: trades + 1m ohlcv (and orderbook) for every spot market, every frame to <out>.jsonl
// with the local receive time. Node 22+ (built-in WebSocket), no dependencies.
// usage: node ws_capture.mjs <minutes> <out-prefix> [api.dreamdex.io|stg.api.dreamdex.io]
import fs from "node:fs";
const [mins, out, HOST = "api.dreamdex.io"] = [Number(process.argv[2] || 30), process.argv[3] || "capture", process.argv[4]];
const raw = fs.createWriteStream(out + ".jsonl");
const mk = await (await fetch(`https://${HOST}/v0/markets`)).json();
const syms = mk.markets.filter((m) => !m.kind || m.kind === "spot").map((m) => m.symbol);
const ws = new WebSocket(`wss://${HOST}/v0/ws/public`);
const send = (o) => ws.send(JSON.stringify(o));
ws.onopen = () => {
  send({ operation: "subscribe", channel: "orderbook", params: { symbols: syms } });
  send({ operation: "subscribe", channel: "trades", params: { symbols: syms, limit: 100 } });
  for (const s of syms) send({ operation: "subscribe", channel: "ohlcv", params: { symbol: s, timeframe: "1m" } });
  console.log(new Date().toISOString(), "open", syms.join(","));
};
ws.onclose = (e) => console.log(new Date().toISOString(), "CLOSE", e.code, e.reason);
ws.onmessage = (ev) => raw.write(JSON.stringify({ t: Date.now(), m: JSON.parse(ev.data) }) + "\n");
const ping = setInterval(() => { try { send({ operation: "ping" }); } catch {} }, 20000);
setTimeout(() => { clearInterval(ping); ws.close(); raw.end(() => process.exit(0)); }, mins * 60000);
