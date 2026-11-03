// Report 71: compare the Perps Arena week-4 leaderboard table with its own equity chart and with the chain.
// Inputs are the two JSON bodies the competition hub loads (saved from the browser's network tab while signed in):
//   board.json  = GET /api/leaderboard/campaigns/perps-arena?period=week-4
//   chart.json  = GET /api/leaderboard/campaigns/perps-arena/equity?period=week-4
// For the accounts that have a chart line, it reads MarginBank equity (getAccountEquity + lockedCollateral, which is how the
// board's own endEquity reconciles with the chain) at the chart's last hour, and prints board ROI, chart ROI and chain ROI.
// Read-only. Usage: node arena_board_vs_chain.mjs board.json chart.json
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const c = createPublicClient({ transport: http(RPC, { timeout: 60000, retryCount: 3 }) });
const abi = parseAbi([
  "function getAccountEquity(address) view returns (int256)",
  "function getAccountState(address) view returns ((int256 unlockedCollateralBalance, uint256 lockedCollateral, address[] activePerpPools))",
]);
const [boardF, chartF] = process.argv.slice(2);
const board = JSON.parse(readFileSync(boardF, "utf8")), chart = JSON.parse(readFileSync(chartF, "utf8"));
const iso = ms => new Date(ms).toISOString().replace(".000", "");
console.log(`board: equityThrough ${iso(board.equityThrough)}  activityThrough ${iso(board.activityThrough)}  rows ${board.rows.length}  entrants ${board.entrants}`);
const lastAt = Math.max(...chart.lines.map(l => l.points[l.points.length - 1].at));
console.log(`chart: ${chart.lines.length} lines, one point every ${chart.everyHours} h, last point ${iso(lastAt)}`);
async function blockAt(ts) {
  let hi = await c.getBlockNumber(), lo = hi - 5_000_000n;
  while (hi - lo > 1n) { const m = (lo + hi) / 2n; if (Number((await c.getBlock({ blockNumber: m })).timestamp) <= ts) lo = m; else hi = m; }
  return lo;
}
const blk = await blockAt(lastAt / 1000);
console.log(`chain: block ${blk} = last block at or before ${iso(lastAt)}\n`);
console.log("board rank | address | funded (board) | table ROI | chart ROI at last point | chain equity | chain ROI = (equity - funded) / funded");
for (const l of chart.lines) {
  const r = board.rows.find(x => x.address === l.address); if (!r) continue;
  const p = l.points[l.points.length - 1];
  const [eq, st] = await Promise.all([
    c.readContract({ address: MB, abi, functionName: "getAccountEquity", args: [l.address], blockNumber: blk }),
    c.readContract({ address: MB, abi, functionName: "getAccountState", args: [l.address], blockNumber: blk })]);
  const e = Number(formatUnits(eq, 18)) + Number(formatUnits(st.lockedCollateral, 18));
  const pct = x => (x * 100).toFixed(2) + "%";
  console.log(`#${r.rank} | ${l.address} | ${r.funded.toFixed(2)} | ${pct(r.roi)} | ${pct(p.roi)} @ ${iso(p.at)} | ${e.toFixed(2)} | ${pct((e - r.funded) / r.funded)}`);
}
