// Build a selector -> error-signature map from the SDK's contractErrorsAbi.ts (read as text, never executed).
// Reproduces: reports 02 and 06 (is a selector in the SDK's error ABI?).
// Run:  node scripts/errsel.mjs <path/to/contractErrorsAbi.ts> <selector...>
// e.g.  npm pack @somnia-chain/markets-sdk@0.32.1 && tar xzf somnia-chain-markets-sdk-0.32.1.tgz
//       node scripts/errsel.mjs package/src/contractErrorsAbi.ts 0x3e31dcc2      -> UNKNOWN
import { readFileSync } from "node:fs";
import { keccak256, toHex } from "viem";
const src = readFileSync(process.argv[2], "utf8");
const re = /\{ type: "error", name: "(\w+)", inputs: \[(.*?)\] \}/g;
const map = {};
let m;
while ((m = re.exec(src))) {
  const types = [...m[2].matchAll(/type: "([^"]+)"/g)].map(x => x[1]);
  const sig = `${m[1]}(${types.join(",")})`;
  map[keccak256(toHex(sig)).slice(0, 10)] = sig;
}
console.log("errors parsed:", Object.keys(map).length);
for (const sel of process.argv.slice(3)) console.log(sel, "=>", map[sel] ?? "UNKNOWN");
