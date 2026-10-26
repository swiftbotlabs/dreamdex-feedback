// Read-only check of one fired perp TP/SL leg. No keys, no writes.
// ABIs copied as text from @somnia-chain/markets-sdk 0.32.1 (accountView/stopEvents.js, eventsAbi.js, tradeAbi.js);
// addresses from https://app.dreamdex.io/docs/developers/perps-testnet (fetched 2026-10-26 07:16 UTC).
// usage: node fired_leg_case.mjs <firing tx hash> <fired stop id>  > case_X.json
import { createPublicClient, http, parseAbi, decodeEventLog, defineChain, formatUnits } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const IDX = "https://hideki-dev.smk.somnia.host/v1/graphql";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000, retryCount: 2 }) });
const MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const regEv = parseAbi([
  "event PendingOrderCreated(uint128 indexed orderId, address indexed owner, bool isBid, uint256 quantity, uint256 triggerPrice, uint8 triggerOperator, uint8 orderType, address builder, uint96 builderFeeBpsTimes1k)",
  "event PendingOrderIntentSet(uint128 indexed orderId, uint8 intent)",
  "event PendingOrdersLinked(uint128 indexed gteOrderId, uint128 indexed lteOrderId, address indexed owner)",
  "event PendingOrderUnlinked(uint128 indexed orderId)",
  "event PendingOrderTriggered(uint128 indexed pendingOrderId, bool success, uint8 dropReason, uint128 indexed placedOrderId)",
  "event PendingOrderCancelled(uint128 indexed orderId)",
  "event LinkedOrderCancelled(uint128 indexed cancelledOrderId, uint128 indexed triggeredOrderId, address indexed owner, uint256 somiCredited)",
  "event InertOrderCancelled(uint128 indexed orderId, address indexed owner, uint256 somiCredited)",
]);
const obEv = [
  { type: "event", name: "OrderPlaced", inputs: [{ name: "orderId", type: "uint128", indexed: true }, { name: "placedOrder", type: "tuple", indexed: false, components: [
    { name: "orderId", type: "uint128" }, { name: "isBid", type: "bool" }, { name: "owner", type: "address" }, { name: "userData", type: "uint64" },
    { name: "price", type: "uint256" }, { name: "fullQuantity", type: "uint256" }, { name: "quantityRemaining", type: "uint256" }, { name: "expireTimestampNs", type: "uint64" }] }] },
  { type: "event", name: "OrderRested", inputs: [{ name: "orderId", type: "uint128", indexed: true }] },
  { type: "event", name: "OrderCancelled", inputs: [{ name: "orderId", type: "uint128", indexed: true }] },
  { type: "event", name: "OrderExpired", inputs: [{ name: "orderId", type: "uint128", indexed: true }] },
  { type: "event", name: "OrderReduced", inputs: [{ name: "orderId", type: "uint128", indexed: true }, { name: "newQuantity", type: "uint256", indexed: false }] },
  { type: "event", name: "OrderFilled", inputs: [{ name: "takerOrderId", type: "uint128", indexed: true }, { name: "makerOrderId", type: "uint128", indexed: true },
    { name: "quantityFilled", type: "uint256", indexed: false }, { name: "takerRemainingQuantity", type: "uint256", indexed: false }, { name: "makerRemainingQuantity", type: "uint256", indexed: false }, { name: "fillPrice", type: "uint256", indexed: false }] },
  { type: "event", name: "OrderCancelledSelfMatch", inputs: [{ name: "orderId", type: "uint128", indexed: true }] },
  { type: "event", name: "MakerOrderCancelledExceedsPosition", inputs: [{ name: "orderId", type: "uint128", indexed: true }] },
  { type: "event", name: "OrderCancelledPreFill", inputs: [{ name: "orderId", type: "uint128", indexed: true }] },
];
const regRead = parseAbi([
  "function getPendingOrder(uint128 orderId) view returns (bool live, (((bool isBid, address owner, uint64 userData, uint256 quantity) order, uint8 orderType, uint256 triggerPrice, uint8 triggerOperator, uint256 limitPrice, address builder, uint96 builderFeeBpsTimes1k) orderWithTrigger, uint128 orderId, uint256 somiPaid, uint128 siblingOrderId, uint8 intent) order)",
  "function slippageToleranceBps() view returns (uint256)",
  "function unclaimedSomi(address user) view returns (uint256)",
  "function perpPool() view returns (address)",
]);
const bankAbi = parseAbi(["function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))"]);
const poolAbi = parseAbi(["function tryGetMarkPrice() view returns (bool ok, uint256 price)"]);
const erc = parseAbi(["function decimals() view returns (uint8)", "function symbol() view returns (string)"]);
const fAbi = parseAbi(["function getPerpPoolStatuses() view returns ((address perpPool, address baseToken, bool restricted)[] statuses)"]);
let BD = 18;
const fq = (v) => (v === undefined || v === null ? v : formatUnits(BigInt(v), BD));
const f18 = (v) => (v === undefined || v === null ? v : formatUnits(BigInt(v), 18));
const J = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)));
const gql = async (query, variables) => (await (await fetch(IDX, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) })).json());
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

