// What DreamFly's recorder gets when it asks for a live window's open price.
// DreamFly v1.0.0 perp/ec_recorder.mjs readOpen() -> readResolution(getMarketResolution(id)).open = openingAnswer.numericValue.
// Run with @somnia-chain/markets-sdk 0.32.1 (DreamFly's lockfile pin) and viem: node opening_answer_check.mjs [mainnet|testnet|hideki]
import { SomniaMarkets, SOMNIA_MAINNET_ADDRESSES, SOMNIA_TESTNET_ADDRESSES, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { defineChain } from "viem";
const NET = {
  mainnet: { rpc: "https://api.infra.mainnet.somnia.network", indexer: "https://prd.smk.somnia.host/v1/graphql", id: 5031, addresses: SOMNIA_MAINNET_ADDRESSES },
  testnet: { rpc: "https://api.infra.testnet.somnia.network", indexer: "https://dev.smk.somnia.host/v1/graphql", id: 50312, addresses: SOMNIA_TESTNET_ADDRESSES },
  hideki: { rpc: "https://api.hideki2.infra.testnet.somnia.network", indexer: "https://hideki-dev.smk.somnia.host/v1/graphql", id: 50383, addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES },
};
const name = process.argv[2] || "mainnet", n = NET[name];
const chain = defineChain({ id: n.id, name, nativeCurrency: { name: "X", symbol: "X", decimals: 18 }, rpcUrls: { default: { http: [n.rpc] } } });
const ex = new SomniaMarkets({ indexerUrl: n.indexer, chain, addresses: n.addresses });
const now = Math.floor(Date.now() / 1000);
const q = `{ Market(where:{marketType:{_eq:BINARY}, expiry:{_gt:"${now}"}}, order_by:{expiry:asc}, limit:20) { marketId asset intervalSec expiry strike question } }`;
const rows = (await (await fetch(n.indexer, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q }) })).json()).data.Market;
console.log(`${name}: ${rows.length} live windows at ${new Date().toISOString()}`);
let nulls = 0;
for (const m of rows) {
  const res = await ex.client.getMarketResolution(m.marketId);
  if (res.openingAnswer == null) nulls++;
  console.log(`  ${m.asset} ${m.intervalSec}s expiry ${m.expiry} strike ${m.strike} | openingAnswer ${res.openingAnswer === null ? "null" : JSON.stringify(res.openingAnswer)} reference ${res.reference === null ? "null" : "set"} | ${m.question}`);
}
console.log(`openingAnswer null on ${nulls} of ${rows.length}`);
process.exit(0);
