// Report 56 (read-only). For each account: count its resting perp orders on every Tokyo (DreamDEX region, chain 50383) pool on chain,
// and count the open orders the two testnet indexers return for it (Tokyo hideki-dev, Global/Shannon dev).
// The on-chain count calls pool.getOwnOpenOrders() as an eth_call "from" the account: no transaction, no key.
// Usage: node evidence/56/open_orders_check.mjs 0xACCOUNT [0xACCOUNT ...]
import { createPublicClient, http, parseAbi, defineChain } from "viem";

const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const FACTORY = "0xE631fAEE547baeE07353E290f0562ea67d856560"; // PerpPoolFactory, docs: /docs/developers/perps-testnet
const chain = defineChain({ id: 50383, name: "Somnia Tokyo testnet", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const client = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const factoryAbi = parseAbi(["function getPerpPools() view returns (address[])", "function getBaseTokenForPool(address) view returns (address)"]);
const poolAbi = parseAbi(["function getOwnOpenOrders() view returns (uint128[])"]);
const erc20Abi = parseAbi(["function symbol() view returns (string)"]);

async function gql(url, query) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
  return r.json();
}
async function indexerOpen(url, account) {
  // Same filter as an "open orders" list: status Open, owner = account. Up to 500 rows.
  const t0 = Date.now();
  const r = await gql(url, `{ Order(where:{owner:{_eq:"${account}"}, status:{_eq:"Open"}}, limit:500) { market_id } }`);
  const ms = Date.now() - t0;
  if (r.errors) return { error: r.errors.map((e) => e.message).join("; "), ms };
  const by = {};
  for (const o of r.data.Order) by[o.market_id] = (by[o.market_id] ?? 0) + 1;
  return { open: r.data.Order.length, byMarketId: by, ms };
}

const pools = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getPerpPools" });
const names = {};
for (const p of pools) {
  const base = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getBaseTokenForPool", args: [p] });
  names[p] = (await client.readContract({ address: base, abi: erc20Abi, functionName: "symbol" })) + "-PERP";
}
for (const raw of process.argv.slice(2)) {
  const account = raw.toLowerCase();
  const block = await client.getBlockNumber();
  const per = {};
  let total = 0;
  for (const p of pools) {
    const ids = await client.readContract({ address: p, abi: poolAbi, functionName: "getOwnOpenOrders", account, blockNumber: block });
    if (ids.length) per[names[p]] = ids.length;
    total += ids.length;
  }
  const tokyo = await indexerOpen("https://hideki-dev.smk.somnia.host/v1/graphql", account);
  const global = await indexerOpen("https://dev.smk.somnia.host/v1/graphql", account);
  console.log(JSON.stringify({
    at: new Date().toISOString(), account,
    chain_tokyo_50383: { block: block.toString(), restingOrders: total, perMarket: per },
    indexer_tokyo_hideki_dev: tokyo,
    indexer_global_dev_shannon: global,
  }, null, 1));
}
