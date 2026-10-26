// Read-only (no transaction): pinned-block eth_call of BTC-PERP placeOrder below minQuantity. Usage: node repro_pinned.mjs
import { parseAbi, encodeFunctionData } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const abi = parseAbi(["function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k)"]);
const POOL = "0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0"; // BTC-PERP, minQuantity 13000, lotSize 1000
const DUST = "0x1cc7ecc3a7dba7760c7a47b926bd11b6211ed276"; // long 2000 (0.00002 BTC)
const FLAT = "0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817";
const BLOCK = "0x1fe96e5"; // 33461989, ts 1792998347
const EXP = 1793001947000000000n; // block ts + 1 h, in ns
const PX = 80196800000000000000000n; // best bid at that block
const cases = [["dust owner: sell 2000 (exact full close)", DUST, false, 2000n], ["dust owner: sell 1000 (partial)", DUST, false, 1000n], ["dust owner: sell 3000 (close + flip)", DUST, false, 3000n], ["dust owner: buy 2000 (increase)", DUST, true, 2000n], ["flat control: sell 2000", FLAT, false, 2000n]];
for (const [label, from, isBid, q] of cases) {
  const data = encodeFunctionData({ abi, functionName: "placeOrder", args: [isBid, 0n, isBid ? 80197000000000000000000n : PX, q, EXP, 2, 0, "0x0000000000000000000000000000000000000000", 0n] });
  const j = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from, to: POOL, data }, BLOCK] }) })).json();
  console.log(label.padEnd(42), j.result !== undefined ? "ACCEPTED" : "REVERT " + j.error?.data);
}
