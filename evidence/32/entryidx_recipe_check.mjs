// Read-only check of the PerpPosition.entryFundingIndex description recipe against the chain.
// Usage (from products/dreamdex): node <this file> <perpPool> [rowsPerSide] [asc|desc]
// GraphQL reads on the documented indexer + eth_call on Somnia Tokyo (chain 50383). Nothing is sent.
import { createPublicClient, http, parseAbi } from "viem";
import fs from "node:fs";

const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const GQL = "https://hideki-dev.smk.somnia.host/v1/graphql";
const BANK = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const pool = process.argv[2].toLowerCase();
const n = Number(process.argv[3] || 3);
const order = process.argv[4] === "asc" ? "asc" : "desc"; // optional: "asc" = smallest positions first

const client = createPublicClient({ transport: http(RPC) });
const poolAbi = parseAbi([
  "function getProjectedCumulativeFundingPerUnit() view returns (int256)",
  "function getOneBase() view returns (uint256)",
]);
const bankAbi = parseAbi([
  "function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))",
]);
async function gql(query) {
  const r = await fetch(GQL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}
// Signed ceiling division, as SDK 0.32.1 src/perp/margin.ts divCeilSigned / the protocol's divCeilInt.
const ceilDivSigned = (a, b) => { const q = a / b; return a % b !== 0n && (a < 0n) === (b < 0n) ? q + 1n : q; };
const usd = (x) => (Number(x) / 1e18).toFixed(6);

const chainId = await client.getChainId();
const block = await client.getBlockNumber();
const [proj, oneBase] = await Promise.all([
  client.readContract({ address: pool, abi: poolAbi, functionName: "getProjectedCumulativeFundingPerUnit", blockNumber: block }),
  client.readContract({ address: pool, abi: poolAbi, functionName: "getOneBase", blockNumber: block }),
]);
const out = { utc: new Date().toISOString(), chainId, block: block.toString(), pool, projected: proj.toString(), oneBase: oneBase.toString(), rows: [] };
console.log(`UTC ${out.utc} chainId ${chainId} block ${block} pool ${pool}\n  getProjectedCumulativeFundingPerUnit() = ${proj}\n  getOneBase() = ${oneBase}`);

for (const isLong of [true, false]) {
  const d = await gql(`{ PerpPosition(where:{pool:{_eq:"${pool}"}, isLong:{_eq:${isLong}}, size:{_gt:"0"}, entryFundingIndex:{_is_null:false}}, limit:${n}, order_by:{size:${order}}) { account isLong size entryFundingIndex updatedAtBlock } }`);
  for (const row of d.PerpPosition) {
    const pos = await client.readContract({ address: BANK, abi: bankAbi, functionName: "getPosition", args: [row.account, pool], blockNumber: block });
    const absSize = BigInt(row.size);
    const entry = BigInt(row.entryFundingIndex);
    const signed = row.isLong ? absSize : -absSize;
    const delta = proj - entry;
    const recipe = delta * absSize;                                   // the description, literally (PerpPosition.size is absolute)
    const recipeDiv1e18 = delta * absSize / 10n ** 18n;               // most charitable reading of "1e18-scaled"
    const owed = ceilDivSigned(signed * delta, 10n ** 18n * oneBase); // SDK accruedFunding = MarginBank FundingSettled
    const rowMatchesChain = pos.size === signed && pos.entryFundingIndex === entry;
    const r = { account: row.account, isLong: row.isLong, indexerSize: row.size, chainSize: pos.size.toString(),
      indexerEntry: row.entryFundingIndex, chainEntry: pos.entryFundingIndex.toString(), rowMatchesChain,
      delta: delta.toString(), recipe: recipe.toString(), recipeDiv1e18: recipeDiv1e18.toString(),
      owedAtoms: owed.toString(), owedUSDso: usd(owed), recipeOverOwed: owed === 0n ? null : (recipe / owed).toString() };
    out.rows.push(r);
    console.log(`${row.isLong ? "LONG " : "SHORT"} ${row.account}  indexer size ${row.size} (isLong ${row.isLong}) | chain size ${pos.size} | entry match ${pos.entryFundingIndex === entry} | rowMatchesChain ${rowMatchesChain}`);
    console.log(`   proj - entry                          = ${delta}`);
    console.log(`   description: (proj - entry) * size    = ${recipe}`);
    console.log(`   same, / 1e18                          = ${recipeDiv1e18}`);
    console.log(`   chain/SDK: ceil(signedSize*(proj-entry) / (1e18*oneBase)) = ${owed}  (${usd(owed)} USDso; + pays, - receives)`);
    console.log(`   description / chain                   = ${r.recipeOverOwed}`);
  }
}
const file = new URL(`./entryidx_recipe_check_${pool.slice(0, 10)}_${out.utc.slice(0, 16).replace(/:/g, "")}Z.json`, import.meta.url);
fs.writeFileSync(file, JSON.stringify(out, null, 2));