const [hash, wantId] = process.argv.slice(2);
const rc = await c.getTransactionReceipt({ hash });
const tx = await c.getTransaction({ hash });
const blk = await c.getBlock({ blockNumber: rc.blockNumber });
const b = rc.blockNumber, pb = b - 1n;
const logs = [];
let registry, pool, trig, linked, placed;
const fills = [];
for (const l of rc.logs) {
  let d = null;
  for (const abi of [regEv, obEv]) { try { d = decodeEventLog({ abi, topics: l.topics, data: l.data }); break; } catch {} }
  const row = { i: l.logIndex, addr: l.address, ev: d ? d.eventName : "undecoded:" + l.topics[0], args: d ? J(d.args) : undefined };
  logs.push(row);
  if (d?.eventName === "PendingOrderTriggered" && String(d.args.pendingOrderId) === wantId) { registry = l.address; trig = d.args; }
  if (d?.eventName === "LinkedOrderCancelled" && String(d.args.triggeredOrderId) === wantId) linked = d.args;
}
if (!registry) { console.log(JSON.stringify({ hash, error: "no PendingOrderTriggered", logs })); process.exit(0); }
pool = await c.readContract({ address: registry, abi: regRead, functionName: "perpPool", blockNumber: b });
const sts = await c.readContract({ address: "0xE631fAEE547baeE07353E290f0562ea67d856560", abi: fAbi, functionName: "getPerpPoolStatuses" });
const baseTok = sts.find((x) => x.perpPool.toLowerCase() === pool.toLowerCase()).baseToken;
BD = await c.readContract({ address: baseTok, abi: erc, functionName: "decimals" });
const SYM = await c.readContract({ address: baseTok, abi: erc, functionName: "symbol" });
for (const r of logs) {
  if (r.addr.toLowerCase() !== pool.toLowerCase()) continue;
  if (r.ev === "OrderPlaced" && BigInt(r.args.orderId) === trig.placedOrderId) placed = r.args.placedOrder;
  if (r.ev === "OrderFilled" && BigInt(r.args.takerOrderId) === trig.placedOrderId) fills.push(r.args);
}
const filled = fills.reduce((s, x) => s + BigInt(x.quantityFilled), 0n);
const rd = (address, abi, functionName, args, blockNumber) => c.readContract({ address, abi, functionName, args, blockNumber });
// Stop terms BEFORE the fire (parent block) — triggered leg and its sibling — straight from the registry
const [trigBefore, trigAfter] = await Promise.all([rd(registry, regRead, "getPendingOrder", [trig.pendingOrderId], pb), rd(registry, regRead, "getPendingOrder", [trig.pendingOrderId], b)]);
const owner = trigBefore[1].orderWithTrigger.order.owner;
const sibId = trigBefore[1].siblingOrderId;
const [sibBefore, sibAfter] = sibId ? await Promise.all([rd(registry, regRead, "getPendingOrder", [sibId], pb), rd(registry, regRead, "getPendingOrder", [sibId], b)]) : [null, null];
const [posB, posA, mark, slip, uncB, uncA] = await Promise.all([
  rd(MB, bankAbi, "getPosition", [owner, pool], pb), rd(MB, bankAbi, "getPosition", [owner, pool], b),
  rd(pool, poolAbi, "tryGetMarkPrice", [], pb), rd(registry, regRead, "slippageToleranceBps", [], pb),
  rd(registry, regRead, "unclaimedSomi", [owner], pb), rd(registry, regRead, "unclaimedSomi", [owner], b)]);
