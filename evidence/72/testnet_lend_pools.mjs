// Read-only. Compares the two SomniaLend deployments on Somnia Shannon testnet (chain 50312):
//   A = what the dreamDEX testnet app's Lend page uses (app.testnet.dreamdex.io, chunk 3vmw5t3leotm9.js)
//   B = SDK 0.32.1 SOMNIA_TESTNET_LEND, which is also the only testnet market in SomniaLend's own app
// Usage: node evidence/72/testnet_lend_pools.mjs [account ...]
import { createPublicClient, http, parseAbi, formatUnits, encodeFunctionData } from "viem";
const RPC = "https://api.infra.testnet.somnia.network";
const c = createPublicClient({ transport: http(RPC, { timeout: 60000, retryCount: 2 }) });
const USDSO = "0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171"; // dreamDEX testnet USDso (docs: Shannon contract addresses)
const P = {
  "A dreamDEX app testnet": { pool: "0x5A44488FBC0BC2296359b3decE3049Ab96aB2D09", provider: "0xA052fbA0528755A6FB631fCDFaaa647a4200F251" },
  "B SDK SOMNIA_TESTNET_LEND / SomniaLend app": { pool: "0x7Cb9df1bc191B16BeFF9fdEC2cd1ef91Cac18176", provider: "0xEbf503eD254014C152965C52006A34f7Ab3d28f1" },
};
const abi = parseAbi([
  "function getPool() view returns (address)",
  "function getReservesList() view returns (address[])",
  "function getUserAccountData(address) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function symbol() view returns (string)",
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
]);
const bn = await c.getBlockNumber();
const blk = await c.getBlock({ blockNumber: bn });
console.log(`Shannon block ${bn} (${new Date(Number(blk.timestamp) * 1000).toISOString()})`);
const who = process.argv.slice(2);
for (const [name, p] of Object.entries(P)) {
  const gp = await c.readContract({ address: p.provider, abi, functionName: "getPool", blockNumber: bn });
  const list = await c.readContract({ address: p.pool, abi, functionName: "getReservesList", blockNumber: bn });
  const syms = [];
  for (const a of list) syms.push(`${await c.readContract({ address: a, abi, functionName: "symbol", blockNumber: bn })} ${a}`);
  console.log(`\n[${name}] pool ${p.pool}; provider ${p.provider}.getPool() = ${gp}`);
  for (const s of syms) console.log(`  reserve ${s}`);
  console.log(`  dreamDEX testnet USDso is a reserve: ${list.some((x) => x.toLowerCase() === USDSO.toLowerCase())}`);
  const data = encodeFunctionData({ abi, functionName: "supply", args: [USDSO, 10n ** 18n, "0x2A11e7388D1D2F9690f2636846d44b478f61bF08", 0] });
  const r = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from: "0x2A11e7388D1D2F9690f2636846d44b478f61bF08", to: p.pool, data }, `0x${bn.toString(16)}`] }) })).json();
  console.log(`  eth_call supply(USDso, 1e18): ${r.error ? `revert, data ${JSON.stringify(r.error.data)}` : "ok"}`);
  for (const a of who) {
    const d = await c.readContract({ address: p.pool, abi, functionName: "getUserAccountData", args: [a], blockNumber: bn });
    const hf = d[5] > 10n ** 30n ? "none (no debt)" : Number(formatUnits(d[5], 18)).toFixed(3);
    console.log(`  ${a}: collateral $${Number(formatUnits(d[0], 8)).toFixed(2)}, debt $${Number(formatUnits(d[1], 8)).toFixed(2)}, health factor ${hf}`);
  }
}
