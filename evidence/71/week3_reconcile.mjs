// Report 71 control: the week-3 final board (equityThrough 2026-11-02 14:00:00 UTC) against MarginBank at block 39746863 (14:00:00 UTC).
// endEquity should equal getAccountEquity + lockedCollateral (getAccountEquity leaves order locks out). Read-only.
// Usage: node week3_reconcile.mjs board_week-3_final_2026-11-03T0750Z.json [block] [rows]
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
const c = createPublicClient({ transport: http("https://api.hideki2.infra.testnet.somnia.network", { timeout: 60000, retryCount: 3 }) });
const MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const abi = parseAbi(["function getAccountEquity(address) view returns (int256)", "function getAccountState(address) view returns ((int256 unlockedCollateralBalance, uint256 lockedCollateral, address[] activePerpPools))"]);
const [f, b = "39746863", n = "40"] = process.argv.slice(2);
const d = JSON.parse(readFileSync(f, "utf8")); const blk = BigInt(b);
let ok = 0; const lines = [];
for (const r of d.rows.slice(0, Number(n))) {
  const [eq, st] = await Promise.all([c.readContract({ address: MB, abi, functionName: "getAccountEquity", args: [r.address], blockNumber: blk }), c.readContract({ address: MB, abi, functionName: "getAccountState", args: [r.address], blockNumber: blk })]);
  const e = Number(formatUnits(eq, 18)), lk = Number(formatUnits(st.lockedCollateral, 18)); const diff = e + lk - r.endEquity;
  if (Math.abs(diff) < 0.01) ok++;
  lines.push(`#${r.rank} ${r.address} board ${r.endEquity.toFixed(2)} | equity ${e.toFixed(2)} + locked ${lk.toFixed(2)} = ${(e + lk).toFixed(2)} | diff ${diff.toFixed(2)}`);
}
console.log(`week-3 board equityThrough ${new Date(d.equityThrough).toISOString()}, block ${blk}: ${ok} of ${lines.length} rows match to the cent`);
console.log(lines.join("\n"));
