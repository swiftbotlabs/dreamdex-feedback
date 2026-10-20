// Survey every dreamDEX perp pool on Somnia Hideki testnet (chain 50383) with plain viem reads.
// No SDK code is executed; ABIs are the human-readable signatures copied from the SDK's readsAbi.ts.
// Reproduces: report 03 (isVoucherMarketAllowed for all pools) and the market count in 05.
// Run:  node scripts/survey.mjs > survey.json   (RPC=<url> to override the endpoint)
import { createPublicClient, http, parseAbi, formatUnits, defineChain } from "viem";

const RPC = process.env.RPC ?? "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const client = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });

const FACTORY = "0xE631fAEE547baeE07353E290f0562ea67d856560";
const MARGIN_BANK = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const VOUCHER = "0x2ACD9EFdA721450906bfE1bef3edE269636E42C4";

const factoryAbi = parseAbi([
  "function getPerpPools() view returns (address[])",
  "function perpPoolCount() view returns (uint256)",
  "function getBaseTokenForPool(address perpPool) view returns (address)",
  "function getPerpPoolStatuses() view returns ((address perpPool, address baseToken, bool restricted)[] statuses)",
  "function getStopOrderRegistry(address perpPool) view returns (address stopOrderRegistry)",
]);
const poolAbi = parseAbi([
  "function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))",
  "function getPerpPoolParameters() view returns ((uint256 initialMarginBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps, uint256 maxOpenInterest, uint256 maxPositionSize, uint256 takerFeeBpsTimes1k, int256 makerFeeBpsTimes1k, uint256 insuranceFundShareBps))",
  "function tryGetMarkPrice() view returns (bool ok, uint256 price)",
  "function marginBank() view returns (address)",
  "function getMarketStatus() view returns (uint8)",
  "function getBookLevels(bool isBid, uint64 numLevels) view returns ((uint256 price, uint256 quantity)[])",
]);
const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
]);
const bankAbi = parseAbi([
  "function getSystemConfig() view returns ((address marginBank, address collateralToken, address perpPoolFactory, address liquidationEngine, address insuranceFund, address feeRecipient, uint16 maxLeverageLimit, bool fullyWired) config)",
  "function isVoucherMarketAllowed(address perpPool) view returns (bool)",
  "function getMaxLeverageLimit() view returns (uint16)",
  "function getVoucherLeverageCap() view returns (uint16)",
]);
const voucherAbi = parseAbi([
  "function getConfig() view returns ((address marginBank, address collateralToken, uint256 grantAmount, uint64 expiryDuration, uint64 campaignStart, uint64 campaignEnd) config)",
  "function budgetRemaining() view returns (uint256)",
]);

const J = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)));

async function safe(p) { try { return await p; } catch (e) { return { error: (e.shortMessage || e.message || String(e)).slice(0, 200) }; } }

const out = { rpc: RPC, chainId: await client.getChainId(), block: (await client.getBlockNumber()).toString(), at: new Date().toISOString() };
out.systemConfig = J(await safe(client.readContract({ address: MARGIN_BANK, abi: bankAbi, functionName: "getSystemConfig" })));
out.maxLeverageLimit = J(await safe(client.readContract({ address: MARGIN_BANK, abi: bankAbi, functionName: "getMaxLeverageLimit" })));
out.voucherLeverageCap = J(await safe(client.readContract({ address: MARGIN_BANK, abi: bankAbi, functionName: "getVoucherLeverageCap" })));
out.voucher = { config: J(await safe(client.readContract({ address: VOUCHER, abi: voucherAbi, functionName: "getConfig" }))), budgetRemaining: J(await safe(client.readContract({ address: VOUCHER, abi: voucherAbi, functionName: "budgetRemaining" }))) };
const statuses = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getPerpPoolStatuses" });
out.poolCount = J(await safe(client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "perpPoolCount" })));
out.pools = [];
for (const s of statuses) {
  const pool = s.perpPool;
  const [obp, ppp, mark, bank, status, sym, dec, allowed, stopReg] = await Promise.all([
    safe(client.readContract({ address: pool, abi: poolAbi, functionName: "getOrderBookParameters" })),
    safe(client.readContract({ address: pool, abi: poolAbi, functionName: "getPerpPoolParameters" })),
    safe(client.readContract({ address: pool, abi: poolAbi, functionName: "tryGetMarkPrice" })),
    safe(client.readContract({ address: pool, abi: poolAbi, functionName: "marginBank" })),
    safe(client.readContract({ address: pool, abi: poolAbi, functionName: "getMarketStatus" })),
    safe(client.readContract({ address: s.baseToken, abi: erc20Abi, functionName: "symbol" })),
    safe(client.readContract({ address: s.baseToken, abi: erc20Abi, functionName: "decimals" })),
    safe(client.readContract({ address: MARGIN_BANK, abi: bankAbi, functionName: "isVoucherMarketAllowed", args: [pool] })),
    safe(client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getStopOrderRegistry", args: [pool] })),
  ]);
  const baseDecimals = typeof dec === "number" ? dec : null;
  const row = {
    pool, baseToken: s.baseToken, restricted: s.restricted, symbol: sym, baseDecimals, marginBank: bank, status: J(status), voucherAllowed: J(allowed), stopRegistry: stopReg,
    raw: J({ obp, ppp, mark }),
  };
  if (!obp.error && baseDecimals !== null) {
    row.human = {
      tickSize: formatUnits(obp.tickSize, 18),
      minQuantity: formatUnits(obp.minQuantity, baseDecimals),
      lotSize: formatUnits(obp.lotSize, baseDecimals),
      minQtyIsLotMultiple: obp.lotSize > 0n ? (obp.minQuantity % obp.lotSize === 0n) : null,
    };
    if (!ppp.error) {
      row.human.initialMarginBps = ppp.initialMarginBps.toString();
      row.human.maintenanceMarginBps = ppp.maintenanceMarginBps.toString();
      row.human.maxLeverage = ppp.initialMarginBps > 0n ? (10000 / Number(ppp.initialMarginBps)).toString() : null;
      row.human.maxOpenInterest = formatUnits(ppp.maxOpenInterest, baseDecimals);
      row.human.maxPositionSize = formatUnits(ppp.maxPositionSize, baseDecimals);
      row.human.takerFeeBpsTimes1k = ppp.takerFeeBpsTimes1k.toString();
      row.human.makerFeeBpsTimes1k = ppp.makerFeeBpsTimes1k.toString();
      row.human.insuranceFundShareBps = ppp.insuranceFundShareBps.toString();
    }
    if (!mark.error) row.human.mark = { ok: mark[0], price: formatUnits(mark[1], 18) };
  }
  out.pools.push(row);
}
console.log(JSON.stringify(out, null, 1));
