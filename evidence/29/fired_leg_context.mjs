// Context reads for one case (read-only): beacon implementation at fire block and head, owner's reducing capacity and
// resting orders at the parent block, asks/bids left on the book at <= the IOC limit right AFTER the fire (did the IOC
// exhaust the 5% band?), the owner's position + live stops now (indexer listing, each PENDING id re-checked on chain).
// usage: node fired_leg_context.mjs <case json written by fired_leg_case.mjs>
import { createPublicClient, http, parseAbi, defineChain, formatUnits, parseUnits } from "viem";
import { readFileSync } from "node:fs";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const IDX = "https://hideki-dev.smk.somnia.host/v1/graphql";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000, retryCount: 2 }) });
const MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const A = {
  beacon: parseAbi(["function implementation() view returns (address)"]),
  cap: parseAbi(["function getReducingCapacity(address account) view returns ((int128 positionSize, uint256 pendingBidQuantity, uint256 pendingAskQuantity, uint256 pendingOppositeQuantity, uint256 effectiveReducingCapacity) capacity)"]),
  book: parseAbi(["function getAllOpenOrdersOffChain(bool isBid, uint256 maxCount, uint64 startCursor) view returns ((uint128 orderId, bool isBid, address owner, uint64 userData, uint256 price, uint256 fullQuantity, uint256 quantityRemaining, uint64 expireTimestampNs)[] orders, bool hasMoreOrders, uint64 nextCursor)"]),
  bank: parseAbi(["function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))"]),
  reg: parseAbi(["function getPendingOrder(uint128 orderId) view returns (bool live, (((bool isBid, address owner, uint64 userData, uint256 quantity) order, uint8 orderType, uint256 triggerPrice, uint8 triggerOperator, uint256 limitPrice, address builder, uint96 builderFeeBpsTimes1k) orderWithTrigger, uint128 orderId, uint256 somiPaid, uint128 siblingOrderId, uint8 intent) order)"]),
  pool: parseAbi(["function tryGetMarkPrice() view returns (bool ok, uint256 price)"]),
};
const J = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)));
const gql = async (query, variables) => (await (await fetch(IDX, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) })).json());
const d = JSON.parse(readFileSync(process.argv[2], "utf8"));
const BD = d.baseDecimals, fq = (v) => formatUnits(BigInt(v), BD), f18 = (v) => formatUnits(BigInt(v), 18);
const b = BigInt(d.block), pb = b - 1n;
const beacon = "0x" + d.registryBeaconSlotAtBlock.slice(-40);
const head = await c.getBlock();
const [implAt, implHead] = await Promise.all([
  c.readContract({ address: beacon, abi: A.beacon, functionName: "implementation", blockNumber: b }),
  c.readContract({ address: beacon, abi: A.beacon, functionName: "implementation", blockNumber: head.number })]);
const cap = await c.readContract({ address: d.pool, abi: A.cap, functionName: "getReducingCapacity", args: [d.owner], blockNumber: pb });
async function side(isBid, blockNumber) {
  const out = []; let cur = 0n;
  for (let k = 0; k < 20; k++) { const [os, more, next] = await c.readContract({ address: d.pool, abi: A.book, functionName: "getAllOpenOrdersOffChain", args: [isBid, 500n, cur], blockNumber }); out.push(...os); if (!more) break; cur = next; }
  return out;
}
const placed = d.placedOrderFromOrderPlaced, limit = parseUnits(placed.price, 18);
const isBid = placed.isBid; // the stop's IOC side; it takes from the opposite side
const oppBefore = await side(!isBid, pb), oppAfter = await side(!isBid, b);
const within = (os) => os.filter((o) => (isBid ? o.price <= limit : o.price >= limit));
const sumQ = (os) => os.reduce((s, o) => s + o.quantityRemaining, 0n);
const ownBefore = [...(await side(true, pb)), ...(await side(false, pb))].filter((o) => o.owner.toLowerCase() === d.owner.toLowerCase());
const best = (os) => os.length ? (isBid ? os.reduce((m, o) => (o.price < m ? o.price : m), os[0].price) : os.reduce((m, o) => (o.price > m ? o.price : m), os[0].price)) : null;
// now
const [posNow, markNow] = await Promise.all([
  c.readContract({ address: MB, abi: A.bank, functionName: "getPosition", args: [d.owner, d.pool], blockNumber: head.number }),
  c.readContract({ address: d.pool, abi: A.pool, functionName: "tryGetMarkPrice", blockNumber: head.number })]);
const q = await gql(`query($o:String!,$r:String!,$t:numeric!){ chain_metadata{latest_processed_block} StopOrder(where:{owner:{_eq:$o},registry:{_eq:$r},_or:[{status:{_eq:"PENDING"}},{createdAt:{_gte:$t}}]}, order_by:{createdAt:asc}){ orderIdRaw status isBid triggerOperator triggerPrice quantity createdAt updatedAt cancelReason } }`,
  { o: d.owner.toLowerCase(), r: d.registry.toLowerCase(), t: String(Math.floor(Date.parse(d.blockTimeUTC) / 1000)) });
const rows = q.data?.StopOrder ?? [];
const pendingChain = [];
for (const r of rows.filter((r) => r.status === "PENDING")) { const g = await c.readContract({ address: d.registry, abi: A.reg, functionName: "getPendingOrder", args: [BigInt(r.orderIdRaw)], blockNumber: head.number }); pendingChain.push({ id: r.orderIdRaw, live: g[0] }); }
console.log(JSON.stringify(J({
  case: process.argv[2].split("/").pop(), headBlock: head.number, headTimeUTC: new Date(Number(head.timestamp) * 1000).toISOString(),
  beacon, implementationAtFireBlock: implAt, implementationAtHead: implHead,
  parentBlock: { reducingCapacity: { positionSize: fq(cap.positionSize), pendingBid: fq(cap.pendingBidQuantity), pendingAsk: fq(cap.pendingAskQuantity), pendingOpposite: fq(cap.pendingOppositeQuantity), effective: fq(cap.effectiveReducingCapacity) }, ownerRestingOrders: ownBefore.length },
  iocLimit: f18(limit), iocSideIsBid: isBid,
  oppositeBookWithinLimit_before: { orders: within(oppBefore).length, qty: fq(sumQ(within(oppBefore))), bestPrice: best(oppBefore) && f18(best(oppBefore)) },
  oppositeBookWithinLimit_after: { orders: within(oppAfter).length, qty: fq(sumQ(within(oppAfter))), bestPrice: best(oppAfter) && f18(best(oppAfter)) },
  now: { position: fq(posNow.size), mark: f18(markNow[1]), indexerBlock: q.data?.chain_metadata, stopRowsSinceFireOrPending: rows.map((r) => ({ ...r, quantity: fq(r.quantity), triggerPrice: f18(r.triggerPrice), createdAtUTC: new Date(Number(r.createdAt) * 1000).toISOString() })), pendingRecheckedOnChain: pendingChain },
}), null, 1));