const [implAt, beaconAt, implHead, beaconHead] = await Promise.all([
  c.getStorageAt({ address: registry, slot: IMPL_SLOT, blockNumber: b }), c.getStorageAt({ address: registry, slot: BEACON_SLOT, blockNumber: b }),
  c.getStorageAt({ address: registry, slot: IMPL_SLOT }), c.getStorageAt({ address: registry, slot: BEACON_SLOT })]);
const leg = (x) => x && { live: x[0], isBid: x[1].orderWithTrigger.order.isBid, quantity: fq(x[1].orderWithTrigger.order.quantity), triggerPrice: f18(x[1].orderWithTrigger.triggerPrice),
  triggerOperator: x[1].orderWithTrigger.triggerOperator, orderType: x[1].orderWithTrigger.orderType, siblingOrderId: x[1].siblingOrderId, intent: x[1].intent, somiPaid: f18(x[1].somiPaid) };
// Indexer rows of both legs + the placed order row
const ids = [registry.toLowerCase() + "_" + trig.pendingOrderId, sibId ? registry.toLowerCase() + "_" + sibId : "none"];
const st = (await gql(`query($ids:[String!]){ StopOrder(where:{id:{_in:$ids}}){ id orderIdRaw status placedOrderId dropReason cancelReason siblingOrderId quantity triggerPrice isBid updatedAt } }`, { ids })).data?.StopOrder;
const ord = (await gql(`query($id:String!){ Order(where:{id:{_eq:$id}}){ price fullQuantity filledQuantity status } }`, { id: pool.toLowerCase() + "_" + trig.placedOrderId })).data?.Order?.[0];
console.log(JSON.stringify(J({
  tx: hash, block: b, blockTimeUTC: new Date(Number(blk.timestamp) * 1000).toISOString(), txFrom: rc.from, txTo: tx.to, status: rc.status,
  registry, pool, owner, slippageToleranceBps: slip, registryImplSlotAtBlock: implAt, registryBeaconSlotAtBlock: beaconAt, implSlotHead: implHead, beaconSlotHead: beaconHead,
  parentBlockMark: f18(mark[1]), base: SYM, baseDecimals: BD, positionBefore: fq(posB.size), positionAfter: fq(posA.size), positionChange: fq(posA.size - posB.size),
  triggeredLeg: { id: trig.pendingOrderId, before: leg(trigBefore), after: leg(trigAfter) },
  sibling: { id: sibId, before: leg(sibBefore), after: leg(sibAfter) },
  PendingOrderTriggered: trig, LinkedOrderCancelled: linked ?? null,
  placedOrderFromOrderPlaced: placed && { orderId: placed.orderId, isBid: placed.isBid, price: f18(placed.price), fullQuantity: fq(placed.fullQuantity), quantityRemaining: fq(placed.quantityRemaining), owner: placed.owner },
  fillsOfPlacedOrder: fills.length, filledSumFromOrderFilled: fq(filled), unfilledOfPlaced: placed ? fq(BigInt(placed.fullQuantity) - filled) : null,
  fillRatioPct: placed ? Number((filled * 10000n) / BigInt(placed.fullQuantity)) / 100 : null,
  unclaimedSomiBefore: f18(uncB), unclaimedSomiAfter: f18(uncA),
  indexerStopRows: st, indexerPlacedOrderRow: ord,
  logs: logs.map((r) => ({ i: r.i, addr: r.addr, ev: r.ev, ...(r.ev.startsWith("Order") && r.ev !== "OrderPlaced" && r.ev !== "OrderFilled" ? r.args : r.ev === "OrderFilled" ? { taker: r.args.takerOrderId, qty: fq(r.args.quantityFilled), takerRem: fq(r.args.takerRemainingQuantity), px: f18(r.args.fillPrice) } : r.ev === "OrderPlaced" ? { orderId: r.args.orderId, owner: r.args.placedOrder.owner, full: fq(r.args.placedOrder.fullQuantity), rem: fq(r.args.placedOrder.quantityRemaining) } : r.args) })),
}), null, 1));
