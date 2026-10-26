// Read-only check: units of fundingRate / cumulativeFundingPerUnit in the REST API of api.testnet.dreamdex.io,
// compared with the same perp pools read on their chain (Somnia Shannon testnet, chain 50312, the only chain the
// host's OpenAPI spec serves). eth_call / eth_getTransactionReceipt and public GETs only; nothing is sent.
// Usage (from a directory where viem 2.57.7 resolves): node funding_units_check.mjs [outFile.json]
import { createPublicClient, http, defineChain, parseAbi, parseAbiItem, decodeEventLog, formatUnits, keccak256, toHex } from "viem";
import fs from "node:fs";

const API = "https://api.testnet.dreamdex.io";
const shannon = defineChain({ id: 50312, name: "Somnia Shannon", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: ["https://dream-rpc.somnia.network"] } } });
const C = createPublicClient({ chain: shannon, transport: http(undefined, { timeout: 60_000 }) });
const abi = parseAbi([
  "function getCurrentFundingRate() view returns (int256)",
  "function getCumulativeFundingPerUnit() view returns (int256)",
  "function getIndexPrice() view returns (uint256 price, uint256 updatedAt)",
  "function getLastFundingUpdateTimestampNs() view returns (uint64)",
]);
const FU_SIG = "FundingUpdated(int256,int256,uint256,uint64,uint256)";
const FU = parseAbiItem("event FundingUpdated(int256 fundingRate, int256 cumulativeFundingPerUnit, uint256 indexPrice, uint64 intervalsSettled, uint256 markPrice)");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (path) => { await sleep(300); const r = await fetch(API + path); return { status: r.status, json: await r.json() }; };
// exact decimal string of a signed bigint divided by 10^d (no float rounding)
const div = (v, d) => formatUnits(BigInt(v), d);

const out = { startedUtc: new Date().toISOString(), api: API, rpc: "https://dream-rpc.somnia.network" };
out.chainIdFromRpc = await C.getChainId();

const spec = (await get("/.well-known/oapi.json")).json;
out.spec = {
  servers: spec.servers,
  fundingRouteDescription: spec.paths["/v0/markets/{symbol}/funding"].get.description,
  fundingRouteTags: spec.paths["/v0/markets/{symbol}/funding"].get.tags,
  chainIdParam: (spec.paths["/v0/markets/{symbol}/funding"].get.parameters || []).filter((p) => p.name === "chainId").map((p) => ({ description: p.description, schema: p.schema })),
  SignedAmount: spec.components.schemas.SignedAmount,
  Price: spec.components.schemas.Price,
};

const markets = (await get("/v0/markets?kind=perp")).json.markets;
out.perpMarkets = markets.length;
out.marketChainIds = [...new Set(markets.map((m) => m.chainId))];

const rows = [];
for (const m of markets) {
  const rest = await get(`/v0/markets/${encodeURIComponent(m.symbol)}/funding?kind=perp&limit=3`);
  const bn = await C.getBlockNumber();
  const rd = (f) => C.readContract({ address: m.contract, abi, functionName: f, blockNumber: bn });
  const [rate, cum, [idx], lastNs] = await Promise.all([rd("getCurrentFundingRate"), rd("getCumulativeFundingPerUnit"), rd("getIndexPrice"), rd("getLastFundingUpdateTimestampNs")]);
  const cur = rest.json.current || {};
  const row = {
    symbol: m.symbol, pool: m.contract, restChainId: m.chainId, quoteDecimals: m.quoteDecimals, block: bn.toString(),
    lastSettleUtc: new Date(Number(lastNs / 1_000_000n)).toISOString(),
    chain: { fundingRate: rate.toString(), cumulativeFundingPerUnit: cum.toString(), indexPrice: idx.toString() },
    restFunding: { status: rest.status, fundingRate: cur.fundingRate, cumulativeFundingPerUnit: cur.cumulativeFundingPerUnit, indexPrice: cur.indexPrice, asOf: cur.asOf },
    restMarketsPerp: { fundingRate: m.perp?.fundingRate, cumulativeFundingPerUnit: m.perp?.cumulativeFundingPerUnit, indexPrice: m.perp?.indexPrice },
  };
  row.check = {
    restRate_eq_chain: cur.fundingRate === rate.toString(),
    restRate_eq_chain_div_1e18: cur.fundingRate === div(rate, 18),
    restCum_eq_chain: cur.cumulativeFundingPerUnit === cum.toString(),
    restCum_eq_chain_div_1e18: cur.cumulativeFundingPerUnit === div(cum, 18),
    restCum_eq_chain_div_1e36: cur.cumulativeFundingPerUnit === div(cum, 36),
    restIndex_eq_chain_div_1e18: cur.indexPrice === div(idx, 18),
    chain_cum_div_1e36_humanQuotePerBase: div(cum, 36),
  };
  rows.push(row);
}
out.markets = rows;
out.summary = {
  markets: rows.length,
  restRate_eq_chain: rows.filter((r) => r.check.restRate_eq_chain).length,
  restRate_eq_chain_div_1e18: rows.filter((r) => r.check.restRate_eq_chain_div_1e18).length,
  restCum_eq_chain: rows.filter((r) => r.check.restCum_eq_chain).length,
  restCum_eq_chain_div_1e18: rows.filter((r) => r.check.restCum_eq_chain_div_1e18).length,
  restCum_eq_chain_div_1e36: rows.filter((r) => r.check.restCum_eq_chain_div_1e36).length,
  mismatches: rows.filter((r) => !r.check.restRate_eq_chain_div_1e18 || !r.check.restCum_eq_chain_div_1e18).map((r) => r.symbol),
};

