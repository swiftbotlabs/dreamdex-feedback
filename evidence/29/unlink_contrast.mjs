// Read-only. Same receipt, other stops: for every PendingOrderTriggered in a tx, show the leg's sibling at the parent
// block and the sibling's state after the block, and which registry event (LinkedOrderCancelled / PendingOrderUnlinked)
// followed. Shows how the registry treats a linked leg that places nothing vs one that fills part.
// For each placed order it also reads the indexer Order row (fullQuantity / filledQuantity).
// usage: node unlink_contrast.mjs <tx hash>
import { createPublicClient, http, parseAbi, defineChain, decodeEventLog } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const IDX = "https://hideki-dev.smk.somnia.host/v1/graphql";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000, retryCount: 2 }) });
const regAbi = parseAbi([
  "function getPendingOrder(uint128 orderId) view returns (bool live, (((bool isBid, address owner, uint64 userData, uint256 quantity) order, uint8 orderType, uint256 triggerPrice, uint8 triggerOperator, uint256 limitPrice, address builder, uint96 builderFeeBpsTimes1k) orderWithTrigger, uint128 orderId, uint256 somiPaid, uint128 siblingOrderId, uint8 intent) order)",
  "event PendingOrderTriggered(uint128 indexed pendingOrderId, bool success, uint8 dropReason, uint128 indexed placedOrderId)",
  "event LinkedOrderCancelled(uint128 indexed cancelledOrderId, uint128 indexed triggeredOrderId, address indexed owner, uint256 somiCredited)",
  "event PendingOrderUnlinked(uint128 indexed orderId)",
  "function perpPool() view returns (address)",
]);
// SDK 0.32.1 dist/perp/stops.js PERP_STOP_DROP_REASON
const DROP = ["None", "ReduceOnlyNoPosition", "ReduceOnlyWrongSide", "ReduceOnlyBelowMinQty", "PlacementFailed", "NoFill"];
const hash = process.argv[2];
const rc = await c.getTransactionReceipt({ hash });
const b = rc.blockNumber, pb = b - 1n;
const ev = [];
for (const l of rc.logs) { try { const d = decodeEventLog({ abi: regAbi, topics: l.topics, data: l.data }); ev.push({ i: l.logIndex, addr: l.address.toLowerCase(), name: d.eventName, a: d.args }); } catch {} }
const out = [];
for (let k = 0; k < ev.length; k++) {
  const e = ev[k];
  if (e.name !== "PendingOrderTriggered") continue;
  const before = await c.readContract({ address: e.addr, abi: regAbi, functionName: "getPendingOrder", args: [e.a.pendingOrderId], blockNumber: pb });
  const sib = before[1].siblingOrderId;
  let sibAfter = null;
  if (sib !== 0n) { const s = await c.readContract({ address: e.addr, abi: regAbi, functionName: "getPendingOrder", args: [sib], blockNumber: b }); sibAfter = { live: s[0], siblingOrderId: String(s[1].siblingOrderId) }; }
  const next = ev[k + 1] && ev[k + 1].addr === e.addr && ev[k + 1].name !== "PendingOrderTriggered" ? ev[k + 1] : null;
  out.push({ logIndex: e.i, registry: e.addr, stop: String(e.a.pendingOrderId), success: e.a.success, dropReason: `${e.a.dropReason} (${DROP[e.a.dropReason] ?? "?"})`,
    placedOrderId: String(e.a.placedOrderId), owner: before[1].orderWithTrigger.order.owner, siblingAtParentBlock: String(sib),
    nextRegistryEvent: next && { logIndex: next.i, name: next.name, args: Object.fromEntries(Object.entries(next.a).map(([x, y]) => [x, String(y)])) },
    siblingAfterBlock: sibAfter });
}
const regs = [...new Set(out.map((o) => o.registry))];
const poolOf = {};
for (const r of regs) poolOf[r] = (await c.readContract({ address: r, abi: regAbi, functionName: "perpPool" })).toLowerCase();
const ids = out.filter((o) => o.placedOrderId !== "0").map((o) => poolOf[o.registry] + "_" + o.placedOrderId);
const q = ids.length ? await (await fetch(IDX, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "query($ids:[String!]){ Order(where:{id:{_in:$ids}}){ id fullQuantity filledQuantity status } }", variables: { ids } }) })).json() : { data: { Order: [] } };
const ord = Object.fromEntries((q.data?.Order ?? []).map((o) => [o.id, o]));
for (const o of out) {
  const r = o.placedOrderId !== "0" ? ord[poolOf[o.registry] + "_" + o.placedOrderId] : null;
  o.placedOrderFill = r ? { fullQuantity: r.fullQuantity, filledQuantity: r.filledQuantity, status: r.status, fillPct: Number((BigInt(r.filledQuantity) * 10000n) / BigInt(r.fullQuantity)) / 100 } : null;
}
console.log(JSON.stringify({ tx: hash, block: String(b), triggered: out }, null, 1));
