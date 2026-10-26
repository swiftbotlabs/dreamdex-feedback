// Chain-side check (read-only). Usage:
//   node vr_chain.mjs open            -> list open, unexpired orders on SOMI:USDso SpotPool with expiry > 1 h (both sides)
//   node vr_chain.mjs get <ids...>    -> getOrder for each id at the current head
//   node vr_chain.mjs hist <id> [blocksBack]  -> eth_getLogs for that orderId as topic1 (OrderPlaced/Rested/Cancelled/Filled taker or maker)
import { createPublicClient, http, parseAbi, toEventSelector, pad, toHex } from "viem";
const POOL = "0x259fD6559214dd5aD3752322426eA9F9fABEFff4";
const c = createPublicClient({ transport: http("https://api.infra.testnet.somnia.network", { timeout: 30000 }) });
const O = "(uint128 orderId, bool isBid, address owner, uint64 userData, uint256 price, uint256 fullQuantity, uint256 quantityRemaining, uint64 expireTimestampNs)";
const abi = parseAbi([
  `function getOrder(uint128 orderId) view returns (${O})`,
  `function getAllOpenOrdersOffChain(bool isBid, uint256 maxCount, uint64 startCursor) view returns (${O}[] orders, bool hasMoreOrders, uint64 nextCursor)`,
]);
const j = (o) => JSON.stringify(o, (k, v) => typeof v === "bigint" ? v.toString() : v);
const ts = () => new Date().toISOString();
const [mode, ...rest] = process.argv.slice(2);
const b = await c.getBlockNumber();
const blk = await c.getBlock({ blockNumber: b });
console.log(ts(), "head", b.toString(), "block time", new Date(Number(blk.timestamp) * 1000).toISOString());
if (mode === "open") {
  const now = BigInt(Date.now()) * 1000000n;
  for (const isBid of [true, false]) {
    const [orders, more] = await c.readContract({ address: POOL, abi, functionName: "getAllOpenOrdersOffChain", args: [isBid, 300n, 0n], blockNumber: b });
    const long = orders.filter(o => o.expireTimestampNs > now + 3600n * 1000000000n);
    console.log(ts(), isBid ? "bids" : "asks", "returned", orders.length, "hasMore", more, "expiring > 1 h from now:", long.length);
    for (const o of long.slice(0, 8)) console.log("   ", o.orderId.toString(), "rem", o.quantityRemaining.toString(), "full", o.fullQuantity.toString(), "price", o.price.toString(), "expiryNs", o.expireTimestampNs.toString());
  }
} else if (mode === "get") {
  for (const id of rest) {
    try { const o = await c.readContract({ address: POOL, abi, functionName: "getOrder", args: [BigInt(id)], blockNumber: b }); console.log(ts(), "getOrder", id, j(o)); }
    catch (e) { console.log(ts(), "getOrder", id, "REVERT:", (e.shortMessage ?? e.message).split("\n")[0]); }
  }
} else if (mode === "hist") {
  const id = BigInt(rest[0]); const back = BigInt(rest[1] ?? 20000);
  const ev = parseAbi([
    `event OrderPlaced(uint128 indexed orderId, ${O} placedOrder)`,
    "event OrderRested(uint128 indexed orderId)",
    "event OrderCancelled(uint128 indexed orderId)",
    "event OrderFilled(uint128 indexed takerOrderId, uint128 indexed makerOrderId, uint256 quantityFilled, uint256 takerRemainingQuantity, uint256 makerRemainingQuantity, uint256 fillPrice)",
  ]);
  const sel = ev.map(e => toEventSelector(e));
  const t1 = pad(toHex(id), { size: 32 });
  const step = 1000n; let found = [];
  for (let from = b - back; from <= b; from += step) {
    const to = from + step - 1n > b ? b : from + step - 1n;
    for (const topics of [[sel, t1], [sel[3], null, t1]]) {
      const logs = await c.request({ method: "eth_getLogs", params: [{ address: POOL, topics, fromBlock: toHex(from), toBlock: toHex(to) }] });
      for (const l of logs) found.push({ block: BigInt(l.blockNumber).toString(), ev: ["placed", "rested", "cancelled", "filled"][sel.indexOf(l.topics[0])], tx: l.transactionHash });
    }
  }
  console.log(ts(), "logs for", id.toString(), "in last", back.toString(), "blocks:", j(found));
}
