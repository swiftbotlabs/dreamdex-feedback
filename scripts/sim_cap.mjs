// Reproduces: report 06 (position-cap cases: MaxPositionSizeExceeded and related reverts on BTC-PERP).
// Run:  node scripts/sim_cap.mjs
// Read-only: eth_call placeOrder from two accounts (an active trader and a voucher account); nothing is signed or sent.
import { createPublicClient, http, defineChain, encodeFunctionData, decodeFunctionResult, decodeErrorResult, parseAbi } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const client = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const POOL = "0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0", BANK = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const abi = parseAbi(["function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) payable returns (bool success, uint128 orderId)", "function tryGetMarkPrice() view returns (bool ok, uint256 price)", "error Error(string)", "error MaxPositionSizeExceeded()", "error InsufficientCollateral()", "error VoucherMarketNotAllowed()", "error IsolatedMarketBlocked()"]);
const bankAbi = parseAbi(["function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))", "function getAccountState(address account) view returns ((int256 unlockedCollateralBalance, uint256 lockedCollateral, address[] activePerpPools))"]);
const mark = (await client.readContract({ address: POOL, abi, functionName: "tryGetMarkPrice" }))[1];
const tick = 100000000000000000n, lot = 1000n, min = 13000n, cap = 10000000000n;
const far = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600) * 1_000_000_000n; const ZERO = "0x0000000000000000000000000000000000000000";
const p90 = (mark * 90n / 100n / tick) * tick;
async function call(label, from, isBid, price, qty) {
  const data = encodeFunctionData({ abi, functionName: "placeOrder", args: [isBid, 0n, price, qty, far, 0, 0, ZERO, 0n] });
  try { const raw = await client.request({ method: "eth_call", params: [{ from, to: POOL, data }, "latest"] }); const [s, id] = decodeFunctionResult({ abi, functionName: "placeOrder", data: raw }); console.log(`- ${label}: success=${s} orderId=${id}`); }
  catch (e) { const d = (e.data ?? e.cause?.data ?? "") + ""; let msg = d.slice(0, 10); try { const de = decodeErrorResult({ abi, data: d }); msg = de.errorName + (de.args?.length ? JSON.stringify(de.args) : "()"); } catch {} console.log(`- ${label}: REVERT ${msg}`); }
}
for (const from of ["0x420691db9d2b5a79210fda48c177471386b6dfd1", "0x567476bd43ff20e6aa44e18abfbdb58280563f45"]) {
  const [pos, st] = await Promise.all([client.readContract({ address: BANK, abi: bankAbi, functionName: "getPosition", args: [from, POOL] }), client.readContract({ address: BANK, abi: bankAbi, functionName: "getAccountState", args: [from] })]);
  const size = pos.size; const abs = size < 0n ? -size : size;
  console.log(`account ${from} BTC pos ${size} unlocked ${st.unlockedCollateralBalance} locked ${st.lockedCollateral}`);
  await call("  bid cap + |pos| + lot (net past cap)", from, true, p90, cap + abs + lot);
  await call("  bid 2x cap", from, true, p90, 2n * cap);
  await call("  bid exactly cap + |pos| (net == cap)", from, true, p90, cap + abs);
  await call("  bid min qty", from, true, p90, min);
}
