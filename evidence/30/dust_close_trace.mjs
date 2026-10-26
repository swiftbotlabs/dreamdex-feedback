// Read-only: debug_traceCall of each dust owner's full-close FOK order, with its logs decoded
// (PositionUpdated / OrderPlaced / OrderFilled / FundingSettled; event ABIs as in SDK 0.32.1).
// The prices are the best levels at block 0x1fee777. Usage: node dust_close_trace.mjs 0x1fee777
import { parseAbi, encodeFunctionData, decodeEventLog } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const ZERO = "0x0000000000000000000000000000000000000000";
const w = parseAbi(["function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) payable"]);
const ev = parseAbi([
  "event PositionUpdated(address indexed account, address indexed perpPool, int128 newSize, uint128 avgEntryPrice, int256 realizedPnl, int256 entryFundingIndex)",
  "event FundingSettled(address indexed account, address indexed perpPool, int256 payment)",
  "event OrderPlaced(uint128 indexed orderId, (uint128 orderId, bool isBid, address owner, uint64 userData, uint256 price, uint256 fullQuantity, uint256 quantityRemaining, uint64 expireTimestampNs) placedOrder)",
  "event OrderFilled(uint128 indexed takerOrderId, uint128 indexed makerOrderId, uint256 quantityFilled, uint256 takerRemainingQuantity, uint256 makerRemainingQuantity, uint256 fillPrice)",
]);
const post = async (method, params) => (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
const blk = process.argv[2];
const ts = BigInt((await post("eth_getBlockByNumber", [blk, false])).result.timestamp);
const EXP = (ts + 3600n) * 1000000000n;
const cases = [
  ["BTC long 2000, sell 2000 FOK", "0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0", "0x1cc7ecc3a7dba7760c7a47b926bd11b6211ed276", false, 2000n, 80030600000000000000000n],
  ["ETH short 1e14, buy 1e14 FOK", "0xd6cb1dd58580b84d76068ac21594219ce03aeddf", "0x5ad3f981bc477868844f1c925a82c6c0f5a33817", true, 100000000000000n, 2312770000000000000000n],
  ["WLD short 5e18, buy 5e18 FOK", "0x0f464d57c1fd839e4d87a408bbccdab8f77e6394", "0x3391dc5839157e746c5f1756cc11e0765ad5ae62", true, 5000000000000000000n, 436400000000000000n],
];
console.log(`run ${new Date().toISOString()} block ${blk} (${BigInt(blk)}) ts ${ts}`);
for (const [label, pool, acct, isBid, q, px] of cases) {
  const data = encodeFunctionData({ abi: w, functionName: "placeOrder", args: [isBid, 0n, px, q, EXP, 1, 0, ZERO, 0n] });
  const j = await post("debug_traceCall", [{ from: acct, to: pool, data }, blk, { tracer: "callTracer", tracerConfig: { withLog: true } }]);
  console.log(`\n== ${label} (from ${acct} to ${pool}) top-level error: ${j.error ? JSON.stringify(j.error) : (j.result.error ?? "none")}`);
  if (j.error) continue;
  const logs = []; (function walk(c) { for (const l of c.logs ?? []) logs.push(l); for (const s of c.calls ?? []) walk(s); })(j.result);
  for (const l of logs) {
    try {
      const d = decodeEventLog({ abi: ev, topics: l.topics, data: l.data });
      const a = d.args; let s;
      if (d.eventName === "PositionUpdated") s = `account ${a.account} pool ${a.perpPool} newSize ${a.newSize} avgEntry ${a.avgEntryPrice} realizedPnl ${a.realizedPnl}`;
      else if (d.eventName === "OrderPlaced") s = `orderId ${a.orderId} owner ${a.placedOrder.owner} isBid ${a.placedOrder.isBid} full ${a.placedOrder.fullQuantity} remaining ${a.placedOrder.quantityRemaining}`;
      else if (d.eventName === "OrderFilled") s = `taker ${a.takerOrderId} maker ${a.makerOrderId} filled ${a.quantityFilled} takerRemaining ${a.takerRemainingQuantity} price ${a.fillPrice}`;
      else s = Object.entries(a).map(([k, v]) => `${k} ${v}`).join(" ");
      console.log(`   ${d.eventName}: ${s}`);
    } catch { console.log(`   (other log topic0 ${l.topics[0].slice(0, 18)}...)`); }
  }
}
