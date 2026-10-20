// Reproduces: report 07.
// Run:  node scripts/mark_lag.mjs
// Read-only: indexer Market.markPrice vs PerpPool.tryGetMarkPrice() for every perp market, with row age and difference in bps.
import { createPublicClient, http, defineChain, parseAbi, formatUnits } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const client = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const q = { query: `query { chain_metadata { latest_processed_block } Market(where:{marketType:{_eq:"PERP"}}, limit: 50) { baseSymbol poolAddress markPrice markPriceUpdatedAt indexPrice } }` };
const res = await fetch("https://hideki-dev.smk.somnia.host/v1/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(q) }).then(r => r.json());
const abi = parseAbi(["function tryGetMarkPrice() view returns (bool ok, uint256 price)"]);
const now = Math.floor(Date.now() / 1000);
const head = await client.getBlockNumber();
console.log("chain head", head.toString(), "indexer block", res.data.chain_metadata[0].latest_processed_block, "now", new Date(now * 1000).toISOString());
const rows = [];
for (const m of res.data.Market) {
  const [ok, p] = await client.readContract({ address: m.poolAddress, abi, functionName: "tryGetMarkPrice" });
  const idx = BigInt(m.markPrice ?? 0); const diffBps = idx > 0n ? Number((p - idx) * 10000n * 100n / idx) / 100 : null;
  rows.push({ sym: m.baseSymbol, chain: formatUnits(p, 18), indexer: formatUnits(idx, 18), ageSec: m.markPriceUpdatedAt ? now - Number(m.markPriceUpdatedAt) : null, diffBps });
}
rows.sort((a, b) => Math.abs(b.diffBps) - Math.abs(a.diffBps));
for (const r of rows) console.log(`${r.sym.padEnd(9)} chain ${r.chain.slice(0, 12).padEnd(12)} indexer ${r.indexer.slice(0, 12).padEnd(12)} indexerAge ${String(r.ageSec).padStart(6)}s  diff ${r.diffBps} bps`);
