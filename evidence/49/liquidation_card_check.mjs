// Read-only. For Tokyo (Hideki, 50383) liquidation transactions: decode the receipt from the chain's RPC
// (PositionLiquidated, LiquidationFeeCharged, AccountLiquidated, every OrderFilled with its pool's decimals) and
// print the explorer's "What this transaction did" section for the same transaction, server-rendered.
// usage: node liquidation_card_check.mjs [txHash ...]   (no keys, no transactions)
import { createPublicClient, http, defineChain, parseAbi, decodeEventLog, formatUnits } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const EXPLORER = "https://explorer.testnet.somnia.network/tokyo/tx/";
const FACTORY = "0xE631fAEE547baeE07353E290f0562ea67d856560"; // PerpPoolFactory (Hideki)
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const abi = parseAbi([
  "event OrderFilled(uint128 indexed takerOrderId, uint128 indexed makerOrderId, uint256 quantityFilled, uint256 takerRemainingQuantity, uint256 makerRemainingQuantity, uint256 fillPrice)",
  "event PositionLiquidated(address indexed account, address indexed perpPool, int128 sizeDelta, uint256 markPrice)",
  "event LiquidationFeeCharged(address indexed account, address indexed perpPool, uint256 indexed tier, uint256 fillNotional, uint256 amount)",
  "event LiquidationKeeperRewardPaid(address indexed account, address indexed keeper, uint256 amount)",
  "event AccountLiquidated(address indexed account, uint256 positionsProcessed, uint8 stageReached, uint8 marginStatusBefore, uint8 marginStatusAfter)",
]);
const fac = parseAbi(["function getBaseTokenForPool(address perpPool) view returns (address)"]);
const erc = parseAbi(["function decimals() view returns (uint8)", "function symbol() view returns (string)"]);
const ZERO = "0x0000000000000000000000000000000000000000";
const meta = {};
async function poolMeta(pool) {
  if (meta[pool]) return meta[pool];
  let base = await c.readContract({ address: FACTORY, abi: fac, functionName: "getBaseTokenForPool", args: [pool] }).catch(() => ZERO);
  let kind = "perp";
  if (base === ZERO) { kind = "spot/other"; return (meta[pool] = { kind, sym: "?", dec: 18 }); }
  const [dec, sym] = await Promise.all([c.readContract({ address: base, abi: erc, functionName: "decimals" }), c.readContract({ address: base, abi: erc, functionName: "symbol" })]);
  return (meta[pool] = { kind, sym, dec: Number(dec) });
}
const txs = process.argv.slice(2).length ? process.argv.slice(2) : [
  "0x80dae6c6915f713ff7d00ff31e6b98f3d028a3fb356aeadd81ecbb9665941046", // ETH-PERP liquidation
  "0x926e6a27368788edab0e8fb506f3445a626fb1580b48564803328116ae8888d7", // SOL-PERP liquidation
  "0xee3c3c8f2dc1250ca15f94b68d9fef5ea020d5a5b9e894a2c979b2ed23ea0862", // ETH-PERP liquidation
  "0x81ab856eb82bd56c75e731d780c2f8dba1497bf90e799add98dbfb92c6fe1dd1", // SOL-PERP liquidation
];
const section = (h) => {
  const s = h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
  const t = s.replace(/<[^>]+>/g, " | ").replace(/&amp;/g, "&").replace(/(\s*\|\s*)+/g, " | ");
  const i = t.indexOf("What this transaction did"), j = t.indexOf("Transaction hash", i);
  return i < 0 ? "(no 'What this transaction did' section)" : t.slice(i, j).trim();
};
console.log(`run ${new Date().toISOString()}  rpc ${RPC}`);
for (const h of txs) {
  const r = await c.getTransactionReceipt({ hash: h });
  const fills = {}; const liq = [];
  for (const l of r.logs) {
    let d; try { d = decodeEventLog({ abi, data: l.data, topics: l.topics }); } catch { continue; }
    if (d.eventName === "OrderFilled") (fills[l.address] ??= []).push(d.args);
    else liq.push(d);
  }
  console.log(`\n${h}  block ${r.blockNumber}  logs ${r.logs.length}`);
  for (const d of liq) {
    const a = d.args;
    if (d.eventName === "PositionLiquidated") { const m = await poolMeta(a.perpPool.toLowerCase()); console.log(`  chain  PositionLiquidated account ${a.account} pool ${a.perpPool} (${m.sym}-PERP) sizeDelta ${formatUnits(a.sizeDelta, m.dec)} ${m.sym} at mark ${formatUnits(a.markPrice, 18)}`); }
    if (d.eventName === "LiquidationFeeCharged") console.log(`  chain  LiquidationFeeCharged fillNotional ${formatUnits(a.fillNotional, 18)} USDso, fee ${formatUnits(a.amount, 18)} USDso`);
    if (d.eventName === "LiquidationKeeperRewardPaid") console.log(`  chain  LiquidationKeeperRewardPaid keeper ${a.keeper} ${formatUnits(a.amount, 18)} USDso`);
    if (d.eventName === "AccountLiquidated") console.log(`  chain  AccountLiquidated ${a.account} positionsProcessed ${a.positionsProcessed} marginStatus ${a.marginStatusBefore} -> ${a.marginStatusAfter}`);
  }
  for (const [pool, fs] of Object.entries(fills)) {
    const m = await poolMeta(pool);
    const tot = fs.reduce((s, f) => s + f.quantityFilled, 0n);
    console.log(`  chain  ${fs.length} OrderFilled on ${pool} (${m.kind === "perp" ? m.sym + "-PERP" : "not a perp pool"}): total ${m.kind === "perp" ? formatUnits(tot, m.dec) + " " + m.sym : tot + " raw"}; first fill ${m.kind === "perp" ? formatUnits(fs[0].quantityFilled, m.dec) : formatUnits(fs[0].quantityFilled, 18)} @ ${formatUnits(fs[0].fillPrice, 18)}`);
  }
  const res = await fetch(EXPLORER + h, { headers: { "user-agent": "Mozilla/5.0" } });
  console.log(`  page   HTTP ${res.status}: ${section(await res.text())}`);
}
