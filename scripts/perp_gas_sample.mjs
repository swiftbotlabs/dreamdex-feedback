// Sample recent OrderPlaced txs on perp pools and print what their senders paid (gas used x effective gas price).
// node scripts/perp_gas_sample.mjs <pool> [pool...]   (report 09)
import { createPublicClient, http, defineChain } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 60_000 }) });
const pools = process.argv.slice(2);
const head = await c.getBlockNumber();
const PLACED = "0xd90f62f61ee2f606b132cfdfd883ddd079228b6fd6bffd9d7cf848daf824639d";
const txs = new Map();
for (const p of pools) for (let k = 0n; k < 6n && txs.size < 120; k++) {
  const to = head - k * 1000n, from = to - 999n;
  const logs = await c.request({ method: "eth_getLogs", params: [{ address: p, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16), topics: [PLACED] }] });
  for (const l of logs) { const e = txs.get(l.transactionHash) ?? { pool: p, n: 0 }; e.n++; txs.set(l.transactionHash, e); }
}
const rows = [];
for (const [h, e] of [...txs].slice(0, 80)) {
  const [r, t] = await Promise.all([c.getTransactionReceipt({ hash: h }), c.getTransaction({ hash: h })]);
  rows.push({ h, pool: e.pool.slice(0, 8), orders: e.n, sel: t.input.slice(0, 10), to: t.to.slice(0, 8), from: t.from, gas: Number(r.gasUsed), gwei: Number(r.effectiveGasPrice) / 1e9, type: t.type, stt: Number(r.gasUsed * r.effectiveGasPrice) / 1e18, stt6: Number(r.gasUsed) * 6e9 / 1e18 });
}
rows.sort((a, b) => a.stt - b.stt);
const single = rows.filter(r => r.orders === 1);
console.log("head", head, "txs", rows.length, "single-order txs", single.length);
const q = (a, f) => a.length ? a[Math.floor(f * (a.length - 1))].stt.toFixed(5) : "-";
console.log("single-order STT cost: min", q(single, 0), "p50", q(single, 0.5), "p90", q(single, 0.9), "max", q(single, 1), "over 0.003:", single.filter(r => r.stt > 0.003).length);
const bySel = {}; for (const r of rows) (bySel[r.sel + " to " + r.to] ??= []).push(r);
for (const [k, v] of Object.entries(bySel)) console.log(k, "n", v.length, "orders/tx", [...new Set(v.map(x => x.orders))].join(","), "STT min", v[0].stt.toFixed(5), "max", v[v.length - 1].stt.toFixed(5), "senders", [...new Set(v.map(x => x.from))].length);
const bySender = {}; for (const r of rows) (bySender[r.from] ??= []).push(r);
for (const [f, v] of Object.entries(bySender)) console.log("sender", f, "txs", v.length, "type", [...new Set(v.map(x => x.type))].join(","), "gas price gwei", [...new Set(v.map(x => x.gwei))].join(","), "gasUsed min", Math.min(...v.map(x => x.gas)), "max", Math.max(...v.map(x => x.gas)), "paid STT min", Math.min(...v.map(x => x.stt)).toFixed(5), "max", Math.max(...v.map(x => x.stt)).toFixed(5), "same gas at 6 gwei: min", Math.min(...v.map(x => x.stt6)).toFixed(5), "max", Math.max(...v.map(x => x.stt6)).toFixed(5));
const blk = await c.getBlock(); console.log("latest block", blk.number.toString(), "baseFeePerGas", blk.baseFeePerGas.toString(), "eth_gasPrice", (await c.getGasPrice()).toString());
for (const r of single.slice(-3)) console.log("sample", r.h, r.gas, r.gwei, r.stt.toFixed(5), r.sel, r.from);
