#!/usr/bin/env node
// Read-only. Signs in to the perps REST API with a fresh throwaway key, asks it to prepare perp market and limit orders, and
// simulates the prepared calldata (eth_call, nothing is sent) from accounts that hold a live position, whose side is read from the indexer.
// npm install viem@2.57.7   node rest_perp_market_order_matrix.mjs
import { createPublicClient, http, keccak256, toHex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
const API = "https://api.testnet.dreamdex.io/v0", DOMAIN = "api.testnet.dreamdex.io", CHAIN = 50312;
const RPC = "https://api.infra.testnet.somnia.network", IDX = "https://dev.smk.somnia.host/v1/graphql";
const UA = { "user-agent": "curl/8" };
const acct = privateKeyToAccount(generatePrivateKey());
const nonce = (await (await fetch(`${API}/auth/nonce`, { headers: UA })).json()).nonce;
const message = `${DOMAIN} wants you to sign in with your Ethereum account:\n${acct.address}\n\nSign in to dreamDEX\n\nURI: https://${DOMAIN}\nVersion: 1\nChain ID: ${CHAIN}\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;
const signature = await acct.signMessage({ message });
const { token } = await (await fetch(`${API}/auth/login`, { method: "POST", headers: { ...UA, "content-type": "application/json" }, body: JSON.stringify({ message, signature }) })).json();
const H = { ...UA, authorization: `Bearer ${token}`, "content-type": "application/json" };
const c = createPublicClient({ transport: http(RPC) });
const gql = async (s) => (await (await fetch(IDX, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: s }) })).json()).data;
const prep = async (sym, body) => { const r = await fetch(`${API}/markets/${sym}/orders?kind=perp`, { method: "POST", headers: H, body: JSON.stringify({ fundingSource: "marginBank", ...body }) }); return { http: r.status, ...(await r.json()) }; };
const markets = (await (await fetch(`${API}/markets?kind=perp`, { headers: UA })).json()).markets;
const sim = async (from, tx) => { try { await c.call({ account: from, to: tx.to, data: tx.data, gas: 30000000n }); return "ok"; } catch (e) { const d = e?.walk?.((x) => typeof x?.data === "string")?.data ?? ""; return d.startsWith("0x4e487b71") ? `Panic(0x${d.slice(-2)})` : (d.slice(0, 10) || "revert"); } };
console.log("checked", new Date().toISOString(), "account used for the API only:", acct.address);
const total = {};
for (const sym of (process.argv[2] ?? "WETH:USDso,SOL:USDso,ADA:USDso").split(",")) {
  const m = markets.find((x) => x.symbol === sym);
  const px = Number(m.perp.markPrice), qty = String(Math.max(Number(m.minQuantity), Math.ceil(10 / px / Number(m.lotSize)) * Number(m.lotSize)));
  const q = Number(qty).toFixed(Math.max(0, (m.lotSize.split(".")[1] ?? "").length));
  const buy = await prep(sym, { type: "market", side: "buy", amount: q });
  const sell = await prep(sym, { type: "market", side: "sell", amount: q });
  const tick = Number(m.tickSize), dp = (m.tickSize.split(".")[1] ?? "").length;
  const lim = await prep(sym, { type: "limit", side: "buy", amount: q, price: (Math.round(px * 1.05 / tick) * tick).toFixed(dp) });
  console.log(`\n${sym} amount ${q}: market buy http ${buy.http} data ${(buy.data ?? "").slice(0, 10)}, market sell http ${sell.http}, limit(+5%) http ${lim.http}`);
  const rows = (await gql(`{ PerpPosition(limit:30, order_by:{updatedAt:desc}, where:{pool:{_eq:"${m.contract.toLowerCase()}"}}) { account size isLong } }`)).PerpPosition;
  for (const r of rows) {
    const side = BigInt(r.size) === 0n ? "flat" : r.isLong ? "long" : "short";
    const [a, b, l] = [await sim(r.account, buy), await sim(r.account, sell), await sim(r.account, lim)];
    const k = `${side.padEnd(5)} market buy ${a.padEnd(12)} market sell ${b.padEnd(12)} limit+5% ${l}`;
    total[k] = (total[k] ?? 0) + 1;
  }
}
console.log("\ncount | position | market buy | market sell | limit +5% (same size, same account)");
for (const [k, v] of Object.entries(total).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k);
