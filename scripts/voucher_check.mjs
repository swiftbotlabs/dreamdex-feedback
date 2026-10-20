// Reproduces: report 02 (and 01).
// Run:  node scripts/voucher_check.mjs [address]   (default 0x2A11e7388D1D2F9690f2636846d44b478f61bF08; any fresh address works)
// Read-only: the six reads getPerpVoucherEligibility makes, then eth_call claim(). Expect: every check passes, claim() reverts 0x3e31dcc2.
import { createPublicClient, http, parseAbi, encodeFunctionData, defineChain, keccak256, toHex } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const client = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const ME = process.argv[2] ?? "0x2A11e7388D1D2F9690f2636846d44b478f61bF08";
const BANK = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const DOC_VOUCHER = "0x2ACD9EFdA721450906bfE1bef3edE269636E42C4";
const bankAbi = parseAbi(["function getCreditGranter() view returns (address)", "function getActivePerpPools(address) view returns (address[])", "function getMainFundedPrincipal(address child) view returns (uint256)", "function getCreditFloor(address) view returns (uint256)", "function getAccountState(address account) view returns ((int256 unlockedCollateralBalance, uint256 lockedCollateral, address[] activePerpPools))"]);
const vAbi = parseAbi(["function getConfig() view returns ((address marginBank, address collateralToken, uint256 grantAmount, uint64 expiryDuration, uint64 campaignStart, uint64 campaignEnd) config)", "function budgetRemaining() view returns (uint256)", "function isClaimed(address) view returns (bool)", "function voucherExpiryOf(address) view returns (uint64)", "function claim()"]);
const S = (v) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
for (const n of ["ClaimantNotFlat()", "ClaimantIsMainFunded()", "BudgetExhausted()", "CampaignInactive()", "AlreadyClaimed()", "NothingToClaim()"]) console.log("sel", n, keccak256(toHex(n)).slice(0, 10));
const granter = await client.readContract({ address: BANK, abi: bankAbi, functionName: "getCreditGranter" });
console.log("bank.getCreditGranter =", granter, granter.toLowerCase() === DOC_VOUCHER.toLowerCase() ? "(matches docs)" : "(DIFFERS from docs 0x2ACD...)");
const block = await client.getBlock();
const V = granter;
const [cfg, budget, claimed, pools, mainFunded, floor, exp] = await Promise.all([
  client.readContract({ address: V, abi: vAbi, functionName: "getConfig" }),
  client.readContract({ address: V, abi: vAbi, functionName: "budgetRemaining" }),
  client.readContract({ address: V, abi: vAbi, functionName: "isClaimed", args: [ME] }),
  client.readContract({ address: BANK, abi: bankAbi, functionName: "getActivePerpPools", args: [ME] }),
  client.readContract({ address: BANK, abi: bankAbi, functionName: "getMainFundedPrincipal", args: [ME] }),
  client.readContract({ address: BANK, abi: bankAbi, functionName: "getCreditFloor", args: [ME] }),
  client.readContract({ address: V, abi: vAbi, functionName: "voucherExpiryOf", args: [ME] }),
]);
console.log("block", block.number.toString(), "ts", block.timestamp.toString(), "campaign", cfg.campaignStart.toString(), "-", cfg.campaignEnd.toString(), "inWindow", block.timestamp >= cfg.campaignStart && block.timestamp < cfg.campaignEnd);
console.log("grant", cfg.grantAmount.toString(), "budget", budget.toString(), "claimed", claimed, "activePools", pools.length, "mainFunded", mainFunded.toString(), "floor", floor.toString(), "expiry", exp.toString());
const data = encodeFunctionData({ abi: vAbi, functionName: "claim" });
for (const to of [...new Set([V, DOC_VOUCHER])]) {
  const r = await client.request({ method: "eth_call", params: [{ from: ME, to, data }, "latest"] }).then(x => ({ ok: x }), e => ({ err: e.details || e.message, data: e.data ?? (e.cause && e.cause.data) }));
  console.log("eth_call claim() to", to, S(r).slice(0, 300));
}
// Also: does the documented address even have code?
console.log("code at docs voucher:", ((await client.getCode({ address: DOC_VOUCHER })) ?? "0x").length, "chars; at granter:", ((await client.getCode({ address: V })) ?? "0x").length);
