// Read-only follow-ups: (1) positive control for the owner/registry StopOrder query (all rows, no time filter),
// (2) each owner's position now, (3) for each case: the first block after the fire where the mark crossed the
// cancelled sibling's trigger while the owner still held the leftover position (sampled hourly, then bisected).
// usage: node leftover_watch.mjs <case json written by fired_leg_case.mjs> [...]
import { createPublicClient, http, parseAbi, defineChain, formatUnits, parseUnits } from "viem";
import { readFileSync } from "node:fs";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const IDX = "https://hideki-dev.smk.somnia.host/v1/graphql";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000, retryCount: 2 }) });
const MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const bank = parseAbi(["function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))"]);
const poolAbi = parseAbi(["function tryGetMarkPrice() view returns (bool ok, uint256 price)"]);
const gql = async (query, variables) => (await (await fetch(IDX, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) })).json());
const head = await c.getBlock();
const res = [];
for (const f of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(f, "utf8"));
  const BD = d.baseDecimals, fq = (v) => formatUnits(BigInt(v), BD), f18 = (v) => formatUnits(BigInt(v), 18);
  const all = await gql(`query($o:String!,$r:String!){ StopOrder(where:{owner:{_eq:$o},registry:{_eq:$r}}, order_by:{createdAt:desc}, limit:5){ orderIdRaw status cancelReason createdAt updatedAt } }`, { o: d.owner.toLowerCase(), r: d.registry.toLowerCase() });
  const posNow = await c.readContract({ address: MB, abi: bank, functionName: "getPosition", args: [d.owner, d.pool], blockNumber: head.number });
  const sib = d.sibling.before, trigPx = parseUnits(sib.triggerPrice, 18), gte = sib.triggerOperator === 0; // 0 = GTE, 1 = LTE (per the registry's operator enum: GTE leg above LTE leg)
  const leftover = BigInt(Math.round(Number(d.positionAfter) * 10 ** BD));
  const b0 = BigInt(d.block), step = 36000n; // ~1 h at ~10 blocks/s
  let crossed = null, changed = null, prevB = b0;
  for (let b = b0 + step; b <= head.number; b += step) {
    const [m, p] = await Promise.all([c.readContract({ address: d.pool, abi: poolAbi, functionName: "tryGetMarkPrice", blockNumber: b }), c.readContract({ address: MB, abi: bank, functionName: "getPosition", args: [d.owner, d.pool], blockNumber: b })]);
    if (!changed && p.size !== leftover) changed = { atOrBeforeBlock: String(b), size: fq(p.size) };
    const hit = gte ? m[1] >= trigPx : m[1] <= trigPx;
    if (hit && !crossed) {
      // bisect for the first crossing block in (prevB, b]
      let lo = prevB, hi = b;
      while (hi - lo > 1n) { const mid = (lo + hi) / 2n; const mm = await c.readContract({ address: d.pool, abi: poolAbi, functionName: "tryGetMarkPrice", blockNumber: mid }); if (gte ? mm[1] >= trigPx : mm[1] <= trigPx) hi = mid; else lo = mid; }
      const [mb, pbk, blk] = await Promise.all([c.readContract({ address: d.pool, abi: poolAbi, functionName: "tryGetMarkPrice", blockNumber: hi }), c.readContract({ address: MB, abi: bank, functionName: "getPosition", args: [d.owner, d.pool], blockNumber: hi }), c.getBlock({ blockNumber: hi })]);
      crossed = { block: String(hi), timeUTC: new Date(Number(blk.timestamp) * 1000).toISOString(), mark: f18(mb[1]), positionThen: fq(pbk.size) };
    }
    if (crossed && changed) break;
    prevB = b;
  }
  res.push({ case: f.split("/").pop(), owner: d.owner, cancelledSibling: d.sibling.id, siblingTrigger: sib.triggerPrice, siblingOp: gte ? "GTE" : "LTE", leftoverAfterFire: d.positionAfter,
    ownerRecentStopRows: all.data?.StopOrder, positionNow: fq(posNow.size),
    firstMarkCrossOfCancelledSiblingTrigger: crossed, firstHourlySampleWithPositionChanged: changed });
}
console.log(JSON.stringify({ headBlock: String(head.number), headTimeUTC: new Date(Number(head.timestamp) * 1000).toISOString(), res }, null, 1));
