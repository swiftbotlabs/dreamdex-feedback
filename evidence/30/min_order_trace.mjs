// Read-only: debug_traceCall of the order the docs point a trader to (quantity = minQuantity, closing
// side, FOK) for the BTC dust owner, to show the position it leaves. Usage: node min_order_trace.mjs 0x1fee777
import { parseAbi, encodeFunctionData, decodeEventLog } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const ZERO = "0x0000000000000000000000000000000000000000";
const POOL = "0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0", ACCT = "0x1cc7ecc3a7dba7760c7a47b926bd11b6211ed276";
const w = parseAbi(["function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) payable"]);
const ev = parseAbi(["event PositionUpdated(address indexed account, address indexed perpPool, int128 newSize, uint128 avgEntryPrice, int256 realizedPnl, int256 entryFundingIndex)"]);
const post = async (method, params) => (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
const blk = process.argv[2];
const ts = BigInt((await post("eth_getBlockByNumber", [blk, false])).result.timestamp);
const data = encodeFunctionData({ abi: w, functionName: "placeOrder", args: [false, 0n, 80030600000000000000000n, 13000n, (ts + 3600n) * 1000000000n, 1, 0, ZERO, 0n] });
const j = await post("debug_traceCall", [{ from: ACCT, to: POOL, data }, blk, { tracer: "callTracer", tracerConfig: { withLog: true } }]);
console.log(`run ${new Date().toISOString()} block ${blk} (${BigInt(blk)}): BTC long 2000, sell 13000 (= minQuantity) FOK, top-level error: ${j.error ? JSON.stringify(j.error) : (j.result.error ?? "none")}`);
const logs = []; (function walk(c) { for (const l of c.logs ?? []) logs.push(l); for (const s of c.calls ?? []) walk(s); })(j.result ?? {});
for (const l of logs) { try { const d = decodeEventLog({ abi: ev, topics: l.topics, data: l.data }); if (d.args.account.toLowerCase() === ACCT) console.log(`   PositionUpdated account ${d.args.account} newSize ${d.args.newSize} (minQuantity 13000)`); } catch {} }
