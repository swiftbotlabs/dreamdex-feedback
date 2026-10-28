// Read-only. Lists every perp pool the Hideki (Tokyo, 50383) PerpPoolFactory knows, with its base token's symbol
// and decimals read on-chain, and counts how many are not 18-decimal.  usage: node perp_base_decimals.mjs
import { createPublicClient, http, defineChain, parseAbi } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const FACTORY = "0xE631fAEE547baeE07353E290f0562ea67d856560";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const fac = parseAbi(["function getPerpPoolStatuses() view returns ((address perpPool, address baseToken, bool restricted)[] statuses)"]);
const erc = parseAbi(["function decimals() view returns (uint8)", "function symbol() view returns (string)"]);
const st = await c.readContract({ address: FACTORY, abi: fac, functionName: "getPerpPoolStatuses" });
console.log(`run ${new Date().toISOString()}  factory ${FACTORY}  pools ${st.length}`);
let live = 0, non18 = 0;
for (const s of st) {
  const [dec, sym] = await Promise.all([c.readContract({ address: s.baseToken, abi: erc, functionName: "decimals" }), c.readContract({ address: s.baseToken, abi: erc, functionName: "symbol" })]);
  if (!s.restricted) { live++; if (Number(dec) !== 18) non18++; }
  console.log(`${s.perpPool}  ${sym.padEnd(9)} decimals ${String(dec).padStart(2)}  ${s.restricted ? "restricted (close-only)" : "open"}${Number(dec) !== 18 ? "   <- not 18" : ""}`);
}
console.log(`open perp pools: ${live}, of which base token is not 18 decimals: ${non18}`);
