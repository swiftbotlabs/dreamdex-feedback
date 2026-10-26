// Sends one dreamDEX-style order subscribe frame to the Somnia Tokyo (Hideki) node WebSocket and prints the reply. Read-only.
const url = process.argv[2] ?? "wss://api.hideki2.infra.testnet.somnia.network/ws";
const ts = () => new Date().toISOString();
const ws = new WebSocket(url);
ws.onopen = () => { const m = { operation: "subscribe", channel: "order", params: { symbol: "BTC-PERP", orderId: "1" } }; console.log(ts(), "open", url); console.log(ts(), ">>", JSON.stringify(m)); ws.send(JSON.stringify(m)); };
ws.onmessage = (e) => { console.log(ts(), "<<", String(e.data).slice(0, 400)); };
ws.onerror = (e) => console.log(ts(), "ws error", e.message ?? "");
setTimeout(() => { try { ws.close(1000); } catch {} setTimeout(() => process.exit(0), 200); }, 5000);
