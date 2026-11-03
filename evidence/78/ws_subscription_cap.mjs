// How many subscriptions one connection to the public feed accepts. Order ids are arbitrary decimals: the feed
// accepts an `order` subscription for any id, so no real order is needed. Node 22+, no dependencies.
// usage: node ws_subscription_cap.mjs [api.dreamdex.io|stg.api.dreamdex.io]
const HOST = process.argv[2] || "api.dreamdex.io";
const ids = Array.from({ length: 40 }, (_, i) => String(10n ** 21n + BigInt(i)));
async function run(label, pre, n) {
  return new Promise((res) => {
    const ws = new WebSocket(`wss://${HOST}/v0/ws/public`);
    const c = { order_subscribes_sent: 0, subscribed_order: 0, subscribed_other: 0, errors: 0, firstErrorAt: null, errorMsg: null }; let idx = 0;
    ws.onopen = () => {
      for (const p of pre) ws.send(JSON.stringify(p));
      for (const id of ids.slice(0, n)) { ws.send(JSON.stringify({ operation: "subscribe", channel: "order", params: { symbol: "SOMI:USDso", orderId: id } })); c.order_subscribes_sent++; }
    };
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
      if (m.type === "subscribed") { m.channel === "order" ? c.subscribed_order++ : c.subscribed_other++; idx++; }
      if (m.type === "error") { c.errors++; idx++; if (c.firstErrorAt === null) { c.firstErrorAt = idx; c.errorMsg = `${m.errorName}: ${m.message}`; } } };
    setTimeout(() => { ws.close(); console.log(label.padEnd(48), JSON.stringify(c)); res(); }, 6000);
  });
}
const md = [{ operation: "subscribe", channel: "orderbook", params: { symbols: ["SOMI:USDso", "WBTC:USDso"] } },
  { operation: "subscribe", channel: "trades", params: { symbols: ["SOMI:USDso"] } },
  { operation: "subscribe", channel: "ohlcv", params: { symbol: "SOMI:USDso", timeframe: "1m" } }];
console.log(new Date().toISOString(), HOST);
await run("32 order subscribes:", [], 32);
await run("33 order subscribes:", [], 33);
await run("40 order subscribes:", [], 40);
await run("3 market-data subscribes, then 40 order:", md, 40);
process.exit(0);
