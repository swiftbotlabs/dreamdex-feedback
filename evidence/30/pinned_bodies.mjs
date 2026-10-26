// Writes the JSON-RPC eth_call bodies used in step 3 of the report (BTC-PERP, block 0x1fe96e5).
// Read-only: each body is a plain eth_call; nothing is signed or sent. Usage: node pinned_bodies.mjs <outdir>
import { parseAbi, encodeFunctionData } from "viem";
import fs from "node:fs";
import path from "node:path";
const out = process.argv[2] ?? ".";
const abi = parseAbi(["function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k)"]);
const POOL = "0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0"; // BTC-PERP: minQuantity 13000, lotSize 1000
const DUST = "0x1cc7ecc3a7dba7760c7a47b926bd11b6211ed276"; // long 2000 at this block
const FLAT = "0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817"; // no BTC position
const BLOCK = "0x1fe96e5"; // 33461989, ts 1792998347 (2026-10-26 07:05:47 UTC)
const EXP = 1793001947000000000n; // block ts + 1 h, in ns
const BID = 80196800000000000000000n, ASK = 80197000000000000000000n; // best bid / best ask at this block
const ZERO = "0x0000000000000000000000000000000000000000";
const bodies = {
  "req_full_close_sell_2000.json": [DUST, false, BID, 2000n],
  "req_partial_sell_1000.json": [DUST, false, BID, 1000n],
  "req_close_flip_sell_3000.json": [DUST, false, BID, 3000n],
  "req_increase_buy_2000.json": [DUST, true, ASK, 2000n],
  "req_flat_account_sell_2000.json": [FLAT, false, BID, 2000n],
};
for (const [name, [from, isBid, px, q]] of Object.entries(bodies)) {
  const data = encodeFunctionData({ abi, functionName: "placeOrder", args: [isBid, 0n, px, q, EXP, 2, 0, ZERO, 0n] }); // orderType 2 = IOC
  fs.writeFileSync(path.join(out, name), JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from, to: POOL, data }, BLOCK] }) + "\n");
  console.log("wrote", name);
}