// ADA: REST history vs the FundingUpdated logs the contract emitted, and the hourly step of the cumulative
const adaHist = (await get("/v0/markets/ADA%3AUSDso/funding?kind=perp&limit=3")).json.history;
out.adaHistory = adaHist;
out.fundingUpdatedTopic0 = keccak256(toHex(FU_SIG));
out.adaLogs = [];
for (const h of ["0x82abff71ce6984281e37f716d3d1373f734e564c032aeb6ccf1292ad28c92baf", "0xa67746668780a74e39380b1fc9eb1db12c10d086d7a30daea863d3f864daca7e"]) {
  const rc = await C.getTransactionReceipt({ hash: h });
  for (const l of rc.logs) {
    if (l.topics[0] !== out.fundingUpdatedTopic0) continue;
    const d = decodeEventLog({ abi: [FU], data: l.data, topics: l.topics });
    out.adaLogs.push({ tx: h, block: rc.blockNumber.toString(), emitter: l.address, fundingRate: d.args.fundingRate.toString(), cumulativeFundingPerUnit: d.args.cumulativeFundingPerUnit.toString(), cum_div_1e18: div(d.args.cumulativeFundingPerUnit, 18), indexPrice: d.args.indexPrice.toString(), intervalsSettled: d.args.intervalsSettled.toString() });
  }
}
// step between consecutive REST history points, vs fundingRate x indexPrice / 8 (docs: hourly payment = size x index x rate / 8)
out.adaSteps = [];
for (let i = 0; i + 1 < adaHist.length; i++) {
  const a = adaHist[i], b = adaHist[i + 1];
  const scale = (s) => { const [w, f = ""] = s.split("."); return BigInt(w + f.padEnd(36, "0").slice(0, 36)); }; // decimal string -> x1e36 bigint
  const step36 = scale(a.cumulativeFundingPerUnit) - scale(b.cumulativeFundingPerUnit);
  const humanHourly36 = (scale(a.fundingRate) * scale(a.indexPrice)) / 10n ** 36n / 8n; // USDso per whole base, x1e36
  out.adaSteps.push({ from: new Date(b.timestamp).toISOString(), to: new Date(a.timestamp).toISOString(), restStep: div(step36, 36), humanHourlyFunding_USDso_per_base: div(humanHourly36, 36), restStep_div_humanHourly: humanHourly36 === 0n ? null : div((step36 * 10n ** 18n) / humanHourly36, 18) });
}
out.finishedUtc = new Date().toISOString();
const txt = JSON.stringify(out, null, 1);
if (process.argv[2]) fs.writeFileSync(process.argv[2], txt);
console.log(JSON.stringify({ startedUtc: out.startedUtc, finishedUtc: out.finishedUtc, chainIdFromRpc: out.chainIdFromRpc, marketChainIds: out.marketChainIds, summary: out.summary, adaSteps: out.adaSteps }, null, 1));
