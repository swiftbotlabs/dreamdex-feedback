// Read-only. For Tokyo (Hideki, chain 50383) perp trades: read each receipt from the chain's RPC, take the
// OrderFilled quantity and the pool's base token decimals (PerpPoolFactory.getBaseTokenForPool -> decimals()),
// and compare with the TRADE / POSITION lines the explorer's Tokyo transaction page renders for the same tx.
// usage: node trade_size_check.mjs [txHash ...]   (no keys, no transactions)
import { createPublicClient, http, defineChain, parseAbi, decodeEventLog, formatUnits } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const EXPLORER = "https://explorer.testnet.somnia.network/tokyo/tx/";
const FACTORY = "0xE631fAEE547baeE07353E290f0562ea67d856560"; // PerpPoolFactory (Hideki)
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const ev = parseAbi([
  "event OrderFilled(uint128 indexed takerOrderId, uint128 indexed makerOrderId, uint256 quantityFilled, uint256 takerRemainingQuantity, uint256 makerRemainingQuantity, uint256 fillPrice)",
  "event PositionUpdated(address indexed account, address indexed perpPool, int128 newSize, uint128 avgEntryPrice, int256 realizedPnl, int256 entryFundingIndex)",
]);
const fac = parseAbi(["function getBaseTokenForPool(address perpPool) view returns (address)"]);
const erc = parseAbi(["function decimals() view returns (uint8)", "function symbol() view returns (string)"]);
const txs = process.argv.slice(2).length ? process.argv.slice(2) : [
  "0x05fa91ea29f12038f7369f38c01babc604cfc1a6061f5ef1b8c3c1c87984e2ec", // LIT (18 decimals): control
  "0x025abb3d590c7698c1aacec6b7c4d175ef06a8312c15d3973fc0f80294dc2d0f", // ETH (18): control
  "0x35c9709d9b5a0e951c18cad9ffc49ffcf53f715739fac3e1173f94001ba99619", // BTC (8)
  "0xbb13acd817ddfe0f807e7e6190a874b9a967a4e753db1b3a1286d93d719f77b6", // DOGE (8)
  "0xd16c3031f5c50a698e6393a22e882adcbaf18d75f4c65f83c0d218de863cc6ca", // ZEC (8)
  "0x7c1176f7736cbf3cd1bf69ee6416289c0179c36ebd83312031928f372332244f", // SOL (9)
  "0x23c584bd9046331339aeeb60bf3c0a081876309e2bf360edbb0a69f501430eb4", // ADA (6)
  "0x2441c500227410e25a047f06e964e9d2dc3cb85f5e0055f9a384f11530ec360b", // NEAR (24)
];
const pageLines = (html) => {
  const s = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
  const t = s.replace(/<[^>]+>/g, " | ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/(\s*\|\s*)+/g, " | ");
  const i = t.indexOf("What this transaction did"), j = t.indexOf("Transaction hash", i);
  return i < 0 ? "(no 'What this transaction did' section)" : t.slice(i, j).trim();
};
console.log(`run ${new Date().toISOString()}  rpc ${RPC}`);
for (const h of txs) {
  const r = await c.getTransactionReceipt({ hash: h });
  const fills = [], pos = [];
  for (const l of r.logs) {
    try { const d = decodeEventLog({ abi: ev, data: l.data, topics: l.topics });
      if (d.eventName === "OrderFilled") fills.push({ pool: l.address, ...d.args });
      if (d.eventName === "PositionUpdated") pos.push(d.args);
    } catch {}
  }
  if (!fills.length) { console.log(`\n${h}: no OrderFilled log`); continue; }
  const pool = fills[0].pool;
  const base = await c.readContract({ address: FACTORY, abi: fac, functionName: "getBaseTokenForPool", args: [pool] });
  const [dec, sym] = await Promise.all([c.readContract({ address: base, abi: erc, functionName: "decimals" }), c.readContract({ address: base, abi: erc, functionName: "symbol" })]);
  const res = await fetch(EXPLORER + h, { headers: { "user-agent": "Mozilla/5.0" } });
  const card = pageLines(await res.text());
  console.log(`\n${h}  block ${r.blockNumber}  pool ${pool}  base ${sym} (${dec} decimals)`);
  for (const f of fills) console.log(`  chain  OrderFilled quantityFilled raw ${f.quantityFilled} = ${formatUnits(f.quantityFilled, dec)} ${sym} @ ${formatUnits(f.fillPrice, 18)}  (same raw value read as 18 decimals: ${formatUnits(f.quantityFilled, 18)})`);
  for (const p of pos) console.log(`  chain  PositionUpdated ${p.account} newSize raw ${p.newSize} = ${formatUnits(p.newSize, dec)} ${sym}  (as 18 decimals: ${formatUnits(p.newSize, 18)})`);
  console.log(`  page   HTTP ${res.status}: ${card}`);
}
