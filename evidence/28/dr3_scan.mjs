// Every perp stop the indexer records as dropped with ReduceOnlyBelowMinQty (dropReason 3): find its
// PendingOrderTriggered log on chain, then read the owner's position, getReducingCapacity and the pool minimum at the
// parent block, and the position at the firing block. Read-only.
// usage: node dr3_scan.mjs [out.jsonl]
import { createPublicClient, http, parseAbi, parseAbiItem, formatUnits } from "viem";
import fs from "node:fs";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const IDX = "https://hideki-dev.smk.somnia.host/v1/graphql";
const MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const c = createPublicClient({ transport: http(RPC, { timeout: 30_000, retryCount: 2 }) });
const trigEv = parseAbiItem("event PendingOrderTriggered(uint128 indexed pendingOrderId, bool success, uint8 dropReason, uint128 indexed placedOrderId)");
const poolAbi = parseAbi([
  "function getReducingCapacity(address account) view returns ((int128 positionSize, uint256 pendingBidQuantity, uint256 pendingAskQuantity, uint256 pendingOppositeQuantity, uint256 effectiveReducingCapacity) capacity)",
  "function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))",
]);
const mbAbi = parseAbi(["function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))"]);
const tokAbi = parseAbi(["function decimals() view returns (uint8)"]);
const abs = (x) => (x < 0n ? -x : x);
const outFile = process.argv[2];

const gql = async (query, variables) => (await (await fetch(IDX, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) })).json());
const rows = [];
for (let off = 0; ; off += 200) {
  const j = await gql(`query($o:Int!){ StopOrder(where:{dropReason:{_eq:3}}, order_by:[{updatedAt:asc},{id:asc}], limit:200, offset:$o){ id registry orderIdRaw owner isBid quantity triggerPrice triggerOperator status dropReason updatedAt market{ poolAddress baseSymbol baseToken } } }`, { o: off });
  if (j.errors) { console.error(JSON.stringify(j.errors)); process.exit(1); }
  rows.push(...j.data.StopOrder);
  if (j.data.StopOrder.length < 200) break;
}
const meta = (await gql(`{ chain_metadata { chain_id latest_processed_block } }`, {})).data.chain_metadata;
console.log(`run ${new Date().toISOString()}; indexer ${JSON.stringify(meta)}; StopOrder rows with dropReason 3: ${rows.length}`);

