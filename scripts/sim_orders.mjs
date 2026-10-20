// Simulate perp order placements with eth_call (no gas needed) and decode each result: (success, orderId) for
// an accepted order, or the revert selector against the SDK's contractErrorsAbi.ts (read as text).
// Reproduces: report 03 (a voucher-only account's resting bid is accepted on markets the docs mark "No"), e.g.
//       node scripts/sim_orders.mjs package/src/contractErrorsAbi.ts 0x567476bd43ff20e6aa44e18abfbdb58280563f45 0x2a73129F26917124bd2A47a9B355C395C537F050  (ZEC-PERP)
//       and report 06's list of documented order errors. (The "wrong scale" case is kept for reference only; that half of
//       report 06 was removed on 2026-10-20.)
// Run:  node scripts/sim_orders.mjs <path/to/contractErrorsAbi.ts> [from] [pool]
//       (defaults: from 0x420691db9d2b5a79210fda48c177471386b6dfd1, pool BTC-PERP 0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0)
// Read-only: eth_call only; nothing is signed or sent.
import { readFileSync } from "node:fs";
import { createPublicClient, http, defineChain, encodeFunctionData, decodeFunctionResult, parseAbi, keccak256, toHex, parseUnits } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const client = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const errSrc = readFileSync(process.argv[2], "utf8");
const errMap = {};
for (const m of errSrc.matchAll(/\{ type: "error", name: "(\w+)", inputs: \[(.*?)\] \}/g)) {
  const types = [...m[2].matchAll(/type: "([^"]+)"/g)].map(x => x[1]);
  errMap[keccak256(toHex(`${m[1]}(${types.join(",")})`)).slice(0, 10)] = `${m[1]}(${types.join(",")})`;
}
errMap["0x3e31dcc2"] = "SelfClaimDisabled() [not in SDK ABI]";
const FROM = process.argv[3] ?? "0x420691db9d2b5a79210fda48c177471386b6dfd1";
const POOL = process.argv[4] ?? "0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0"; // BTC-PERP
const abi = parseAbi([
  "function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) payable returns (bool success, uint128 orderId)",
  "function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))",
  "function getPerpPoolParameters() view returns ((uint256 initialMarginBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps, uint256 maxOpenInterest, uint256 maxPositionSize, uint256 takerFeeBpsTimes1k, int256 makerFeeBpsTimes1k, uint256 insuranceFundShareBps))",
  "function tryGetMarkPrice() view returns (bool ok, uint256 price)",
  "function getBookLevels(bool isBid, uint64 numLevels) view returns ((uint256 price, uint256 quantity)[])",
]);
const [obp, ppp, mark, bids, asks] = await Promise.all([
  client.readContract({ address: POOL, abi, functionName: "getOrderBookParameters" }),
  client.readContract({ address: POOL, abi, functionName: "getPerpPoolParameters" }),
  client.readContract({ address: POOL, abi, functionName: "tryGetMarkPrice" }),
  client.readContract({ address: POOL, abi, functionName: "getBookLevels", args: [true, 3n] }),
  client.readContract({ address: POOL, abi, functionName: "getBookLevels", args: [false, 3n] }),
]);
const tick = obp.tickSize, lot = obp.lotSize, min = obp.minQuantity, markP = mark[1];
console.log("pool", POOL, "from", FROM, "mark", markP.toString(), "tick", tick.toString(), "lot", lot.toString(), "min", min.toString(), "maxPos", ppp.maxPositionSize.toString());
console.log("best bid", bids[0]?.price?.toString(), "best ask", asks[0]?.price?.toString());
const farFuture = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600) * 1_000_000_000n;
const ZERO = "0x0000000000000000000000000000000000000000";
const alignDown = (v, g) => (v / g) * g;
const cases = [
  ["valid resting bid 10% below mark, min qty", true, alignDown(markP * 90n / 100n, tick), min, 0],
  ["price off tick (+1 wei)", true, alignDown(markP * 90n / 100n, tick) + 1n, min, 0],
  ["quantity below minQuantity (min - lot)", true, alignDown(markP * 90n / 100n, tick), min - lot, 0],
  ["quantity not a lot multiple (min + 1)", true, alignDown(markP * 90n / 100n, tick), min + 1n, 0],
  ["quantity zero", true, alignDown(markP * 90n / 100n, tick), 0n, 0],
  ["expiry 0 (docs: OrderAlreadyExpired)", true, alignDown(markP * 90n / 100n, tick), min, 0, 0n],
  ["IOC bid far below mark (no fill)", true, alignDown(markP * 50n / 100n, tick), min, 2],
  ["FOK bid far below mark", true, alignDown(markP * 50n / 100n, tick), min, 1],
  ["PostOnly bid crossing the ask", true, alignDown(markP * 110n / 100n, tick), min, 3],
  ["over maxPositionSize (cap + lot)", true, alignDown(markP * 90n / 100n, tick), ppp.maxPositionSize + lot, 0],
  ["wrong scale: 0.001 BTC written with 18 decimals", true, alignDown(markP * 90n / 100n, tick), parseUnits("0.001", 18), 0],
  ["huge price (mark x 1000) min qty", true, alignDown(markP * 1000n, tick), min, 0],
];
for (const [label, isBid, price, qty, type, expiry] of cases) {
  const data = encodeFunctionData({ abi, functionName: "placeOrder", args: [isBid, 0n, price, qty, expiry ?? farFuture, type, 0, ZERO, 0n] });
  const r = await client.request({ method: "eth_call", params: [{ from: FROM, to: POOL, data }, "latest"] })
    .then(x => { try { const [ok, id] = decodeFunctionResult({ abi, functionName: "placeOrder", data: x }); return `OK success=${ok} orderId=${id}`; } catch { return `OK ${x.slice(0, 20)}…`; } }, e => { const d = (e.data ?? e.cause?.data ?? "") + ""; const sel = d.slice(0, 10); return `REVERT ${sel} ${errMap[sel] ?? (d.startsWith("0x08c379a0") ? "Error(string)" : "UNKNOWN")}${d.length > 10 ? " data=" + d.slice(0, 74) : ""}`; });
  console.log(`- ${label}: ${r}`);
}
