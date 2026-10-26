// dreamDEX perps (Somnia Tokyo testnet, chain 50383): sign of LiquidationEvent.size, row by row.
// Read-only (eth_getTransactionReceipt, eth_call, one indexer query). Needs viem (tested 2.57.7), Node 18+.
//   node check_rows.mjs <txHash> [txHash ...]
// For each PositionLiquidated / PositionTakenOver / PositionTransferred log in the tx it prints the signed size
// from the raw log, the indexer row's `size` (what client.listLiquidations returns), and the account's
// MarginBank position at block-1 and at the block.
import { createPublicClient, http, parseAbi, defineChain, decodeEventLog } from "viem";

const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const INDEXER = "https://hideki-dev.smk.somnia.host/v1/graphql";
const MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const chain = defineChain({ id: 50383, name: "Somnia Tokyo testnet", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000, retryCount: 3 }) });
const bank = parseAbi(["function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))"]);
const ev = parseAbi([
  "event PositionLiquidated(address indexed account, address indexed perpPool, int128 sizeDelta, uint256 markPrice)",
  "event PositionTakenOver(address indexed account, address indexed bidder, address indexed perpPool, int128 size, uint256 takeoverPrice)",
  "event PositionTransferred(address indexed from, address indexed to, address indexed perpPool, int128 size, uint256 collateralTransferred)",
]);
const side = (n) => (n > 0n ? "long" : n < 0n ? "short" : "flat");
console.log(`run ${new Date().toISOString()}`);
for (const h of process.argv.slice(2)) {
  const rc = await c.getTransactionReceipt({ hash: h });
  const ids = [];
  const legs = [];
  for (const l of rc.logs) {
    let d;
    try { d = decodeEventLog({ abi: ev, data: l.data, topics: l.topics }); } catch { continue; }
    const a = d.args;
    const account = a.account ?? a.from;
    const size = a.sizeDelta ?? a.size;
    const id = `${h.toLowerCase()}_${l.logIndex}`;
    ids.push(id);
    const pre = (await c.readContract({ address: MB, abi: bank, functionName: "getPosition", args: [account, a.perpPool], blockNumber: rc.blockNumber - 1n })).size;
    const post = (await c.readContract({ address: MB, abi: bank, functionName: "getPosition", args: [account, a.perpPool], blockNumber: rc.blockNumber })).size;
    legs.push({ id, kind: d.eventName, account, pool: a.perpPool, size, pre, post });
  }
  const r = await fetch(INDEXER, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: `query($ids:[String!]!){ LiquidationEvent(where:{id:{_in:$ids}}){ id kind size } }`, variables: { ids } }) });
  const rows = Object.fromEntries(((await r.json()).data?.LiquidationEvent ?? []).map((x) => [x.id, x]));
  console.log(`tx ${h} block ${rc.blockNumber} status ${rc.status}`);
  for (const g of legs) {
    console.log(`  ${g.kind} log ${g.id.split("_")[1]} account ${g.account} pool ${g.pool}`);
    console.log(`    raw log size ${g.size} | indexer row ${rows[g.id]?.kind ?? "-"} size ${rows[g.id]?.size ?? "-"}`);
    console.log(`    position at block-1 ${g.pre} (${side(g.pre)}) | at block ${g.post} (${side(g.post)}) | row size ${g.size > 0n ? "positive" : "negative"} | ${g.size === g.post - g.pre ? "size == post - pre" : "size != post - pre"}`);
  }
}
