// Rebuild one fired perp TP/SL from public data. Read-only: receipts, logs, eth_call at the parent block and at the
// firing block, and the indexer's StopOrder row. No keys, nothing signed, no state overrides.
// usage: node stop_case.mjs <firing tx hash> <stop id>
// Needs viem 2.57.7 (the repo's package.json).
import { createPublicClient, http, parseAbi, decodeEventLog, formatUnits } from "viem";

const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const IDX = "https://hideki-dev.smk.somnia.host/v1/graphql";
const MARGIN_BANK = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const FACTORY = "0xE631fAEE547baeE07353E290f0562ea67d856560";
const c = createPublicClient({ transport: http(RPC, { timeout: 30_000, retryCount: 2 }) });

const regEv = parseAbi([
  "event PendingOrderTriggered(uint128 indexed pendingOrderId, bool success, uint8 dropReason, uint128 indexed placedOrderId)",
  "event PendingOrderUnlinked(uint128 indexed orderId)",
  "event LinkedOrderCancelled(uint128 indexed cancelledOrderId, uint128 indexed triggeredOrderId, address indexed owner, uint256 somiCredited)",
]);
const bookEv = parseAbi([
  "event OrderPlaced(uint128 indexed orderId, (uint128 orderId, bool isBid, address owner, uint64 userData, uint256 price, uint256 fullQuantity, uint256 quantityRemaining, uint64 expireTimestampNs) placedOrder)",
  "event OrderFilled(uint128 indexed takerOrderId, uint128 indexed makerOrderId, uint256 quantityFilled, uint256 takerRemainingQuantity, uint256 makerRemainingQuantity, uint256 fillPrice)",
]);
const poolAbi = parseAbi([
  "function getMarkPrice() view returns (uint256)",
  "function getReducingCapacity(address account) view returns ((int128 positionSize, uint256 pendingBidQuantity, uint256 pendingAskQuantity, uint256 pendingOppositeQuantity, uint256 effectiveReducingCapacity) capacity)",
  "function getOwnOpenOrders() view returns (uint128[])",
  "function getOrder(uint128 orderId) view returns ((uint128 orderId, bool isBid, address owner, uint64 userData, uint256 price, uint256 fullQuantity, uint256 quantityRemaining, uint64 expireTimestampNs))",
  "function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))",
]);
const mbAbi = parseAbi(["function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))"]);
const regAbi = parseAbi(["function getPendingOrder(uint128 orderId) view returns (bool live, (((bool isBid, address owner, uint64 userData, uint256 quantity) order, uint8 orderType, uint256 triggerPrice, uint8 triggerOperator, uint256 limitPrice, address builder, uint96 builderFeeBpsTimes1k) orderWithTrigger, uint128 orderId, uint256 somiPaid, uint128 siblingOrderId, uint8 intent) order)"]);
const facAbi = parseAbi([
  "function getPerpPoolStatuses() view returns ((address perpPool, address baseToken, bool restricted)[] statuses)",
  "function getStopOrderRegistry(address perpPool) view returns (address)",
]);
const tokAbi = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);
const DROP = ["None", "ReduceOnlyNoPosition", "ReduceOnlyWrongSide", "ReduceOnlyBelowMinQty", "PlacementFailed", "NoFill"];
const OP = ["GTE", "LTE"];
const J = (v) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 1);
const abs = (x) => (x < 0n ? -x : x);

const [tx, stopIdStr] = process.argv.slice(2);
if (!tx || !stopIdStr) { console.error("usage: node stop_case.mjs <firing tx> <stop id>"); process.exit(2); }
const stopId = BigInt(stopIdStr);
const out = { ranAtUtc: new Date().toISOString(), tx, stopId: stopIdStr };

const rc = await c.getTransactionReceipt({ hash: tx });
const blk = await c.getBlock({ blockNumber: rc.blockNumber });
const b = rc.blockNumber, parent = b - 1n;
Object.assign(out, { block: b, parentBlock: parent, blockTimeUtc: new Date(Number(blk.timestamp) * 1000).toISOString(), txFrom: rc.from, txStatus: rc.status });

const logs = [];
for (const l of rc.logs) {
  let d = null;
  for (const abi of [regEv, bookEv]) { try { d = decodeEventLog({ abi, data: l.data, topics: l.topics }); break; } catch {} }
  logs.push({ address: l.address, logIndex: l.logIndex, topic0: l.topics[0], event: d?.eventName, args: d?.args, data: l.data });
}
const trig = logs.find((x) => x.event === "PendingOrderTriggered" && x.args.pendingOrderId === stopId);
if (!trig) { console.log(J({ ...out, error: "no PendingOrderTriggered for this stop id in this receipt" })); process.exit(1); }
const registry = trig.address;
out.registry = registry;
out.event = { topic0: trig.topic0, logIndex: trig.logIndex, data: trig.data, success: trig.args.success, dropReason: trig.args.dropReason, dropReasonName: DROP[trig.args.dropReason], placedOrderId: trig.args.placedOrderId };

