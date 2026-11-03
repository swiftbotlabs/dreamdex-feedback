// Read-only, Somnia mainnet. The Safe that has received the daily USDso yield since Oct 14: version, threshold,
// owner count (not the owners) and its nonce at the last payout block, mid-way, and now.
// Usage: node evidence/73/safe_state.mjs
import { createPublicClient, http, parseAbi } from "viem";
const c = createPublicClient({ transport: http("https://api.infra.mainnet.somnia.network", { timeout: 60000 }) });
const SAFE = "0xddc4f8a5664f91cda4abc13c80bbb8e4f2f6a280";
const abi = parseAbi(["function getOwners() view returns (address[])", "function getThreshold() view returns (uint256)", "function VERSION() view returns (string)", "function nonce() view returns (uint256)"]);
const [v, th, owners] = await Promise.all([c.readContract({ address: SAFE, abi, functionName: "VERSION" }), c.readContract({ address: SAFE, abi, functionName: "getThreshold" }), c.readContract({ address: SAFE, abi, functionName: "getOwners" })]);
console.log(`Safe ${SAFE}: version ${v}, threshold ${th} of ${owners.length} owners`);
for (const b of [437566460n, 450000000n, await c.getBlockNumber()]) {
  const blk = await c.getBlock({ blockNumber: b });
  console.log(`block ${b} ${new Date(Number(blk.timestamp) * 1000).toISOString()}: nonce ${await c.readContract({ address: SAFE, abi, functionName: "nonce", blockNumber: b })}`);
}
