#!/usr/bin/env node
// Read-only. Asks the mainnet REST API to prepare a vault-funded market buy, then simulates it (eth_call, nothing is sent) from accounts that hold
// USDso in that pool's vault and run in manual vault mode, next to a vault-funded IOC limit buy of the same size at best ask + 5%.
// npm install viem@2.57.7   node rest_vault_market_buy.mjs
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
const API = "https://api.dreamdex.io/v0", DOMAIN = "api.dreamdex.io", CHAIN = 5031, USD = "0x00000022dA000002656c64D9eA6011ea952D008A";
const UA = { "user-agent": "curl/8" };
const acct = privateKeyToAccount(generatePrivateKey());
const nonce = (await (await fetch(`${API}/auth/nonce`, { headers: UA })).json()).nonce;
const message = `${DOMAIN} wants you to sign in with your Ethereum account:\n${acct.address}\n\nSign in to dreamDEX\n\nURI: https://${DOMAIN}\nVersion: 1\nChain ID: ${CHAIN}\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;
const signature = await acct.signMessage({ message });
const { token } = await (await fetch(`${API}/auth/login`, { method: "POST", headers: { ...UA, "content-type": "application/json" }, body: JSON.stringify({ message, signature }) })).json();
const H = { ...UA, authorization: `Bearer ${token}`, "content-type": "application/json" };
const c = createPublicClient({ transport: http("https://api.infra.mainnet.somnia.network") });
const gql = async (s) => (await (await fetch("https://prd.smk.somnia.host/v1/graphql", { method: "POST", headers: { ...UA, "content-type": "application/json" }, body: JSON.stringify({ query: s }) })).json()).data;
const abi = parseAbi(["function getWithdrawableBalance(address owner, address token) view returns (uint256)", "function manualVaultMode(address) view returns (bool)"]);
const markets = (await (await fetch(`${API}/markets`, { headers: UA })).json()).markets;
const books = Object.fromEntries((await (await fetch(`${API}/orderbooks?` + markets.map((m) => `symbols=${m.symbol}`).join("&"), { headers: UA })).json()).orderbooks.map((b) => [b.symbol, b]));
const sim = async (from, tx) => { try { await c.call({ account: from, to: tx.to, data: tx.data, gas: 30000000n }); return "ok"; } catch (e) { const d = e?.walk?.((x) => typeof x?.data === "string")?.data ?? ""; const n = { "0xcf479181": "InsufficientBalance", "0x6ffc9258": "SelfMatchCancelTaker" }[d.slice(0, 10)] ?? d.slice(0, 10); return d.startsWith("0xcf479181") ? `${n}(have ${formatUnits(BigInt("0x" + d.slice(10, 74)), 18)}, need ${BigInt("0x" + d.slice(74, 138)).toString().length} digits)` : n; } };
console.log("checked", new Date().toISOString());
const prep = async (sym, body) => (await (await fetch(`${API}/markets/${sym}/orders`, { method: "POST", headers: H, body: JSON.stringify(body) })).json());
for (const m of markets) {
  const ask = Number(books[m.symbol].asks[0].price), usd = 30, dp = (m.lotSize.split(".")[1] ?? "").length;
  const amt = Math.max(Number(m.minQuantity), Number(m.lotSize) * Math.ceil(usd / ask / Number(m.lotSize))).toFixed(dp);
  const tdp = (m.tickSize.split(".")[1] ?? "").length, lim = (Math.ceil(ask * 1.05 / Number(m.tickSize)) * Number(m.tickSize)).toFixed(tdp);
  const mkt = await prep(m.symbol, { type: "market", side: "buy", amount: amt, fundingSource: "vault" });
  const ioc = await prep(m.symbol, { type: "limit", side: "buy", amount: amt, price: lim, fundingSource: "vault", orderType: "immediateOrCancel" });
  const px = mkt.data ? BigInt("0x" + mkt.data.slice(138, 202)) : 0n;
  console.log(`\n${m.symbol} amount ${amt}: market buy price word has ${px.toString().length} digits; IOC limit ${lim} (prepare ${ioc.data ? "ok" : JSON.stringify(ioc).slice(0, 120)})`);
  const rows = (await gql(`{ Fill(limit:300, order_by:{timestamp:desc}, where:{market_id:{_eq:"${m.contract.toLowerCase()}"}}) { maker taker } }`)).Fill;
  const who = [...new Set(rows.flatMap((r) => [r.maker, r.taker]).filter(Boolean))].slice(0, 25);
  let n = 0;
  for (const a of who) {
    const b = await c.readContract({ address: m.contract, abi, functionName: "getWithdrawableBalance", args: [a, USD] }).catch(() => 0n);
    if (b < 100n * 10n ** 18n) continue;
    const a1 = await sim(a, mkt), a2 = ioc.data ? await sim(a, ioc) : "-";
    console.log(`  ${a} vault USDso ${formatUnits(b, 18)}: market buy -> ${a1} | IOC limit +5% -> ${a2}`);
    if (++n >= 5) break;
  }
}