// pool behind this registry
let pool = null, base = null;
for (const s of await c.readContract({ address: FACTORY, abi: facAbi, functionName: "getPerpPoolStatuses" })) {
  const r = await c.readContract({ address: FACTORY, abi: facAbi, functionName: "getStopOrderRegistry", args: [s.perpPool] });
  if (r.toLowerCase() === registry.toLowerCase()) { pool = s.perpPool; base = s.baseToken; break; }
}
const dec = await c.readContract({ address: base, abi: tokAbi, functionName: "decimals" });
const sym = await c.readContract({ address: base, abi: tokAbi, functionName: "symbol" });
Object.assign(out, { pool, base: sym, baseDecimals: dec });
const q = (x) => (x < 0n ? "-" : "") + formatUnits(abs(x), dec);
const p18 = (x) => formatUnits(x, 18);

// the stop, as the registry held it one block before it fired
const po = await c.readContract({ address: registry, abi: regAbi, functionName: "getPendingOrder", args: [stopId], blockNumber: parent });
const ow = po[1].orderWithTrigger, owner = ow.order.owner;
out.stopAtParent = { live: po[0], owner, isBid: ow.order.isBid, quantity: q(ow.order.quantity), quantityRaw: ow.order.quantity, orderType: ow.orderType, triggerPrice: p18(ow.triggerPrice), triggerOperator: OP[ow.triggerOperator] ?? ow.triggerOperator, intent: po[1].intent, siblingOrderId: po[1].siblingOrderId, somiPaid: formatUnits(po[1].somiPaid, 18) };
const sib = po[1].siblingOrderId;
out.otherRegistryEvents = logs.filter((x) => x !== trig && x.address.toLowerCase() === registry.toLowerCase() && x.event)
  .filter((x) => Object.values(x.args).some((v) => v === stopId || (sib !== 0n && v === sib))).map((x) => ({ event: x.event, args: x.args }));
if (sib !== 0n) out.siblingLiveAfter = (await c.readContract({ address: registry, abi: regAbi, functionName: "getPendingOrder", args: [sib], blockNumber: b }))[0];
out.stopLiveAfter = (await c.readContract({ address: registry, abi: regAbi, functionName: "getPendingOrder", args: [stopId], blockNumber: b }))[0];

// owner state at the parent block
const [mark, cap, posB, params, own] = await Promise.all([
  c.readContract({ address: pool, abi: poolAbi, functionName: "getMarkPrice", blockNumber: parent }),
  c.readContract({ address: pool, abi: poolAbi, functionName: "getReducingCapacity", args: [owner], blockNumber: parent }),
  c.readContract({ address: MARGIN_BANK, abi: mbAbi, functionName: "getPosition", args: [owner, pool], blockNumber: parent }),
  c.readContract({ address: pool, abi: poolAbi, functionName: "getOrderBookParameters", blockNumber: parent }),
  c.readContract({ address: pool, abi: poolAbi, functionName: "getOwnOpenOrders", account: owner, blockNumber: parent }),
]);
const resting = [];
for (const id of own) {
  const o = await c.readContract({ address: pool, abi: poolAbi, functionName: "getOrder", args: [id], blockNumber: parent });
  resting.push({ orderId: id, side: o.isBid ? "bid" : "ask", price: p18(o.price), remaining: q(o.quantityRemaining) });
}
out.parentState = {
  mark: p18(mark), position: q(posB.size), minQuantity: q(params.minQuantity),
  reducingCapacity: { positionSize: q(cap.positionSize), pendingBidQuantity: q(cap.pendingBidQuantity), pendingAskQuantity: q(cap.pendingAskQuantity), pendingOppositeQuantity: q(cap.pendingOppositeQuantity), effectiveReducingCapacity: q(cap.effectiveReducingCapacity) },
  ownerRestingOrders: resting,
};

