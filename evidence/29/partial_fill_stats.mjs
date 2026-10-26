// Read-only: among the most recent N fired perp stops (indexer), find those whose placed IOC filled only part of its size,
// then for each: was the leg linked at the parent block (registry getPendingOrder), and did the firing receipt cancel
// the sibling (LinkedOrderCancelled)? usage: node partial_fill_stats.mjs [N=1000]
import { createPublicClient, http, parseAbi, defineChain, decodeEventLog } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const IDX = "https://hideki-dev.smk.somnia.host/v1/graphql";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000, retryCount: 2 }) });
const FACTORY = "0xE631fAEE547baeE07353E290f0562ea67d856560";
const fAbi = parseAbi(["function getPerpPoolStatuses() view returns ((address perpPool, address baseToken, bool restricted)[] statuses)", "function getStopOrderRegistry(address perpPool) view returns (address stopOrderRegistry)"]);
const regAbi = parseAbi([
  "function getPendingOrder(uint128 orderId) view returns (bool live, (((bool isBid, address owner, uint64 userData, uint256 quantity) order, uint8 orderType, uint256 triggerPrice, uint8 triggerOperator, uint256 limitPrice, address builder, uint96 builderFeeBpsTimes1k) orderWithTrigger, uint128 orderId, uint256 somiPaid, uint128 siblingOrderId, uint8 intent) order)",
  "function slippageToleranceBps() view returns (uint256)",
  "event PendingOrderTriggered(uint128 indexed pendingOrderId, bool success, uint8 dropReason, uint128 indexed placedOrderId)",
  "event LinkedOrderCancelled(uint128 indexed cancelledOrderId, uint128 indexed triggeredOrderId, address indexed owner, uint256 somiCredited)",
]);
const gql = async (query, variables) => (await (await fetch(IDX, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) })).json());
const N = Number(process.argv[2] || 1000);
const sts = await c.readContract({ address: FACTORY, abi: fAbi, functionName: "getPerpPoolStatuses" });
const reg2pool = {};
const slips = {};
for (const s of sts) { const r = (await c.readContract({ address: FACTORY, abi: fAbi, functionName: "getStopOrderRegistry", args: [s.perpPool] })).toLowerCase(); reg2pool[r] = s.perpPool.toLowerCase(); slips[r] = String(await c.readContract({ address: r, abi: regAbi, functionName: "slippageToleranceBps" })); }
const regs = Object.keys(reg2pool);
const rows = [];
for (let off = 0; rows.length < N; off += 500) {
  const q = await gql(`query($r:[String!],$o:Int!){ StopOrder(where:{registry:{_in:$r},status:{_in:["TRIGGERED","TRIGGER_FAILED"]}}, order_by:[{updatedAt:desc},{id:desc}], limit:500, offset:$o){ id registry orderIdRaw owner status placedOrderId dropReason orderType updatedAt } }`, { r: regs, o: off });
  const b = q.data?.StopOrder ?? []; if (q.errors) { console.error(JSON.stringify(q.errors).slice(0, 300)); break; }
  rows.push(...b); if (b.length < 500) break;
}
const fired = rows.slice(0, N);
const withOrder = fired.filter((r) => r.placedOrderId);
const orderIds = withOrder.map((r) => reg2pool[r.registry] + "_" + r.placedOrderId);
const orders = {};
for (let i = 0; i < orderIds.length; i += 200) {
  const q = await gql(`query($ids:[String!]){ Order(where:{id:{_in:$ids}}){ id fullQuantity filledQuantity status placedTxHash placedAtBlock } }`, { ids: orderIds.slice(i, i + 200) });
  for (const o of q.data?.Order ?? []) orders[o.id] = o;
}
const partial = [];
let full = 0, zero = 0, missing = 0;
for (const r of withOrder) {
  const o = orders[reg2pool[r.registry] + "_" + r.placedOrderId];
  if (!o) { missing++; continue; }
  const f = BigInt(o.filledQuantity), q = BigInt(o.fullQuantity);
  if (f === q) full++; else if (f === 0n) zero++; else partial.push({ r, o });
}
const out = [];
for (const { r, o } of partial) {
  const rc = await c.getTransactionReceipt({ hash: o.placedTxHash });
  let trig = null, linked = null;
  for (const l of rc.logs) { if (l.address.toLowerCase() !== r.registry) continue; try { const d = decodeEventLog({ abi: regAbi, topics: l.topics, data: l.data });
    if (d.eventName === "PendingOrderTriggered" && String(d.args.pendingOrderId) === r.orderIdRaw) trig = d.args;
    if (d.eventName === "LinkedOrderCancelled" && String(d.args.triggeredOrderId) === r.orderIdRaw) linked = d.args; } catch {} }
  const before = await c.readContract({ address: r.registry, abi: regAbi, functionName: "getPendingOrder", args: [BigInt(r.orderIdRaw)], blockNumber: rc.blockNumber - 1n });
  out.push({ stop: r.orderIdRaw, registry: r.registry, owner: r.owner, tx: o.placedTxHash, block: String(rc.blockNumber), timeUTC: new Date(Number(r.updatedAt) * 1000).toISOString(),
    fillPct: Number((BigInt(o.filledQuantity) * 10000n) / BigInt(o.fullQuantity)) / 100, orderType: r.orderType, triggeredSuccess: trig?.success, dropReason: trig?.dropReason,
    linkedAtParent: before[1].siblingOrderId !== 0n, siblingAtParent: String(before[1].siblingOrderId), siblingCancelled: linked ? String(linked.cancelledOrderId) : null });
}
const firstT = fired.length ? new Date(Number(fired[fired.length - 1].updatedAt) * 1000).toISOString() : null, lastT = fired.length ? new Date(Number(fired[0].updatedAt) * 1000).toISOString() : null;
console.log(JSON.stringify({ registries: regs.length, slippageToleranceBpsValues: [...new Set(Object.values(slips))], firedRows: fired.length, window: [firstT, lastT],
  triggeredWithOrder: withOrder.length, fullFill: full, zeroFill: zero, partialFill: partial.length, missingOrderRow: missing, partials: out }, null, 1));
