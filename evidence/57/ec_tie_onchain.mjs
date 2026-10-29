// Read-only on-chain check of one Up/Down market that settled with the close equal to its opening price.
// usage: node tie_onchain.mjs <rpc> <marketContract> <oracleAnswerTx> <questionId> [fillTx] [holder] [noTokenId] [yesTokenId]
import { createPublicClient, http, defineChain, parseAbi, formatUnits } from "viem";
const [rpc, mkt, ansTx, qid, fillTx, holder, noId, yesId] = process.argv.slice(2);
const chainId = Number(await (await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) })).json().then(j => j.result));
const c = createPublicClient({ chain: defineChain({ id: chainId, name: "somnia", nativeCurrency: { name: "S", symbol: "S", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } }), transport: http(rpc, { timeout: 60_000 }) });
console.log("chainId", chainId, "at", new Date().toISOString());
const M = parseAbi(["function payoutNumerators() view returns (uint256[])", "function isResolved() view returns (bool)", "function isVoided() view returns (bool)", "function expiry() view returns (uint64)", "function outcomeToken() view returns (address)"]);
const rd = async fn => { try { return await c.readContract({ address: mkt, abi: M, functionName: fn }); } catch (e) { return "ERR " + (e.shortMessage || "").slice(0, 80); } };
const pn = await rd("payoutNumerators");
console.log(`market ${mkt}: isResolved ${await rd("isResolved")} isVoided ${await rd("isVoided")} expiry ${await rd("expiry")} payoutNumerators [${pn}] -> winning outcome index ${Array.isArray(pn) ? pn.findIndex(x => x > 0n) : "?"}`);
// oracle answer event: find the log whose topic1 is the question id; print outcome, value and the recorded question text
const r = await c.getTransactionReceipt({ hash: ansTx });
const qtopic = "0x" + BigInt(qid).toString(16).padStart(64, "0");
for (const l of r.logs) {
  if (l.topics[1]?.toLowerCase() !== qtopic) continue;
  const d = l.data.slice(2), w = i => BigInt("0x" + d.slice(i * 64, i * 64 + 64));
  const strOff = Number(w(1)) / 32, len = Number(w(strOff));
  const text = Buffer.from(d.slice((strOff + 1) * 64, (strOff + 1) * 64 + len * 2), "hex").toString("utf8");
  console.log(`oracle answer log ${l.logIndex} at ${l.address} (tx ${ansTx}, block ${r.blockNumber}, status ${r.status}):`);
  console.log(`  topic0 ${l.topics[0]}\n  question id ${qid}\n  word0 (outcome index) ${w(0)}  word2 (value, 2 dp) ${w(2)} = ${(Number(w(2)) / 100).toFixed(2)}\n  recorded question: "${text}"`);
}
if (fillTx) {
  const f = await c.getTransactionReceipt({ hash: fillTx }); const t = await c.getTransaction({ hash: fillTx });
  const blk = await c.getBlock({ blockNumber: f.blockNumber });
  console.log(`fill tx ${fillTx}: status ${f.status}, block ${f.blockNumber} (${new Date(Number(blk.timestamp) * 1000).toISOString()}), from ${t.from}, logs ${f.logs.length}`);
}
if (holder && noId) {
  const tok = await rd("outcomeToken");
  const E = parseAbi(["function balanceOf(address account, uint256 id) view returns (uint256)"]);
  for (const [n, id] of [["NO (Down)", noId], ["YES (Up)", yesId]]) if (id) console.log(`  ${holder} ${n} balance on ${tok}: ${formatUnits(await c.readContract({ address: tok, abi: E, functionName: "balanceOf", args: [holder, BigInt(id)] }), 18)}`);
}