// what the registry placed, from this receipt
const pid = trig.args.placedOrderId;
const placedLog = pid !== 0n ? logs.find((x) => x.event === "OrderPlaced" && x.args.orderId === pid) : null;
let placedQty = 0n;
if (placedLog) {
  const p = placedLog.args.placedOrder;
  const fills = logs.filter((x) => x.event === "OrderFilled" && x.args.takerOrderId === pid);
  placedQty = p.fullQuantity;
  out.placedOrder = { orderId: pid, side: p.isBid ? "bid" : "ask", owner: p.owner, price: p18(p.price), fullQuantity: q(p.fullQuantity), filled: q(fills.reduce((a, f) => a + f.args.quantityFilled, 0n)), fills: fills.length };
} else out.placedOrder = null;
const posA = await c.readContract({ address: MARGIN_BANK, abi: mbAbi, functionName: "getPosition", args: [owner, pool], blockNumber: b });
out.positionAfter = q(posA.size);

const want = ow.order.quantity === 0n ? abs(posB.size) : (ow.order.quantity < abs(posB.size) ? ow.order.quantity : abs(posB.size));
out.check = {
  minOfStopQtyAndPosition: q(want),
  placedQuantity: q(placedQty),
  effectiveReducingCapacity: q(cap.effectiveReducingCapacity),
  placedEqualsCapacity: placedQty === cap.effectiveReducingCapacity,
  placedBelowMinOfQtyAndPosition: placedQty < want,
  restingClosingSideQuantity: q(posB.size > 0n ? cap.pendingAskQuantity : cap.pendingBidQuantity),
  minOfQtyAndPositionOverPoolMinimum: (Number(formatUnits(want, dec)) / Number(formatUnits(params.minQuantity, dec))).toFixed(2),
  positionLeftOpen: q(posA.size),
};

// indexer row + how the stop was created
const r = await fetch(IDX, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: `query($id:String!){ StopOrder(where:{id:{_eq:$id}}){ status dropReason placedOrderId quantity createdAt updatedAt txHash } }`, variables: { id: registry.toLowerCase() + "_" + stopIdStr } }) });
const row = (await r.json()).data?.StopOrder?.[0] ?? null;
out.indexerRow = row;
if (row?.txHash) {
  const ct = await c.getTransaction({ hash: row.txHash });
  out.creationTx = { hash: row.txHash, from: ct.from, to: ct.to, selector: ct.input.slice(0, 10), block: ct.blockNumber };
}

const k = out.check;
console.log(`# ${sym}-PERP stop ${stopIdStr} fired in tx ${tx} (block ${b}, ${out.blockTimeUtc})`);
console.log(`stop: ${ow.order.isBid ? "buy" : "sell"} ${out.stopAtParent.quantity} when mark ${out.stopAtParent.triggerOperator} ${out.stopAtParent.triggerPrice}, orderType ${ow.orderType}, intent ${po[1].intent}, sibling ${po[1].siblingOrderId}`);
console.log(`parent block ${parent}: mark ${out.parentState.mark}, position ${out.parentState.position}, pool minQuantity ${out.parentState.minQuantity}`);
console.log(`getReducingCapacity(owner): ${J(out.parentState.reducingCapacity).replace(/\s+/g, " ")}`);
console.log(`owner's resting orders: ${resting.map((o) => `${o.side} ${o.remaining} @ ${o.price}`).join(", ") || "none"}`);
console.log(`PendingOrderTriggered: success=${out.event.success} dropReason=${out.event.dropReason} (${out.event.dropReasonName}) placedOrderId=${pid}`);
console.log(`placed: ${out.placedOrder ? `${out.placedOrder.side} ${out.placedOrder.fullQuantity} @ ${out.placedOrder.price}, filled ${out.placedOrder.filled} in ${out.placedOrder.fills} fills` : "nothing"}`);
console.log(`min(stop qty, |position|) = ${k.minOfStopQtyAndPosition} (${k.minOfQtyAndPositionOverPoolMinimum}x pool minimum); placed = ${k.placedQuantity}; capacity = ${k.effectiveReducingCapacity}; placed == capacity: ${k.placedEqualsCapacity}`);
console.log(`position after: ${out.positionAfter}; stop still live after: ${out.stopLiveAfter}; indexer: ${row?.status} dropReason ${row?.dropReason}`);
if (out.otherRegistryEvents.length || sib !== 0n) console.log(`other registry events for this stop or its sibling: ${out.otherRegistryEvents.map((e) => e.event + "(" + Object.values(e.args).join(",") + ")").join(", ") || "none"}${sib !== 0n ? `; sibling ${sib} still live after: ${out.siblingLiveAfter}` : ""}`);
if (out.creationTx) console.log(`created in ${out.creationTx.hash} (block ${out.creationTx.block}), to ${out.creationTx.to}, selector ${out.creationTx.selector}`);
console.log("--- JSON");
console.log(J(out));
