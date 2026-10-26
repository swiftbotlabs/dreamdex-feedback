// Read-only recheck for report indexer-api-0 (Swift Bot Labs). No writes, no SDK execution.
// 1) sends the exact PerpOrderRejections query document of @somnia-chain/markets-sdk 0.32.1
//    (src/perp/history.ts:1189-1195) with the variables listPerpOrderRejections({owner}) builds,
//    and maps rows the way the SDK does (PERP_ORDER_REJECTION_REASON[r.reason] ?? null);
// 2) re-reads the same rows with the two columns the SDK does not select (isAmend, oldOrderId);
// 3) counts the isAmend=true rows by keyset paging (1000 per request, 400 ms apart);
// 4) decodes the transactions on the Hideki RPC.
import { createPublicClient, http, defineChain, keccak256, toHex, parseAbi, decodeFunctionData, toFunctionSelector } from "viem";

const GQL = "https://hideki-dev.smk.somnia.host/v1/graphql";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function gql(query, variables = {}) {
  const t = Date.now();
  const res = await fetch(GQL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const j = await res.json();
  return { j, ms: Date.now() - t, status: res.status };
}

const SDK_QUERY = `query PerpOrderRejections($where: PerpOrderRejection_bool_exp!, $limit: Int, $offset: Int) {
    _sdkWatermark: chain_metadata { chain_id latest_processed_block }
         PerpOrderRejection(where: $where, order_by: [{blockNumber: desc}, {id: desc}], limit: $limit, offset: $offset) {
           id owner pool reason requestIndex timestamp blockNumber txHash
         }
       }`;
const PLUS_QUERY = SDK_QUERY.replace("blockNumber txHash\n", "blockNumber txHash isAmend oldOrderId\n");
const NAMES = ["None", "AlreadyExpired", "SelfMatchCancelTaker", "PostOnlyWouldCross", "FillOrKillUnfillable", "ImmediateOrCancelNoFill"];
const sdkMap = (r) => ({ id: r.id, reason: NAMES[r.reason] ?? null, reasonRaw: r.reason, requestIndex: r.requestIndex, blockNumber: r.blockNumber, txHash: r.txHash });

const A = "0x440e03bb3aadbe65d5bf2ad7f84a64c509ff438b";
const B = "0xdba45e5480fc0f365d36e79a2e9eacdb98ac44f9";

console.log(`# recheck indexer-api-0, start ${now()}`);
console.log(`\n## 1. SDK query document (listPerpOrderRejections({ owner: ${A} }) -> where {owner:{_eq}}, limit 50, offset 0)`);
let r = await gql(SDK_QUERY, { where: { owner: { _eq: A } }, limit: 50, offset: 0 });
console.log(`HTTP ${r.status} ${r.ms} ms at ${now()} watermark ${JSON.stringify(r.j.data._sdkWatermark)}`);
console.log("raw rows:", JSON.stringify(r.j.data.PerpOrderRejection));
console.log("as the SDK maps them:", JSON.stringify(r.j.data.PerpOrderRejection.map(sdkMap)));

console.log(`\n## 2. Same query plus the columns the SDK does not select (isAmend, oldOrderId)`);
r = await gql(PLUS_QUERY, { where: { owner: { _eq: A } }, limit: 50, offset: 0 });
console.log(`HTTP ${r.status} ${r.ms} ms at ${now()}`);
for (const x of r.j.data.PerpOrderRejection) console.log(`  ${x.id} reason ${x.reason} requestIndex ${x.requestIndex} block ${x.blockNumber} isAmend ${x.isAmend} oldOrderId ${x.oldOrderId}`);

console.log(`\n## 3. Owner ${B}: newest 50 rows (SDK default limit), isAmend split; and any isAmend=false row at all`);
r = await gql(PLUS_QUERY, { where: { owner: { _eq: B } }, limit: 50, offset: 0 });
const rowsB = r.j.data.PerpOrderRejection;
const split = {}; for (const x of rowsB) split[x.isAmend] = (split[x.isAmend] ?? 0) + 1;
const reasonsB = {}; for (const x of rowsB) reasonsB[x.reason] = (reasonsB[x.reason] ?? 0) + 1;
console.log(`HTTP ${r.status} at ${now()} rows ${rowsB.length} isAmend split ${JSON.stringify(split)} reasons ${JSON.stringify(reasonsB)} oldOrderId values ${JSON.stringify([...new Set(rowsB.map((x) => x.oldOrderId))])}`);
console.log(`  newest: ${rowsB[0].id} block ${rowsB[0].blockNumber} tx ${rowsB[0].txHash}`);
await sleep(400);
r = await gql(PLUS_QUERY, { where: { owner: { _eq: B }, isAmend: { _eq: false } }, limit: 50, offset: 0 });
console.log(`  isAmend=false rows for ${B}: ${r.j.data.PerpOrderRejection.length}`);

console.log(`\n## 4. Control: a placeOrders rejection row, and the Order row the 0x440e amend rows point at`);
await sleep(400);
r = await gql(`{ PerpOrderRejection_by_pk(id: "0xacc5d5e968716e67d5359d71fde00d7b67bef6022a711ae187909859023bb128_15") { id owner pool reason requestIndex blockNumber isAmend oldOrderId } }`);
console.log("  ", JSON.stringify(r.j.data));
await sleep(400);
r = await gql(`{ Order(where: {id: {_eq: "0xb483ec1fb34996638677c20ab087b16f1896fa53_14941862699704743729270"}}) { id owner status fullQuantity filledQuantity placedAtBlock lastUpdatedAtBlock } }`);
console.log("  ", JSON.stringify(r.j.data));

console.log(`\n## 5. Rows with reason 0 ("None") in the whole table`);
await sleep(400);
r = await gql(`{ PerpOrderRejection(where: {reason: {_eq: 0}}, limit: 10) { id owner reason isAmend oldOrderId blockNumber } }`);
console.log("  ", JSON.stringify(r.j.data));

console.log(`\n## 6. All isAmend=true rows (keyset paging by id, 1000 per request)`);
let last = "", total = 0, zeroOld = 0; const byReason = {}; const owners = new Set(); const pools = new Set();
for (;;) {
  await sleep(400);
  const q = `query($w: PerpOrderRejection_bool_exp!) { PerpOrderRejection(where: $w, order_by: {id: asc}, limit: 1000) { id owner pool reason oldOrderId } }`;
  const w = { isAmend: { _eq: true }, ...(last ? { id: { _gt: last } } : {}) };
  const p = await gql(q, { w });
  const rows = p.j.data?.PerpOrderRejection;
  if (!rows) { console.log("  error", JSON.stringify(p.j).slice(0, 300)); break; }
  for (const x of rows) { total++; byReason[x.reason] = (byReason[x.reason] ?? 0) + 1; owners.add(x.owner); pools.add(x.pool); if (x.oldOrderId === "0") zeroOld++; }
  if (rows.length < 1000) break;
  last = rows[rows.length - 1].id;
}
console.log(`  at ${now()}: isAmend=true rows ${total} by reason ${JSON.stringify(byReason)} oldOrderId=="0": ${zeroOld} owners ${owners.size} pools ${pools.size}`);

console.log(`\n## 7. Transactions on the Hideki RPC (${RPC})`);
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const client = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const T = "(uint128 oldOrderId, bool alwaysPlace, (bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) newOrder)[] requests";
const P = "(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k)[] requests";
const abi = parseAbi([
  `function placeOrders(${P}) returns (bool[] successes, uint128[] ids)`,
  `function amendOrders(${T}) returns (uint128[] newOrderIds)`,
  `function amendOrdersFor(address account, ${T}) returns (uint128[] newOrderIds)`,
]);
for (const f of abi) console.log(`  selector ${toFunctionSelector(f)} = ${f.name}`);
const sigs = ["AmendRejected(address,uint128,uint8,uint256)", "OrderRejected(address,uint8,uint256)", "OrderCancelled(uint128)"];
const t0 = Object.fromEntries(sigs.map((s) => [keccak256(toHex(s)), s]));
for (const [k, v] of Object.entries(t0)) console.log(`  topic0 ${k} = ${v}`);
const txs = [
  "0xd4ca61aada9f748782097974553b72cf00c5a83624c2a6e3510c8ca8d8382bab",
  "0xa1b322ee5a1c8883e08ec196bfa49bc3e06857cf8444d72b5ab83f9d206a887c",
  "0xacc5d5e968716e67d5359d71fde00d7b67bef6022a711ae187909859023bb128",
  rowsB[0].txHash,
];
const big = (k, v) => (typeof v === "bigint" ? v.toString() : v);
for (const hash of txs) {
  const tx = await client.getTransaction({ hash });
  const rc = await client.getTransactionReceipt({ hash });
  console.log(`\n  TX ${hash}\n    block ${rc.blockNumber} status ${rc.status} from ${tx.from} to ${tx.to} selector ${tx.input.slice(0, 10)}`);
  try {
    const d = decodeFunctionData({ abi, data: tx.input });
    const reqs = d.functionName === "amendOrdersFor" ? d.args[1] : d.args[0];
    const brief = reqs.map((q) => (q.newOrder ? { oldOrderId: q.oldOrderId, alwaysPlace: q.alwaysPlace, orderType: q.newOrder.orderType, isBid: q.newOrder.isBid } : { orderType: q.orderType, isBid: q.isBid }));
    console.log(`    decoded: ${d.functionName}${d.functionName === "amendOrdersFor" ? ` account ${d.args[0]}` : ""} requests ${JSON.stringify(brief, big)}`);
  } catch (e) { console.log(`    not decodable: ${(e.shortMessage ?? e.message).split("\n")[0]}`); }
  for (const l of rc.logs) {
    const name = t0[l.topics[0]];
    if (!name) { console.log(`    log ${l.logIndex} addr ${l.address} topic0 ${l.topics[0].slice(0, 18)}… (other)`); continue; }
    const tp = l.topics.slice(1).map((t) => BigInt(t));
    let extra = "";
    if (name.startsWith("AmendRejected")) extra = `owner 0x${tp[0].toString(16).padStart(40, "0")} oldOrderId ${tp[1]} reason ${tp[2]} requestIndex ${BigInt(l.data)}`;
    if (name.startsWith("OrderRejected")) extra = `owner 0x${tp[0].toString(16).padStart(40, "0")} reason ${tp[1]} requestIndex ${BigInt(l.data)}`;
    if (name.startsWith("OrderCancelled")) extra = `orderId ${tp[0]}`;
    console.log(`    log ${l.logIndex} addr ${l.address} ${name} ${extra}`);
  }
}
console.log(`\n# end ${now()}`);
