// Read-only, Somnia mainnet: SomniaLend supply vs borrow APY per reserve (UiPoolDataProviderV3, the same read the Lend page makes).
// APY = per-second compounding of the ray rate, as the app and SDK compute it.
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
const c = createPublicClient({ transport: http("https://api.infra.mainnet.somnia.network", { timeout: 60000 }) });
const UI = "0x5ef828E2C7C55eea505dA3310b0831eD01189e3E", PROVIDER = "0x1C13Fea2A9a3Ae9962f12B6afAC1AFcd8205f752";
const abi = parseAbi([
  "struct AggregatedReserveData { address underlyingAsset; string name; string symbol; uint256 decimals; uint256 baseLTVasCollateral; uint256 reserveLiquidationThreshold; uint256 reserveLiquidationBonus; uint256 reserveFactor; bool usageAsCollateralEnabled; bool borrowingEnabled; bool stableBorrowRateEnabled; bool isActive; bool isFrozen; uint128 liquidityIndex; uint128 variableBorrowIndex; uint128 liquidityRate; uint128 variableBorrowRate; uint128 stableBorrowRate; uint40 lastUpdateTimestamp; address aTokenAddress; address stableDebtTokenAddress; address variableDebtTokenAddress; address interestRateStrategyAddress; uint256 availableLiquidity; uint256 totalPrincipalStableDebt; uint256 averageStableRate; uint256 stableDebtLastUpdateTimestamp; uint256 totalScaledVariableDebt; uint256 priceInMarketReferenceCurrency; address priceOracle; uint256 variableRateSlope1; uint256 variableRateSlope2; uint256 stableRateSlope1; uint256 stableRateSlope2; uint256 baseStableBorrowRate; uint256 baseVariableBorrowRate; uint256 optimalUsageRatio; bool isPaused; bool isSiloedBorrowing; uint128 accruedToTreasury; uint128 unbacked; uint128 isolationModeTotalDebt; bool flashLoanEnabled; uint256 debtCeiling; uint256 debtCeilingDecimals; uint8 eModeCategoryId; uint256 borrowCap; uint256 supplyCap; uint16 eModeLtv; uint16 eModeLiquidationThreshold; uint16 eModeLiquidationBonus; address eModePriceSource; string eModeLabel; bool borrowableInIsolation; }",
  "struct BaseCurrencyInfo { uint256 marketReferenceCurrencyUnit; int256 marketReferenceCurrencyPriceInUsd; int256 networkBaseTokenPriceInUsd; uint8 networkBaseTokenPriceDecimals; }",
  "function getReservesData(address provider) view returns (AggregatedReserveData[], BaseCurrencyInfo)"]);
const apy = (ray) => (Math.pow(1 + Number(ray) / 1e27 / 31536000, 31536000) - 1) * 100;
const bn = await c.getBlockNumber(); const b = await c.getBlock({ blockNumber: bn });
const [rows] = await c.readContract({ address: UI, abi, functionName: "getReservesData", args: [PROVIDER], blockNumber: bn });
console.log(`Somnia mainnet block ${bn} (${new Date(Number(b.timestamp) * 1000).toISOString()})`);
console.log("reserve   supply APY   borrow APY   supply/borrow");
for (const r of rows) { const s = apy(r.liquidityRate), v = apy(r.variableBorrowRate); console.log(`${r.symbol.padEnd(8)} ${s.toFixed(4).padStart(9)}%  ${v.toFixed(4).padStart(9)}%   ${v ? (100 * s / v).toFixed(1) + "%" : "-"}`); }
