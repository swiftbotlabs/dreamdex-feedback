// Read-only. For recent on-book (stage 3, CLOBPartial) liquidations of single-market accounts: how much did the
// engine close, versus the smallest close that would have put the account back above maintenance margin?
// Sources: Hideki indexer (to find the transactions, the position before/after and the LiquidationFee row) +
// chain reads at block-1 and block (MarginBank.getAccountHealth, getAccountState, the pool's maintenance margin).
// usage: node liq_close_size.mjs [N] [offset]          all markets
//        DECIMALS=18 node liq_close_size.mjs [N]         only markets whose base asset has that many decimals
//        POOLS=0xpool,0xpool node liq_close_size.mjs [N] only those pools
// "smallest restoring close" = the notional x with  equity - 1% * x >= mmRate * (notional - x), i.e. the close
// (with the full 1% fee and no slippage) after which the account is back at maintenance margin. Single-market accounts
// only, so the arithmetic is exact up to slippage.
import { createPublicClient, http, defineChain, parseAbi, formatUnits } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network", IDX = "https://hideki-dev.smk.somnia.host/v1/graphql";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 60_000 }) });
const MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const A = parseAbi(["function getAccountHealth(address account) view returns (int256 equity, uint256 imReq, uint256 mmReq, uint256 cmReq)", "function getAccountState(address account) view returns ((int256 unlockedCollateralBalance, uint256 lockedCollateral, address[] activePerpPools))"]);
const P = parseAbi(["function getPerpPoolParameters() view returns ((uint256 initialMarginBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps, uint256 maxOpenInterest, uint256 maxPositionSize, uint256 takerFeeBpsTimes1k, int256 makerFeeBpsTimes1k, uint256 insuranceFundShareBps))", "function getMarketInfo() view returns (address, address)"]);
const gql = async q => (await fetch(IDX, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q }) }).then(r => r.json())).data;
const N = Number(process.argv[2] ?? 40);
const OFF = Number(process.argv[3] ?? 0);
const d = await gql(`{ LiquidationEvent(limit: ${N * 4}, offset: ${OFF}, where: {kind: {_eq: "AccountLiquidated"}, stageReached: {_eq: 1}}, order_by: {blockNumber: desc}) { account txHash blockNumber timestamp marginStatusBefore marginStatusAfter positionsProcessed } }`);
let rows = d.LiquidationEvent.filter(r => Number(r.positionsProcessed) === 1);
if (process.env.DECIMALS && !process.env.POOLS) {
  const ms = (await gql(`{ Market(where: {marginBank: {_is_null: false}, baseDecimals: {_eq: ${Number(process.env.DECIMALS)}}}, limit: 200) { poolAddress baseSymbol } }`)).Market;
  process.env.POOLS = ms.map(m => m.poolAddress).join(",");
  console.log("# pools with", process.env.DECIMALS, "base decimals:", ms.map(m => `${m.baseSymbol} ${m.poolAddress}`).join(", "));
}
if (process.env.POOLS) {
  const pools = JSON.stringify(process.env.POOLS.split(",").map(x => x.toLowerCase()));
  const pl = await gql(`{ LiquidationEvent(limit: ${N * 3}, where: {kind: {_eq: "PositionLiquidated"}, pool: {_in: ${pools}}}, order_by: {blockNumber: desc}) { txHash } }`);
  const txs = JSON.stringify([...new Set(pl.LiquidationEvent.map(r => r.txHash))]);
  const d2 = await gql(`{ LiquidationEvent(where: {kind: {_eq: "AccountLiquidated"}, stageReached: {_eq: 1}, txHash: {_in: ${txs}}}, order_by: {blockNumber: desc}) { account txHash blockNumber timestamp marginStatusBefore marginStatusAfter positionsProcessed } }`);
  rows = d2.LiquidationEvent.filter(r => Number(r.positionsProcessed) === 1);
}
const markets = (await gql(`{ Market(where: {marginBank: {_is_null: false}}, limit: 200) { poolAddress baseSymbol baseDecimals } }`))?.Market ?? [];
const sym = Object.fromEntries(markets.map(m => [m.poolAddress?.toLowerCase(), { symbol: m.baseSymbol, baseDecimals: m.baseDecimals }]));
const f = (v, n = 2) => Number(formatUnits(v, 18)).toFixed(n);
const out = []; let done = 0;
console.log(`# ${new Date().toISOString()} rows(stage 3, 1 position) ${rows.length}; showing up to ${N}`);
console.log("block | account | market | size before -> after (closed %) | pre: equity / mmReq (shortfall) | min close to restore MM (notional) | actual closed notional | x | fee | post: equity / mm / im | status");
for (const r of rows) {
  if (done >= N) break;
  const bn = BigInt(r.blockNumber);
  const det = await gql(`{ L: LiquidationEvent(where: {txHash: {_eq: "${r.txHash}"}, account: {_eq: "${r.account}"}, kind: {_eq: "PositionLiquidated"}}) { pool size price } C: PerpPositionChange(where: {txHash: {_eq: "${r.txHash}"}, account: {_eq: "${r.account}"}}, order_by: {logIndex: asc}) { pool sizeBefore sizeAfter } F: PerpFeeRecord(where: {txHash: {_eq: "${r.txHash}"}, account: {_eq: "${r.account}"}}) { kind amount fillNotional } }`);
  if (!det || det.L.length !== 1 || !det.C.length) continue;
  const pool = det.L[0].pool;
  let pre, post, st;
  try {
    [pre, post, st] = await Promise.all([
      c.readContract({ address: MB, abi: A, functionName: "getAccountHealth", args: [r.account], blockNumber: bn - 1n }),
      c.readContract({ address: MB, abi: A, functionName: "getAccountHealth", args: [r.account], blockNumber: bn }),
      c.readContract({ address: MB, abi: A, functionName: "getAccountState", args: [r.account], blockNumber: bn - 1n })]);
  } catch (e) { continue; }
  if (st.activePerpPools.length !== 1) continue; // single-market accounts only: the arithmetic below is then exact enough
  const pp = await c.readContract({ address: pool, abi: P, functionName: "getPerpPoolParameters", blockNumber: bn - 1n });
  const m = sym[pool.toLowerCase()] ?? { symbol: pool.slice(0, 10), baseDecimals: 18 };
  const dec = Number(m.baseDecimals);
  const s0 = BigInt(det.C[0].sizeBefore), s1 = BigInt(det.C[det.C.length - 1].sizeAfter);
  const a0 = s0 < 0n ? -s0 : s0, a1 = s1 < 0n ? -s1 : s1;
  const closed = a0 - a1, px = BigInt(det.L[0].price);
  const scale = 10n ** BigInt(dec);
  const notional0 = a0 * px / scale, closedNotional = closed * px / scale;
  const fee = det.F.filter(x => x.kind === "LiquidationFee").reduce((s, x) => s + BigInt(x.amount), 0n);
  const [eq0, , mm0] = pre; const [eq1, im1, mm1] = post;
  const mmBps = pp.maintenanceMarginBps; // e.g. 250 = 2.5%
  const shortfall = BigInt(mm0) - eq0;
  // smallest close x (notional) with eq0 - 1% * x >= mmRate * (notional0 - x)  ->  x >= (mm0 - eq0) / (mmRate - 1%)
  const minClose = shortfall <= 0n ? 0n : shortfall * 10000n / (mmBps - 100n);
  const ratio = minClose > 0n ? Number(closedNotional) / Number(minClose) : Infinity;
  out.push({ block: r.blockNumber, tx: r.txHash, account: r.account, market: m.symbol, closedPct: Number(closed * 10000n / a0) / 100, shortfall: f(shortfall), minClose: f(minClose), closedNotional: f(closedNotional), ratio, fee: f(fee), feeAtMinClose: f(minClose / 100n), eq0: f(eq0), mm0: f(mm0), eq1: f(eq1), mm1: f(mm1), im1: f(im1), before: r.marginStatusBefore, after: r.marginStatusAfter, mmBps: mmBps.toString() });
  const o = out[out.length - 1];
  console.log(`${o.block} | ${o.account.slice(0, 10)} | ${o.market} | ${formatUnits(a0, dec)} -> ${formatUnits(a1, dec)} (${o.closedPct}%) | ${o.eq0} / ${o.mm0} (${o.shortfall}) | ${o.minClose} | ${o.closedNotional} | ${isFinite(ratio) ? ratio.toFixed(1) : "inf"} | ${o.fee} | ${o.eq1} / ${o.mm1} / ${o.im1} | ${o.before}->${o.after}`);
  done++;
}
const rs = out.filter(o => isFinite(o.ratio));
const sumFee = out.reduce((s, o) => s + Number(o.fee), 0), sumMinFee = out.reduce((s, o) => s + Number(o.feeAtMinClose), 0);
console.log(`\nsummary: ${out.length} liquidations; closed notional / smallest restoring close: median ${rs.map(o => o.ratio).sort((a, b) => a - b)[Math.floor(rs.length / 2)]?.toFixed(1)}x; ` +
  `>=10x on ${rs.filter(o => o.ratio >= 10).length}, >=100x on ${rs.filter(o => o.ratio >= 100).length}; fees charged ${sumFee.toFixed(2)} USDso vs ${sumMinFee.toFixed(2)} at the smallest restoring close; ` +
  `post status healthy(0) on ${out.filter(o => o.after === 0).length}`);
console.log("JSON " + JSON.stringify(out));
