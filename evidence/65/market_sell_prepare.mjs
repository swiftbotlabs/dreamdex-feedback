import { login } from "./siwe.mjs";
const e = { base: "https://api.dreamdex.io/v0", domain: "api.dreamdex.io", uri: "https://api.dreamdex.io", chainId: 5031 };
const l = await login(e); const H = { authorization: `Bearer ${l.token}`, "content-type": "application/json", "user-agent": "Mozilla/5.0" };
const word = (d, i) => BigInt("0x" + d.slice(10 + 64 * i, 10 + 64 * (i + 1)));
for (const [sym, body] of [
  ["USDC.e:USDso", { type: "market", side: "sell", amount: "1" }],
  ["USDC.e:USDso", { type: "market", side: "sell", amount: "1", price: "0.99" }],
  ["USDC.e:USDso", { type: "market", side: "sell", amount: "1", slippageBps: 10 }],
  ["WETH:USDso", { type: "market", side: "sell", amount: "0.01", slippageBps: 10 }],
  ["WETH:USDso", { type: "market", side: "sell", amount: "0.01", fundingSource: "vault" }],
  ["WETH:USDso", { type: "market", side: "buy", amount: "0.01", slippageBps: 10 }],
  ["WETH:USDso", { type: "market", side: "buy", amount: "0.01", price: "2300" }],
]) {
  const r = await fetch(`${e.base}/markets/${sym}/orders`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(sym, JSON.stringify(body), r.status, j.name ?? "", j.data ? `price word ${Number(word(j.data, 2)) / 1e18} orderType ${word(j.data, 5)}` : (j.description ?? "").slice(0, 120));
}
const ob = await (await fetch(`${e.base}/orderbooks?symbols=WETH:USDso`, { headers: { "user-agent": "curl/8" } })).json();
console.log("WETH best bid", ob.orderbooks[0].bids[0], "best ask", ob.orderbooks[0].asks[0]);
