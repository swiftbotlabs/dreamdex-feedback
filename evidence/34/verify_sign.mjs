// dreamDEX perps (Somnia Tokyo testnet, chain 50383): sign of LiquidationEvent.size vs the side of the position being closed (newest N PositionLiquidated rows).
// Read-only. Needs only `viem` (tested with 2.57.7) and Node 18+.
//   node verify_sign.mjs [N=80]
// For each indexer row it (1) fetches the tx receipt from the public RPC and decodes the raw event log itself
// (does NOT trust the indexer's size), (2) reads MarginBank.getPosition(account,pool) at block-1 and at block,
// (3) lists the PositionUpdated newSize sequence for that account/pool inside the same tx.
import { createPublicClient, http, parseAbi, defineChain, decodeEventLog, toEventSelector } from "viem";

const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const INDEXER = "https://hideki-dev.smk.somnia.host/v1/graphql";
const MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const chain = defineChain({ id: 50383, name: "Somnia Tokyo testnet", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const client = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000, retryCount: 3 }) });
const bankAbi = parseAbi(["function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))"]);
const evAbi = parseAbi([
  "event PositionLiquidated(address indexed account, address indexed perpPool, int128 sizeDelta, uint256 markPrice)",
  "event PositionTakenOver(address indexed account, address indexed bidder, address indexed perpPool, int128 size, uint256 takeoverPrice)",
  "event PositionTransferred(address indexed from, address indexed to, address indexed perpPool, int128 size, uint256 collateralTransferred)",
  "event PositionUpdated(address indexed account, address indexed perpPool, int128 newSize, uint128 avgEntryPrice, int256 realizedPnl, int256 entryFundingIndex)",
]);
const sel = Object.fromEntries(["PositionLiquidated", "PositionTakenOver", "PositionTransferred", "PositionUpdated"].map(n => [toEventSelector(evAbi.find(e => e.name === n)), n]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const N = Number(process.argv[2] ?? 80);
const q = `query($n:Int!){
  liq: LiquidationEvent(where:{kind:{_eq:"PositionLiquidated"}}, order_by:[{blockNumber:desc},{id:desc}], limit:$n){ id kind account pool size blockNumber txHash }
  tko: LiquidationEvent(where:{kind:{_in:["PositionTakenOver","PositionTransferred"]}}, order_by:[{blockNumber:desc},{id:desc}]){ id kind account pool size counterparty blockNumber txHash }
  all: LiquidationEvent(where:{kind:{_eq:"PositionLiquidated"}}){ id } }`;
const started = new Date().toISOString();
const resp = await fetch(INDEXER, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q, variables: { n: N } }) });
const j = await resp.json();
if (j.errors) { console.log("indexer errors", JSON.stringify(j.errors).slice(0, 400)); }
const { liq, tko } = j.data;
console.log(`started ${started}; indexer total PositionLiquidated rows: ${j.data.all?.length ?? "n/a"}; fetched ${liq.length} liq + ${tko.length} takeover/transfer`);
const tally = {};
const rcache = new Map();
const lines = [];
for (const row of [...liq, ...tko]) {
  const logIndex = Number(row.id.split("_").pop());
  let rc = rcache.get(row.txHash);
  if (!rc) { rc = await client.getTransactionReceipt({ hash: row.txHash }); rcache.set(row.txHash, rc); await sleep(120); }
  // decode raw log at this log index
  const lg = rc.logs.find(l => Number(l.logIndex) === logIndex);
  let chainSize = null, chainKind = null;
  if (lg && sel[lg.topics[0]]) {
    const d = decodeEventLog({ abi: evAbi, data: lg.data, topics: lg.topics });
    chainKind = d.eventName;
    chainSize = d.eventName === "PositionLiquidated" ? d.args.sizeDelta : d.args.size;
  }
  const acct = row.account.toLowerCase(), pool = row.pool.toLowerCase();
  // PositionUpdated sequence for this account/pool in the tx
  const ups = rc.logs.filter(l => l.topics[0] && sel[l.topics[0]] === "PositionUpdated").map(l => decodeEventLog({ abi: evAbi, data: l.data, topics: l.topics }))
    .filter(d => d.args.account.toLowerCase() === acct && d.args.perpPool.toLowerCase() === pool).map(d => d.args.newSize.toString());
  const pre = (await client.readContract({ address: MB, abi: bankAbi, functionName: "getPosition", args: [row.account, row.pool], blockNumber: BigInt(row.blockNumber) - 1n })).size;
  await sleep(120);
  const post = (await client.readContract({ address: MB, abi: bankAbi, functionName: "getPosition", args: [row.account, row.pool], blockNumber: BigInt(row.blockNumber) })).size;
  await sleep(120);
  const held = pre > 0n ? "long" : pre < 0n ? "short" : "flat";
  const s = BigInt(row.size);
  const sign = s > 0n ? "+" : s < 0n ? "-" : "0";
  const match = chainSize !== null && chainSize === s && chainKind === row.kind ? "chainlog==row" : `MISMATCH(chain ${chainKind} ${chainSize})`;
  const relation = (pre > 0n) === (s > 0n) ? "same-sign-as-position" : "opposite-sign-to-position";
  const key = `${row.kind}: held ${held}, row.size ${sign} (${relation})`;
  tally[key] = (tally[key] ?? 0) + 1;
  const deltaOk = (post - pre) === s ? "post-pre==size" : `post-pre=${post - pre}`;
  lines.push(`${row.kind} blk ${row.blockNumber} id ${row.id} acct ${row.account} pool ${row.pool} pre ${pre} post ${post} row.size ${row.size} [${match}] [${deltaOk}] PU-seq ${ups.join("->") || "-"}`);
  const mm = tally[`mm:${match}`] = (tally[`mm:${match}`] ?? 0) + 1;
}
for (const l of lines) console.log(l);
console.log(`\nfinished ${new Date().toISOString()}`);
for (const [k, v] of Object.entries(tally)) console.log(`${String(v).padStart(4)}  ${k}`);
