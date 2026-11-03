// Report 72: decode the test orders on Tokyo and count fills (OrderFilled logs) per taker order. Read-only.
// Usage: node fills_per_order.mjs <txhash> [<txhash> ...]
import { createPublicClient, http, parseAbi, decodeEventLog, formatUnits } from "viem";
const c = createPublicClient({ transport: http("https://api.hideki2.infra.testnet.somnia.network", { timeout: 60000, retryCount: 3 }) });
const ev = parseAbi(["event OrderFilled(uint128 indexed takerOrderId, uint128 indexed makerOrderId, uint256 quantityFilled, uint256 takerRemainingQuantity, uint256 makerRemainingQuantity, uint256 fillPrice)",
  "event PositionUpdated(address indexed account, address indexed perpPool, int256 newSize, uint256 avgEntryPrice, int256 realizedPnl, int256 entryFundingIndex, uint64 timestamp)"]);
for (const h of process.argv.slice(2)) {
  const r = await c.getTransactionReceipt({ hash: h }); const b = await c.getBlock({ blockNumber: r.blockNumber });
  const fills = []; let takers = new Set();
  for (const l of r.logs) { try { const d = decodeEventLog({ abi: ev, data: l.data, topics: l.topics }); if (d.eventName === "OrderFilled") { fills.push(d.args); takers.add(d.args.takerOrderId.toString()); } } catch {} }
  console.log(`${h} block ${r.blockNumber} ${new Date(Number(b.timestamp) * 1000).toISOString()} status ${r.status} gasUsed ${r.gasUsed}`);
  console.log(`  taker orders: ${[...takers].join(", ") || "none"} | fills: ${fills.length}`);
  for (const f of fills) console.log(`    maker ${f.makerOrderId} qty ${formatUnits(f.quantityFilled, 18)} @ ${formatUnits(f.fillPrice, 18)}`);
}
