// Read-only. Decodes the registry events of the tx that armed a TP/SL pair (PendingOrderCreated x2 + PendingOrdersLinked)
// and prints the tx selector. usage: node pair_created.mjs <tx hash>
import { createPublicClient, http, parseAbi, defineChain, decodeEventLog, formatUnits } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000, retryCount: 2 }) });
const abi = parseAbi([
  "event PendingOrderCreated(uint128 indexed orderId, address indexed owner, bool isBid, uint256 quantity, uint256 triggerPrice, uint8 triggerOperator, uint8 orderType, address builder, uint96 builderFeeBpsTimes1k)",
  "event PendingOrderIntentSet(uint128 indexed orderId, uint8 intent)",
  "event PendingOrdersLinked(uint128 indexed gteOrderId, uint128 indexed lteOrderId, address indexed owner)",
]);
const hash = process.argv[2];
const [tx, rc] = await Promise.all([c.getTransaction({ hash }), c.getTransactionReceipt({ hash })]);
const blk = await c.getBlock({ blockNumber: rc.blockNumber });
const ev = [];
for (const l of rc.logs) { try { const d = decodeEventLog({ abi, topics: l.topics, data: l.data }); ev.push({ i: l.logIndex, addr: l.address, name: d.eventName, args: Object.fromEntries(Object.entries(d.args).map(([k, v]) => [k, String(v)])) }); } catch {} }
console.log(JSON.stringify({ tx: hash, block: String(rc.blockNumber), timeUTC: new Date(Number(blk.timestamp) * 1000).toISOString(), status: rc.status,
  from: tx.from, to: tx.to, selector: tx.input.slice(0, 10), valueSTT: formatUnits(tx.value, 18), events: ev }, null, 1));
