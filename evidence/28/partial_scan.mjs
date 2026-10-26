// The newest N perp stops the indexer records as TRIGGERED: compare the size the registry placed (Order.fullQuantity)
// with min(stop quantity, |position|) at the parent block; for every smaller placement, read getReducingCapacity at the
// parent block and the owner's position after. Read-only.
// usage: node partial_scan.mjs [N=1000] [out.jsonl]
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import fs from "node:fs";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const IDX = "https://hideki-dev.smk.somnia.host/v1/graphql";
const MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const c = createPublicClient({ transport: http(RPC, { timeout: 30_000, retryCount: 2 }) });
const capAbi = parseAbi(["function getReducingCapacity(address account) view returns ((int128 positionSize, uint256 pendingBidQuantity, uint256 pendingAskQuantity, uint256 pendingOppositeQuantity, uint256 effectiveReducingCapacity) capacity)"]);
const mbAbi = parseAbi(["function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))"]);
const tokAbi = parseAbi(["function decimals() view returns (uint8)"]);
const abs = (x) => (x < 0n ? -x : x);
const N = Number(process.argv[2] ?? 1000), outFile = process.argv[3];
const gql = async (query, variables) => (await (await fetch(IDX, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) })).json());

const rows = [];
for (let off = 0; rows.length < N; off += 200) {
  const j = await gql(`query($o:Int!,$l:Int!){ StopOrder(where:{status:{_eq:"TRIGGERED"}}, order_by:[{updatedAt:desc},{id:desc}], limit:$l, offset:$o){ id registry orderIdRaw owner isBid quantity triggerOperator placedOrderId updatedAt market{ poolAddress baseSymbol baseToken } } }`, { o: off, l: Math.min(200, N - rows.length) });
  if (j.errors) { console.error(JSON.stringify(j.errors)); process.exit(1); }
  rows.push(...j.data.StopOrder);
  if (j.data.StopOrder.length === 0) break;
}
const ids = rows.filter((r) => r.placedOrderId).map((r) => r.market.poolAddress.toLowerCase() + "_" + r.placedOrderId);
const orders = new Map();
for (let i = 0; i < ids.length; i += 200) {
  const j = await gql(`query($ids:[String!]){ Order(where:{id:{_in:$ids}}){ id fullQuantity filledQuantity placedAtBlock placedTxHash } }`, { ids: ids.slice(i, i + 200) });
  for (const o of j.data?.Order ?? []) orders.set(o.id, o);
}
console.log(`run ${new Date().toISOString()}; TRIGGERED stops read: ${rows.length}, newest ${new Date(Number(rows[0].updatedAt) * 1000).toISOString()}, oldest ${new Date(Number(rows[rows.length - 1].updatedAt) * 1000).toISOString()}; placed Order rows found: ${orders.size}`);
const dec = new Map();
const hits = [];
let checked = 0, missing = 0;
for (const r of rows) {
  const pool = r.market.poolAddress;
  const o = r.placedOrderId ? orders.get(pool.toLowerCase() + "_" + r.placedOrderId) : null;
  if (!o) { missing++; continue; }
  const b = BigInt(o.placedAtBlock);
  const pos = (await c.readContract({ address: MB, abi: mbAbi, functionName: "getPosition", args: [r.owner, pool], blockNumber: b - 1n })).size;
  checked++;
  const qty = BigInt(r.quantity), want = qty === 0n ? abs(pos) : (qty < abs(pos) ? qty : abs(pos));
  const placed = BigInt(o.fullQuantity);
  if (placed >= want) continue;
  if (!dec.has(r.market.baseToken)) dec.set(r.market.baseToken, await c.readContract({ address: r.market.baseToken, abi: tokAbi, functionName: "decimals" }));
  const d = dec.get(r.market.baseToken), f = (x) => (x < 0n ? "-" : "") + formatUnits(abs(x), d);
  const [cap, posA] = await Promise.all([
    c.readContract({ address: pool, abi: capAbi, functionName: "getReducingCapacity", args: [r.owner], blockNumber: b - 1n }),
    c.readContract({ address: MB, abi: mbAbi, functionName: "getPosition", args: [r.owner, pool], blockNumber: b }),
  ]);
  const rec = { sym: r.market.baseSymbol, stop: r.orderIdRaw, owner: r.owner, side: r.isBid ? "buy" : "sell", kind: r.isBid ? (r.triggerOperator === 0 ? "SL" : "TP") : (r.triggerOperator === 0 ? "TP" : "SL"),
    tx: o.placedTxHash, block: o.placedAtBlock, timeUtc: new Date(Number(r.updatedAt) * 1000).toISOString(), qty: f(qty), positionBefore: f(pos), minQtyPos: f(want), placed: f(placed), filled: f(BigInt(o.filledQuantity)),
    effectiveReducingCapacity: f(cap.effectiveReducingCapacity), restingClosingSide: f(pos > 0n ? cap.pendingAskQuantity : cap.pendingBidQuantity), placedEqualsCapacity: placed === cap.effectiveReducingCapacity, positionAfter: f(posA.size) };
  hits.push(rec);
  console.log(JSON.stringify(rec));
}
console.log(`SUMMARY checked ${checked} TRIGGERED stops with a placed order (${missing} without an Order row); placed < min(stop qty, |position|): ${hits.length}; of those placed == effectiveReducingCapacity: ${hits.filter((h) => h.placedEqualsCapacity).length}`);
if (outFile) fs.writeFileSync(outFile, hits.map((x) => JSON.stringify(x)).join("\n") + "\n");
