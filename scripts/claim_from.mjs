// Reproduces: report 01 (and the AlreadyClaimed case in 02).
// Run:  node scripts/claim_from.mjs <address...>
// e.g.  node scripts/claim_from.mjs 0x2A11e7388D1D2F9690f2636846d44b478f61bF08 0x567476bd43ff20e6aa44e18abfbdb58280563f45
// Read-only: eth_call claim() from each address plus its voucher/MarginBank state. Expect: REVERT 0x3e31dcc2 for every caller.
import { createPublicClient, http, defineChain, encodeFunctionData, parseAbi } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const client = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const V = "0x2ACD9EFdA721450906bfE1bef3edE269636E42C4", BANK = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const vAbi = parseAbi(["function claim()", "function isClaimed(address) view returns (bool)", "function voucherExpiryOf(address) view returns (uint64)"]);
const bankAbi = parseAbi(["function getActivePerpPools(address) view returns (address[])", "function getMainFundedPrincipal(address child) view returns (uint256)", "function getCreditFloor(address) view returns (uint256)"]);
const data = encodeFunctionData({ abi: vAbi, functionName: "claim" });
const NAMES = { "0x3f3d2141": "ClaimantNotFlat", "0x1fac9b7d": "ClaimantIsMainFunded", "0x16394a52": "BudgetExhausted", "0xe72b39f9": "CampaignInactive", "0x646cf558": "AlreadyClaimed", "0x3e31dcc2": "UNKNOWN-not-in-SDK-ABI" };
for (const from of process.argv.slice(2)) {
  const [code, claimed, pools, mf, floor, exp] = await Promise.all([
    client.getCode({ address: from }), client.readContract({ address: V, abi: vAbi, functionName: "isClaimed", args: [from] }),
    client.readContract({ address: BANK, abi: bankAbi, functionName: "getActivePerpPools", args: [from] }),
    client.readContract({ address: BANK, abi: bankAbi, functionName: "getMainFundedPrincipal", args: [from] }),
    client.readContract({ address: BANK, abi: bankAbi, functionName: "getCreditFloor", args: [from] }),
    client.readContract({ address: V, abi: vAbi, functionName: "voucherExpiryOf", args: [from] }),
  ]);
  const r = await client.request({ method: "eth_call", params: [{ from, to: V, data }, "latest"] }).then(x => "OK " + x, e => { const d = e.data ?? e.cause?.data ?? ""; return `REVERT ${d} ${NAMES[d] ?? ""}`; });
  console.log(from, "code:", code && code !== "0x" ? "contract" : "EOA", "claimed:", claimed, "activePools:", pools.length, "mainFunded:", mf.toString(), "floor:", floor.toString(), "exp:", exp.toString(), "=>", r);
}
