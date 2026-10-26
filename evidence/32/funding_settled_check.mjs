// Read-only: compares MarginBank FundingSettled in a tx with ceil(signedSize*(index-entry)/(1e18*oneBase))
// and with the indexer description's (index-entry)*|size|. Position state is read at block-1 (eth_call).
// Usage (from products/dreamdex): node <this file> <txhash>
import { createPublicClient, http, parseAbi, decodeEventLog } from "viem";

const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const BANK = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394".toLowerCase();
const client = createPublicClient({ transport: http(RPC) });
const evAbi = parseAbi([
  "event FundingSettled(address indexed account, address indexed perpPool, int256 payment)",
  "event PositionUpdated(address indexed account, address indexed perpPool, int128 newSize, uint128 avgEntryPrice, int256 realizedPnl, int256 entryFundingIndex)",
]);
const bankAbi = parseAbi([
  "function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))",
]);
const poolAbi = parseAbi([
  "function getProjectedCumulativeFundingPerUnit() view returns (int256)",
  "function getOneBase() view returns (uint256)",
]);
const ceilDivSigned = (a, b) => { const q = a / b; return a % b !== 0n && (a < 0n) === (b < 0n) ? q + 1n : q; };

const tx = process.argv[2];
const rc = await client.getTransactionReceipt({ hash: tx });
const blk = await client.getBlock({ blockNumber: rc.blockNumber });
console.log(`tx ${tx} block ${rc.blockNumber} time ${new Date(Number(blk.timestamp) * (blk.timestamp > 1e12 ? 1 : 1000)).toISOString()} status ${rc.status}`);
const evs = [];
for (const l of rc.logs) {
  if (l.address.toLowerCase() !== BANK) continue;
  try { const d = decodeEventLog({ abi: evAbi, data: l.data, topics: l.topics }); evs.push({ ...d, logIndex: l.logIndex }); } catch {}
}
for (const e of evs) console.log(`  ${e.eventName}`, Object.fromEntries(Object.entries(e.args).map(([k, v]) => [k, v.toString()])));
for (const fs of evs.filter((e) => e.eventName === "FundingSettled")) {
  const { account, perpPool, payment } = fs.args;
  const prev = await client.readContract({ address: BANK, abi: bankAbi, functionName: "getPosition", args: [account, perpPool], blockNumber: rc.blockNumber - 1n });
  const oneBase = await client.readContract({ address: perpPool, abi: poolAbi, functionName: "getOneBase", blockNumber: rc.blockNumber - 1n });
  // index the settlement used: the projected index at the prior block is a proxy; better, the PositionUpdated entryFundingIndex
  // emitted right after the settlement in the same tx (the new stamp) if present.
  const pu = evs.find((e) => e.eventName === "PositionUpdated" && e.args.account.toLowerCase() === account.toLowerCase() && e.args.perpPool.toLowerCase() === perpPool.toLowerCase() && e.logIndex > fs.logIndex);
  const projPrev = await client.readContract({ address: perpPool, abi: poolAbi, functionName: "getProjectedCumulativeFundingPerUnit", blockNumber: rc.blockNumber - 1n });
  const idx = pu && pu.args.entryFundingIndex !== 0n ? pu.args.entryFundingIndex : projPrev;
  const delta = idx - prev.entryFundingIndex;
  const absSize = prev.size < 0n ? -prev.size : prev.size;
  const correct = ceilDivSigned(prev.size * delta, 10n ** 18n * oneBase);
  const doc = delta * absSize;
  console.log(`  account ${account} pool ${perpPool} prevSize ${prev.size} prevEntry ${prev.entryFundingIndex} oneBase ${oneBase}`);
  console.log(`  index used ${idx} (${pu && pu.args.entryFundingIndex !== 0n ? "PositionUpdated.entryFundingIndex in same tx" : "projected @ block-1"}); projected@block-1 ${projPrev}`);
  console.log(`  FundingSettled.payment          = ${payment}`);
  console.log(`  ceil(signedSize*delta/(1e18*oneBase)) = ${correct}  equal=${correct === payment}  diff=${payment - correct}`);
  console.log(`  description (idx-entry)*|size|  = ${doc}  (sign ${doc > 0n ? "+" : doc < 0n ? "-" : "0"} vs payment sign ${payment > 0n ? "+" : payment < 0n ? "-" : "0"})`);
}
