// Case 1 aftermath: the NEAR position that the stop-loss left open. Mark and position at a few times after the stop
// fired, the block where the position went to zero, and the owner's NEAR stops and the resting 4.80 ask in the
// indexer. Read-only.
// usage: node after_case1.mjs
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
const c = createPublicClient({ transport: http("https://api.hideki2.infra.testnet.somnia.network", { timeout: 30_000, retryCount: 2 }) });
const IDX = "https://hideki-dev.smk.somnia.host/v1/graphql";
const POOL = "0x1cD15ae8bFf0FE0a7F49233BE8b90734775bA454", OWNER = "0x0c56a63043be6943eb4c7be73ad44afe75bb44f2";
const REG = "0xf3a51c26ead3f84c2221336484bb42b8cfca076e", FIRE = 33004739;
const pa = parseAbi(["function getMarkPrice() view returns (uint256)"]);
const ma = parseAbi(["function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))"]);
const tsc = new Map();
const ts = async (b) => { if (!tsc.has(b)) tsc.set(b, Number((await c.getBlock({ blockNumber: BigInt(b) })).timestamp)); return tsc.get(b); };
const head = Number(await c.getBlockNumber());
async function blockAt(t) { let lo = FIRE, hi = head; while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if ((await ts(m)) < t) lo = m; else hi = m; } return hi; }
const pos = async (b) => (await c.readContract({ address: "0x478769E1177C0773c43A593DCCc4Ad15F15F1394", abi: ma, functionName: "getPosition", args: [OWNER, POOL], blockNumber: BigInt(b) })).size;
const mark = async (b) => formatUnits(await c.readContract({ address: POOL, abi: pa, functionName: "getMarkPrice", blockNumber: BigInt(b) }), 18);
console.log(`run ${new Date().toISOString()}; stop-loss trigger was mark <= 4.60`);
console.log(`firing block ${FIRE} (${new Date((await ts(FIRE)) * 1000).toISOString()}): mark ${await mark(FIRE)}, position ${formatUnits(await pos(FIRE), 24)}`);
for (const iso of ["2026-10-25T20:00:00Z", "2026-10-26T00:00:00Z", "2026-10-26T02:23:00Z", "2026-10-26T02:58:30Z"]) {
  const b = await blockAt(Date.parse(iso) / 1000);
  console.log(`${iso} block ${b}: mark ${await mark(b)}, position ${formatUnits(await pos(b), 24)}`);
}
// first block at which the position is no longer 2,434.1
const start = await pos(FIRE);
let lo = FIRE, hi = await blockAt(Date.parse("2026-10-26T02:58:30Z") / 1000);
if ((await pos(hi)) !== start) {
  while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if ((await pos(m)) === start) lo = m; else hi = m; }
  console.log(`position changed from ${formatUnits(start, 24)} to ${formatUnits(await pos(hi), 24)} at block ${hi} (${new Date((await ts(hi)) * 1000).toISOString()}), mark ${await mark(hi)}`);
}
const gql = async (query, variables) => (await (await fetch(IDX, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) })).json());
const stops = await gql(`query($o:String!,$r:String!){ StopOrder(where:{owner:{_eq:$o},registry:{_eq:$r},createdAt:{_gte:"1792940000"}}, order_by:{createdAt:asc}){ orderIdRaw isBid quantity triggerPrice triggerOperator status dropReason cancelReason createdAt updatedAt } }`, { o: OWNER, r: REG });
for (const s of stops.data?.StopOrder ?? []) console.log(`stop ${s.orderIdRaw}: ${s.isBid ? "buy" : "sell"} ${formatUnits(BigInt(s.quantity), 24)} ${s.triggerOperator === 0 ? "GTE" : "LTE"} ${formatUnits(BigInt(s.triggerPrice), 18)} -> ${s.status}${s.cancelReason ? " (" + s.cancelReason + ")" : ""}, created ${new Date(Number(s.createdAt) * 1000).toISOString()}, updated ${new Date(Number(s.updatedAt) * 1000).toISOString()}`);
const ask = await gql(`query($id:String!){ Order(where:{id:{_eq:$id}}){ status price fullQuantity filledQuantity placedAtTimestamp lastUpdatedAtTimestamp cancelReason } }`, { id: POOL.toLowerCase() + "_737869762948391806990" });
console.log(`resting ask 737869762948391806990: ${JSON.stringify(ask.data?.Order?.[0] ?? ask.errors)}`);
