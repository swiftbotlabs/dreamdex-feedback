// Read-only check: one account's MarginBank state + each active pool's health snapshot, pinned to one block.
// Splits MarginBank equity into price-only unrealized PnL and accrued funding, the same way the SDK's
// getPerpPositionAnalytics / the app's own position-metrics code do:
//   unrealizedPnl  = (mark - entry) * size / oneBase                                  (truncates toward zero)
//   accruedFunding = ceil(size * (projectedCumulativeFunding - entryFundingIndex) / (1e18 * oneBase))
//   equity         = unlockedCollateralBalance + sum(unrealizedPnl - accruedFunding)
// usage (Node 22 + viem 2.57.7 installed next to it): node pnl_gap_check.mjs <account> [block]
import { createPublicClient, http, parseAbi, defineChain, formatUnits } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Somnia Tokyo testnet", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const BANK = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const bank = parseAbi([
  "function getAccountState(address account) view returns ((int256 unlockedCollateralBalance, uint256 lockedCollateral, address[] activePerpPools))",
  "function getAccountHealth(address account) view returns (int256 equity, uint256 imReq, uint256 mmReq, uint256 cmReq)",
  "function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))",
]);
const poolAbi = parseAbi([
  "function tryGetHealthSnapshot() view returns (bool ok, (uint256 oneBase, uint256 markPrice, int256 projectedCumulativeFunding, uint256 effectiveIMFBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps) snapshot)",

]);
// Tokyo perp pools (PerpPoolFactory / indexer Market rows), lower-case address -> base symbol
const SYM = {"0xf71b619450bafe953f47b9b556416a3a67b443b5":"LINK","0x352636ab146039851ef06d6367a106d5fb4e6409":"VVV","0x3d2a99fe1e2bdeaa25024515a2d2202daf9531ad":"BNB","0xde9762b6b441133d1314c68864ae4e63a6ee45c7":"AVAX","0xfa9b9e50cc1745113d57893991af200a74c86b6f":"1000PEPE","0xdcb0ad226727b2ce92857f0af5751389d42b2a3f":"LIT","0x2a1822b02039ddf0e293f3f7243673fc03eaf16c":"ZRO","0x34fa62909f77699a7a6278d992f72ff31c7a619d":"ADA","0x2a73129f26917124bd2a47a9b355c395c537f050":"ZEC","0xb483ec1fb34996638677c20ab087b16f1896fa53":"SOL","0x0f464d57c1fd839e4d87a408bbccdab8f77e6394":"WLD","0x7058579f3248559963f79adb937c6de9f953e060":"XRP","0x76c981a52530cdf9497559140aafcd8cd16836e7":"PUMP","0xc410012e39765cd5f772e84bacb19554aec040df":"DOGE","0xd9b6a347a3ae9fd6ba21179d3343f2c8a922f697":"TAO","0x74b05b9b8c8f180b53b7891018f3b254b3e658c9":"XLM","0x1be21287cfb865a7c462ff3c4f275e70bcccefe4":"SUI","0x1cd15ae8bff0fe0a7f49233be8b90734775ba454":"NEAR","0x63b47ed4a7de0fde659b0d82441dd74828b7297a":"HYPE","0xd6cb1dd58580b84d76068ac21594219ce03aeddf":"ETH","0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0":"BTC"};
const ceilDiv = (a, b) => { const q = a / b; return (a % b !== 0n && (a > 0n) === (b > 0n)) ? q + 1n : q; };
const acct = process.argv[2];
const blockNumber = process.argv[3] ? BigInt(process.argv[3]) : await c.getBlockNumber();
const rd = (address, abi, functionName, args = []) => c.readContract({ address, abi, functionName, args, blockNumber });
const blk = await c.getBlock({ blockNumber });
const ts = Number(blk.timestamp); const iso = new Date(ts > 1e12 ? ts : ts * 1000).toISOString();
const f = (x, d = 18) => Number(formatUnits(x, d)).toFixed(4);
const st = await rd(BANK, bank, "getAccountState", [acct]);
const h = await rd(BANK, bank, "getAccountHealth", [acct]);
console.log(`chainId ${await c.getChainId()} account ${acct} block ${blockNumber} blockTime ${iso} readAt ${new Date().toISOString()}`);
console.log(`unlockedCollateralBalance ${f(st.unlockedCollateralBalance)}  lockedCollateral ${f(st.lockedCollateral)}  getAccountHealth.equity ${f(h[0])}`);
let sU = 0n, sF = 0n;
for (const p of st.activePerpPools) {
  const pos = await rd(BANK, bank, "getPosition", [acct, p]);
  if (pos.size === 0n) continue;
  const [ok, s] = await rd(p, poolAbi, "tryGetHealthSnapshot");
  const sym = SYM[p.toLowerCase()] ?? "?";
  const upnl = (s.markPrice - pos.avgEntryPrice) * pos.size / s.oneBase;
  const fund = ceilDiv(pos.size * (s.projectedCumulativeFunding - pos.entryFundingIndex), 10n ** 18n * s.oneBase);
  sU += upnl; sF += fund;
  const d = s.oneBase.toString().length - 1;
  console.log(`  ${sym.padEnd(9)} pool ${p} snapshotOk ${ok} size ${formatUnits(pos.size, d)} entry ${f(pos.avgEntryPrice)} mark ${f(s.markPrice)} | uPnL(price only) ${f(upnl)} | accruedFunding(owed) ${f(fund)}`);
}
console.log(`SUM price-only uPnL           ${f(sU)}`);
console.log(`SUM accruedFunding (owed)     ${f(sF)}`);
console.log(`uPnL - funding                ${f(sU - sF)}`);
console.log(`equity - unlockedCollateral   ${f(h[0] - st.unlockedCollateralBalance)}   (what the trader page shows as "Unrealized PnL")`);
console.log(`residual equity - unlocked - (uPnL - funding) = ${formatUnits(h[0] - st.unlockedCollateralBalance - (sU - sF), 18)}`);
