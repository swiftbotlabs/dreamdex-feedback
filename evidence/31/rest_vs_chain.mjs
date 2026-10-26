// Read-only: compare the REST /v0/markets/{symbol}/funding answer of api.testnet.dreamdex.io with the
// same pool read on its chain (Shannon 50312, the only chain that deployment serves), and check whether the
// pool exists on Tokyo/Hideki (50383).  Usage: node rest_vs_chain.mjs ADA:USDso
import { createPublicClient, http, defineChain, parseAbi, parseAbiItem } from "viem";
import fs from "node:fs";
const sym = process.argv[2] || "ADA:USDso";
const REST = `https://api.testnet.dreamdex.io/v0/markets/${sym}/funding?kind=perp&limit=3`;
const sh = defineChain({ id: 50312, name: "Shannon", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: ["https://dream-rpc.somnia.network"] } } });
const hk = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: ["https://api.hideki2.infra.testnet.somnia.network"] } } });
const S = createPublicClient({ chain: sh, transport: http(undefined, { timeout: 60_000 }) });
const H = createPublicClient({ chain: hk, transport: http(undefined, { timeout: 60_000 }) });
const abi = parseAbi([
  "function getCurrentFundingRate() view returns (int256)",
  "function getCumulativeFundingPerUnit() view returns (int256)",
  "function getOneBase() view returns (uint256)",
  "function getIndexPrice() view returns (uint256 price, uint256 updatedAt)",
  "function getLastFundingUpdateTimestampNs() view returns (uint64)",
  "function getFundingParameters() view returns ((uint256 fundingCalculationWindowSec, uint256 fundingSettlementIntervalSec, int256 interestRatePerWindow, uint256 maxFundingRatePerWindow, uint256 dampener, uint256 emaSmoothingAlpha, uint256 maxOracleStalenessSec))",
]);
const FU = parseAbiItem("event FundingUpdated(int256 fundingRate, int256 cumulativeFundingPerUnit, uint256 indexPrice, uint64 intervalsSettled, uint256 markPrice)");
const markets = await fetch("https://api.testnet.dreamdex.io/v0/markets?kind=perp").then((r) => r.json());
const m = markets.markets.find((x) => x.symbol === sym);
const rest = await fetch(REST).then((r) => r.json());
const pool = m.contract;
const bn = await S.getBlockNumber();
const r = (f) => S.readContract({ address: pool, abi, functionName: f, blockNumber: bn });
const [rate, cum, oneBase, [ip], lastNs, fp] = await Promise.all([r("getCurrentFundingRate"), r("getCumulativeFundingPerUnit"), r("getOneBase"), r("getIndexPrice"), r("getLastFundingUpdateTimestampNs"), r("getFundingParameters")]);
const hCode = await H.getCode({ address: pool });
const sCode = await S.getCode({ address: pool });
// last two FundingUpdated logs on Shannon (search back in 1000-block chunks, up to ~200k blocks)
const logs = [];
for (let to = bn; to > bn - 200000n && logs.length < 2; to -= 1000n) {
  const l = await S.getLogs({ address: pool, event: FU, fromBlock: to - 999n, toBlock: to });
  logs.unshift(...l);
}
const out = {
  checkedAtUtc: new Date().toISOString(), symbol: sym, pool, restMarketChainId: m.chainId, restBaseDecimals: m.baseDecimals, restQuoteDecimals: m.quoteDecimals,
  codeOnShannon50312: sCode && sCode !== "0x" ? `${(sCode.length - 2) / 2} bytes` : "none", codeOnTokyo50383: hCode && hCode !== "0x" ? `${(hCode.length - 2) / 2} bytes` : "none",
  chain: { block: bn.toString(), getCurrentFundingRate: rate.toString(), getCumulativeFundingPerUnit: cum.toString(), getOneBase: oneBase.toString(), indexPrice: ip.toString(), lastSettle: new Date(Number(lastNs / 1000000n)).toISOString(), windowSec: fp.fundingCalculationWindowSec.toString(), intervalSec: fp.fundingSettlementIntervalSec.toString() },
  lastFundingUpdatedLogs: logs.slice(-2).map((l) => ({ block: l.blockNumber.toString(), tx: l.transactionHash, fundingRate: l.args.fundingRate.toString(), cumulativeFundingPerUnit: l.args.cumulativeFundingPerUnit.toString(), indexPrice: l.args.indexPrice.toString(), intervalsSettled: l.args.intervalsSettled.toString() })),
  rest: { current: rest.current, history: rest.history.slice(0, 2) },
};
console.log(JSON.stringify(out, null, 1));
fs.writeFileSync(new URL(`./rest_vs_chain_${sym.replace(":", "_")}.json`, import.meta.url), JSON.stringify(out, null, 1));
