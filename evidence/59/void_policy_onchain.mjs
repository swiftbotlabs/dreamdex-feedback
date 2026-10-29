// Read-only: voidPolicy(), isVoided(), payoutNumerators() of Event Contract markets on chain.
// usage: node void_policy_onchain.mjs <rpc> <market> [market...]
import { createPublicClient, http, defineChain, parseAbi } from "viem";
const [rpc, ...mkts] = process.argv.slice(2);
const chainId = Number(await (await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) })).json().then(j => j.result));
const c = createPublicClient({ chain: defineChain({ id: chainId, name: "somnia", nativeCurrency: { name: "S", symbol: "S", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } }), transport: http(rpc, { timeout: 60_000 }) });
const A = parseAbi(["function voidPolicy() view returns (uint8)", "function isVoided() view returns (bool)", "function isResolved() view returns (bool)", "function payoutNumerators() view returns (uint256[])", "function status() view returns (uint8)", "function expiry() view returns (uint64)"]);
console.log("chainId", chainId, "block", await c.getBlockNumber(), new Date().toISOString());
for (const m of mkts) {
  const r = async fn => { try { const v = await c.readContract({ address: m, abi: A, functionName: fn }); return Array.isArray(v) ? `[${v.join(",")}]` : String(v); } catch (e) { return "ERR"; } };
  console.log(m, "voidPolicy", await r("voidPolicy"), "status", await r("status"), "isVoided", await r("isVoided"), "isResolved", await r("isResolved"), "payoutNumerators", await r("payoutNumerators"), "expiry", await r("expiry"));
}
