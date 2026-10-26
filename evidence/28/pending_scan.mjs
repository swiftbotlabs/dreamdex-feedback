// Every perp stop the indexer lists as PENDING, checked at one pinned block: is the owner's position open on the
// stop's closing side, and is getReducingCapacity(owner).effectiveReducingCapacity below min(stop quantity, |position|)?
// Those stops would, if they fired at this block, close less than their size (or nothing, when capacity is 0).
// Read-only (multicall3 eth_call at a pinned block).
// usage: node pending_scan.mjs [out.jsonl]
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import fs from "node:fs";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const IDX = "https://hideki-dev.smk.somnia.host/v1/graphql";
const chain = { id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } } };
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 60_000, retryCount: 2 }) });
const capAbi = parseAbi([
  "function getReducingCapacity(address account) view returns ((int128 positionSize, uint256 pendingBidQuantity, uint256 pendingAskQuantity, uint256 pendingOppositeQuantity, uint256 effectiveReducingCapacity) capacity)",
  "function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))",
]);
const tokAbi = parseAbi(["function decimals() view returns (uint8)"]);
const abs = (x) => (x < 0n ? -x : x);
const gql = async (query, variables) => (await (await fetch(IDX, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) })).json());

const FACTORY = "0xE631fAEE547baeE07353E290f0562ea67d856560";
const fAbi = parseAbi(["function getPerpPoolStatuses() view returns ((address perpPool, address baseToken, bool restricted)[] statuses)", "function getStopOrderRegistry(address perpPool) view returns (address)"]);
const regs = [];
for (const s of await c.readContract({ address: FACTORY, abi: fAbi, functionName: "getPerpPoolStatuses" })) regs.push((await c.readContract({ address: FACTORY, abi: fAbi, functionName: "getStopOrderRegistry", args: [s.perpPool] })).toLowerCase());
const rows = [];
for (let off = 0; ; off += 500) {
  const j = await gql(`query($o:Int!,$r:[String!]){ StopOrder(where:{status:{_eq:"PENDING"}, registry:{_in:$r}}, order_by:[{createdAt:asc},{id:asc}], limit:500, offset:$o){ id registry orderIdRaw owner isBid quantity triggerPrice triggerOperator createdAt market{ poolAddress baseSymbol baseToken } } }`, { o: off, r: regs });
  if (j.errors) { console.error(JSON.stringify(j.errors)); process.exit(1); }
  rows.push(...j.data.StopOrder);
  if (j.data.StopOrder.length < 500) break;
}
const perp = rows.filter((r) => r.market && r.market.poolAddress);
const block = await c.getBlockNumber();
const bt = (await c.getBlock({ blockNumber: block })).timestamp;
const meta = (await gql(`{ chain_metadata { latest_processed_block } }`, {})).data.chain_metadata;
console.log(`run ${new Date().toISOString()}; pinned block ${block} (${new Date(Number(bt) * 1000).toISOString()}); indexer ${JSON.stringify(meta)}; PENDING stop rows on the ${regs.length} perp registries: ${perp.length}`);

const keys = [...new Set(perp.map((r) => r.market.poolAddress.toLowerCase() + "|" + r.owner.toLowerCase()))];
const caps = new Map();
for (let i = 0; i < keys.length; i += 100) {
  const part = keys.slice(i, i + 100);
  const res = await c.multicall({ blockNumber: block, allowFailure: true, contracts: part.map((k) => { const [pool, owner] = k.split("|"); return { address: pool, abi: capAbi, functionName: "getReducingCapacity", args: [owner] }; }) });
  part.forEach((k, n) => caps.set(k, res[n]));
}
const pools = [...new Set(perp.map((r) => r.market.poolAddress.toLowerCase()))];
const minQ = new Map(), dec = new Map();
for (const p of pools) minQ.set(p, (await c.readContract({ address: p, abi: capAbi, functionName: "getOrderBookParameters", blockNumber: block })).minQuantity);
for (const t of [...new Set(perp.map((r) => r.market.baseToken))]) dec.set(t, await c.readContract({ address: t, abi: tokAbi, functionName: "decimals" }));

const hits = [];
let fixedOnClosing = 0, zeroOnClosing = 0, zeroCut = 0, failed = 0;
for (const r of perp) {
  const k = r.market.poolAddress.toLowerCase() + "|" + r.owner.toLowerCase();
  const cr = caps.get(k);
  if (!cr || cr.status !== "success") { failed++; continue; }
  const cap = cr.result, pos = cap.positionSize, qty = BigInt(r.quantity);
  const closing = pos !== 0n && ((pos > 0n) === (r.isBid === false));
  if (!closing) continue;
  const want = qty === 0n ? abs(pos) : (qty < abs(pos) ? qty : abs(pos));
  const eff = cap.effectiveReducingCapacity;
  if (qty === 0n) { zeroOnClosing++; if (eff < want) zeroCut++; continue; }
  fixedOnClosing++;
  if (eff >= want) continue;
  const d = dec.get(r.market.baseToken), f = (x) => (x < 0n ? "-" : "") + formatUnits(abs(x), d);
  const mq = minQ.get(r.market.poolAddress.toLowerCase());
  const rec = { sym: r.market.baseSymbol, stop: r.orderIdRaw, registry: r.registry, owner: r.owner, kind: r.isBid ? (r.triggerOperator === 0 ? "SL" : "TP") : (r.triggerOperator === 0 ? "TP" : "SL"),
    side: r.isBid ? "buy" : "sell", trigger: formatUnits(BigInt(r.triggerPrice), 18), qty: f(qty), position: f(pos), restingClosingSide: f(pos > 0n ? cap.pendingAskQuantity : cap.pendingBidQuantity),
    effectiveReducingCapacity: f(eff), wouldPlace: eff < mq ? "nothing (dropReason 3)" : f(eff), createdUtc: new Date(Number(r.createdAt) * 1000).toISOString() };
  hits.push(rec);
  console.log(JSON.stringify(rec));
}
const owners = new Set(hits.map((h) => h.owner));
console.log(`SUMMARY pinned block ${block}: ${perp.length} PENDING stops; ${fixedOnClosing} fixed-size stops on the closing side of an open position; ${hits.length} of them (${owners.size} accounts, ${hits.filter((h) => h.kind === "SL").length} SL / ${hits.filter((h) => h.kind === "TP").length} TP) have capacity below min(qty, |position|); ${hits.filter((h) => h.wouldPlace.startsWith("nothing")).length} would place nothing. Quantity-0 stops on the closing side: ${zeroOnClosing} (${zeroCut} with capacity below |position|; not counted, behaviour at fire not shown). Failed reads: ${failed}`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], hits.map((x) => JSON.stringify(x)).join("\n") + "\n");
