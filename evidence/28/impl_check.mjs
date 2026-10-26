// Which implementation the stop registries and perp pools ran at each case's parent block and at the chain head
// (EIP-1967 beacon slot -> beacon.implementation()), and whether the registry implementation calls
// PerpPool.getReducingCapacity(address) (selector 0x2809c6ee). Read-only.
// usage: node impl_check.mjs
import { createPublicClient, http, parseAbi } from "viem";
const c = createPublicClient({ transport: http("https://api.hideki2.infra.testnet.somnia.network", { timeout: 30_000, retryCount: 2 }) });
const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const ab = parseAbi(["function implementation() view returns (address)"]);
const head = await c.getBlockNumber();
const headBlock = await c.getBlock({ blockNumber: head });
console.log(`run ${new Date().toISOString()}, head ${head} (${new Date(Number(headBlock.timestamp) * 1000).toISOString()})`);
const blocks = { "case3 parent": 28954336n, "case2 parent": 30228281n, "case7 parent": 30601341n, "case4 parent": 31141417n, "case6 parent": 31426379n, "case5 parent": 31439575n, "case1 parent": 33004738n, head };
const targets = {
  "NEAR registry": "0xf3a51c26ead3f84c2221336484bb42b8cfca076e", "BTC registry": "0x52e2ccebaec9332672c247e9a90aa3d61fb615ef",
  "ETH registry": "0x44bfa5b28684e8d2156d15b85902da18f02b3a34", "SOL registry": "0x85a0879d19777c343eb317a890d5058ab92b8f5d",
  "NEAR pool": "0x1cD15ae8bFf0FE0a7F49233BE8b90734775bA454", "BTC pool": "0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0",
  "ETH pool": "0xD6Cb1DD58580B84D76068aC21594219ce03aeddf", "SOL pool": "0xB483ec1fb34996638677c20ab087b16F1896FA53",
};
const regImpls = new Set();
for (const [name, addr] of Object.entries(targets)) {
  const row = [];
  for (const [label, b] of Object.entries(blocks)) {
    const w = await c.getStorageAt({ address: addr, slot: BEACON_SLOT, blockNumber: b });
    const beacon = "0x" + (w ?? "0x").slice(2).padStart(64, "0").slice(24);
    const impl = await c.readContract({ address: beacon, abi: ab, functionName: "implementation", blockNumber: b });
    if (name.endsWith("registry")) regImpls.add(impl);
    row.push(`${label} ${b}: beacon ${beacon} -> ${impl}`);
  }
  console.log(`${name} ${addr}\n  ` + row.join("\n  "));
}
for (const impl of regImpls) {
  const code = (await c.getCode({ address: impl })) ?? "0x";
  const n = code.split("2809c6ee").length - 1;
  console.log(`registry implementation ${impl}: ${(code.length - 2) / 2} bytes of code, selector 2809c6ee (getReducingCapacity(address)) appears ${n} time(s)`);
}
