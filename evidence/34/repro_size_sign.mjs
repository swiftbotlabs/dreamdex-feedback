// dreamDEX perps (Somnia Tokyo testnet, chain 50383): what does the sign of LiquidationEvent.size mean?
// Read-only. Needs only `viem` (tested with 2.57.7) and Node 18+.
//
//   node repro_size_sign.mjs [N=60]
//
// For the newest N `PositionLiquidated` rows and every `PositionTakenOver` / `PositionTransferred` row in the public
// indexer (the rows `client.listLiquidations` returns), reads the liquidated account's position in that pool at
// block-1 (MarginBank.getPosition) and compares the sign of the row's `size` with the sign of the position.
import { createPublicClient, http, parseAbi, defineChain } from "viem";

const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const INDEXER = "https://hideki-dev.smk.somnia.host/v1/graphql";
const MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const chain = defineChain({ id: 50383, name: "Somnia Tokyo testnet", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const client = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const bank = parseAbi(["function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))"]);
const N = Number(process.argv[2] ?? 60);
const q = `query($n:Int!){
  liq: LiquidationEvent(where:{kind:{_eq:"PositionLiquidated"}}, order_by:[{blockNumber:desc},{id:desc}], limit:$n){ kind account pool size blockNumber txHash }
  tko: LiquidationEvent(where:{kind:{_in:["PositionTakenOver","PositionTransferred"]}}, order_by:[{blockNumber:desc},{id:desc}]){ kind account pool size blockNumber txHash } }`;
const r = await fetch(INDEXER, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q, variables: { n: N } }) });
const { liq, tko } = (await r.json()).data;
const tally = {};
for (const row of [...liq, ...tko]) {
  const pos = await client.readContract({ address: MB, abi: bank, functionName: "getPosition", args: [row.account, row.pool], blockNumber: BigInt(row.blockNumber) - 1n });
  const held = BigInt(pos.size) > 0n ? "long" : BigInt(pos.size) < 0n ? "short" : "flat";
  const sign = BigInt(row.size) > 0n ? "+" : "-";
  const key = `${row.kind}: position held ${held}, row size ${sign}`;
  tally[key] = (tally[key] ?? 0) + 1;
  if (tally[key] <= 2) console.log(`example  ${row.kind} block ${row.blockNumber} tx ${row.txHash} account ${row.account} held ${pos.size} row.size ${row.size}`);
}
console.log(`\n(read ${new Date().toISOString()})`);
for (const [k, v] of Object.entries(tally)) console.log(`${v.toString().padStart(4)}  ${k}`);