// timestamp -> first block with timestamp >= t (interpolation search, then bisection)
const tsCache = new Map();
const ts = async (b) => { if (!tsCache.has(b)) tsCache.set(b, Number((await c.getBlock({ blockNumber: BigInt(b) })).timestamp)); return tsCache.get(b); };
const headN = Number(await c.getBlockNumber());
async function blockAt(t) {
  let lo = 20_000_000, hi = headN;
  for (let i = 0; i < 6 && hi - lo > 64; i++) {
    const [tl, th] = [await ts(lo), await ts(hi)];
    let g = Math.round(lo + ((t - tl) / Math.max(1, th - tl)) * (hi - lo));
    g = Math.min(hi - 1, Math.max(lo + 1, g));
    if ((await ts(g)) < t) lo = g; else hi = g;
    const w = 2000; // tighten around the guess
    if (lo < g - w && (await ts(g - w)) < t) lo = g - w;
    if (hi > g + w && (await ts(g + w)) >= t) hi = g + w;
  }
  while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if ((await ts(m)) < t) lo = m; else hi = m; }
  return hi;
}
const dec = new Map();
const out = [];
for (const r of rows) {
  const pool = r.market.poolAddress;
  if (!dec.has(r.market.baseToken)) dec.set(r.market.baseToken, await c.readContract({ address: r.market.baseToken, abi: tokAbi, functionName: "decimals" }));
  const d = dec.get(r.market.baseToken);
  const t = Number(r.updatedAt);
  const b0 = await blockAt(t);
  let log = null;
  for (const [a, z] of [[b0 - 50, b0 + 50], [b0 - 3000, b0 + 3000]]) {
    const ls = await c.getLogs({ address: r.registry, event: trigEv, args: { pendingOrderId: BigInt(r.orderIdRaw) }, fromBlock: BigInt(a), toBlock: BigInt(z) });
    if (ls.length) { log = ls[0]; break; }
  }
  if (!log) { const rec = { stop: r.orderIdRaw, sym: r.market.baseSymbol, error: "PendingOrderTriggered not found near " + b0 }; console.log(JSON.stringify(rec)); out.push(rec); continue; }
  const b = log.blockNumber, p = b - 1n;
  const [posB, posA, cap, params] = await Promise.all([
    c.readContract({ address: MB, abi: mbAbi, functionName: "getPosition", args: [r.owner, pool], blockNumber: p }),
    c.readContract({ address: MB, abi: mbAbi, functionName: "getPosition", args: [r.owner, pool], blockNumber: b }),
    c.readContract({ address: pool, abi: poolAbi, functionName: "getReducingCapacity", args: [r.owner], blockNumber: p }),
    c.readContract({ address: pool, abi: poolAbi, functionName: "getOrderBookParameters", blockNumber: p }),
  ]);
  const qty = BigInt(r.quantity), pos = posB.size;
  const closingSideOk = pos !== 0n && ((pos > 0n) === (r.isBid === false));
  const want = qty === 0n ? abs(pos) : (qty < abs(pos) ? qty : abs(pos));
  const restingClosing = pos > 0n ? cap.pendingAskQuantity : cap.pendingBidQuantity;
  const f = (x) => (x < 0n ? "-" : "") + formatUnits(abs(x), d);
  const rec = {
    sym: r.market.baseSymbol, stop: r.orderIdRaw, owner: r.owner, kind: (r.isBid ? (r.triggerOperator === 0 ? "SL" : "TP") : (r.triggerOperator === 0 ? "TP" : "SL")),
    side: r.isBid ? "buy" : "sell", trigger: formatUnits(BigInt(r.triggerPrice), 18), op: r.triggerOperator === 0 ? "GTE" : "LTE", qty: f(qty),
    tx: log.transactionHash, block: Number(b), timeUtc: new Date(t * 1000).toISOString(), event: { success: log.args.success, dropReason: log.args.dropReason },
    positionBefore: f(pos), positionOnClosingSide: closingSideOk, minQuantity: f(params.minQuantity), restingClosingSide: f(restingClosing),
    effectiveReducingCapacity: f(cap.effectiveReducingCapacity), minQtyPosOverMinimum: Number((Number(formatUnits(want, d)) / Number(formatUnits(params.minQuantity, d))).toFixed(2)),
    restingCoversPosition: restingClosing >= abs(pos), positionAfter: f(posA.size), positionUnchanged: posA.size === pos,
  };
  console.log(JSON.stringify(rec));
  out.push(rec);
}
const ok = out.filter((x) => !x.error);
const n = (fn) => ok.filter(fn).length;
const ratios = ok.map((x) => x.minQtyPosOverMinimum).sort((a, b) => a - b);
console.log(`SUMMARY rows ${rows.length}, located on chain ${ok.length}; event dropReason 3: ${n((x) => x.event.dropReason === 3)}; position open on the stop's closing side: ${n((x) => x.positionOnClosingSide)}; effectiveReducingCapacity 0: ${n((x) => x.effectiveReducingCapacity === "0")}; resting closing-side orders >= |position|: ${n((x) => x.restingCoversPosition)}; position unchanged after: ${n((x) => x.positionUnchanged)}; SL ${n((x) => x.kind === "SL")} / TP ${n((x) => x.kind === "TP")}; min(qty,|pos|)/minQuantity from ${ratios[0]}x to ${ratios[ratios.length - 1]}x; first ${ok[0]?.timeUtc}, last ${ok[ok.length - 1]?.timeUtc}`);
if (outFile) fs.writeFileSync(outFile, out.map((x) => JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v))).join("\n") + "\n");
