// Read-only census: open perp positions on Somnia Tokyo whose size is below their market's minQuantity.
// Pools from PerpPoolFactory.getPerpPoolStatuses(); book params from each pool; open positions from the
// public indexer (PerpPosition, size != 0); each dust row re-read on chain (MarginBank.getPosition);
// then the last PerpPositionChange per dust row, to show how it arose. Usage: node dust_census.mjs <out.json>
import { createPublicClient, http, parseAbi, defineChain } from "viem";
import fs from "node:fs";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const IDX = "https://hideki-dev.smk.somnia.host/v1/graphql";
const FACTORY = "0xE631fAEE547baeE07353E290f0562ea67d856560", MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const chain = defineChain({ id: 50383, name: "Somnia Tokyo", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const abi = parseAbi([
  "function getPerpPoolStatuses() view returns ((address perpPool, address baseToken, bool restricted)[] statuses)",
  "function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))",
  "function symbol() view returns (string)",
  "function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))",
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function gq(query, variables = {}) {
  const r = await fetch(IDX, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300)); return j.data;
}
const t0 = new Date().toISOString();
const idxHead = BigInt((await gq("{ chain_metadata { latest_processed_block } }")).chain_metadata[0].latest_processed_block);
const statuses = await c.readContract({ address: FACTORY, abi, functionName: "getPerpPoolStatuses", blockNumber: idxHead });
const book = {};
for (const s of statuses) {
  const bp = await c.readContract({ address: s.perpPool, abi, functionName: "getOrderBookParameters", blockNumber: idxHead });
  let sym = "?"; try { sym = await c.readContract({ address: s.baseToken, abi, functionName: "symbol" }); } catch {}
  book[s.perpPool.toLowerCase()] = { sym, min: bp.minQuantity, lot: bp.lotSize };
}
const all = [];
for (let off = 0; ; off += 1000) {
  const d = await gq(`{ PerpPosition(where:{size:{_neq:"0"}}, order_by:{id:asc}, limit:1000, offset:${off}){ pool account size isLong updatedAtBlock } }`);
  all.push(...d.PerpPosition); if (d.PerpPosition.length < 1000) break; await sleep(300);
}
const below = all.filter((p) => book[p.pool] && BigInt(p.size) < book[p.pool].min);
const rows = [];
for (const p of below) {
  const b = book[p.pool];
  const pos = await c.readContract({ address: MB, abi, functionName: "getPosition", args: [p.account, p.pool], blockNumber: idxHead });
  const d = await gq(`query($a:String!,$p:String!){ PerpPositionChange(where:{account:{_eq:$a}, pool:{_eq:$p}}, order_by:[{blockNumber:desc},{logIndex:desc}], limit:1){ kind sizeBefore sizeAfter closedSize blockNumber timestamp txHash } }`, { a: p.account, p: p.pool });
  rows.push({ sym: b.sym, pool: p.pool, account: p.account, indexerSize: (p.isLong ? "" : "-") + p.size, chainSize: pos.size.toString(), minQuantity: b.min.toString(), lotSize: b.lot.toString(), lastChange: d.PerpPositionChange[0] ?? null });
  await sleep(200);
}
const bySym = {}, byKind = {}; let chainAgrees = 0;
for (const r of rows) { bySym[r.sym] = (bySym[r.sym] ?? 0) + 1; const k = r.lastChange?.kind ?? "none"; byKind[k] = (byKind[k] ?? 0) + 1; if (r.chainSize === r.indexerSize) chainAgrees++; }
const summary = { startedUtc: t0, finishedUtc: new Date().toISOString(), indexerHeadBlock: idxHead.toString(), pools: statuses.length, openPositions: all.length, belowMinQuantity: rows.length, chainSizeMatchesIndexer: chainAgrees, belowMinByMarket: bySym, lastChangeKind: byKind };
console.log(JSON.stringify(summary, null, 1));
for (const r of rows.slice(0, 8)) console.log(r.sym, r.account, "size", r.chainSize, "min", r.minQuantity, "| last", r.lastChange?.kind, r.lastChange?.sizeBefore, "->", r.lastChange?.sizeAfter, r.lastChange?.txHash);
fs.writeFileSync(process.argv[2] ?? "dust_census.json", JSON.stringify({ summary, rows }, null, 1));
