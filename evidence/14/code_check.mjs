// Read-only: eth_getCode on the old and new PerpPool implementations; counts occurrences of the 0x44a03a20 selector.
import { createPublicClient, http, defineChain, keccak256, toHex } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const sel = keccak256(toHex("AmendSideMismatch(uint128)")).slice(2, 10);
console.log(`${new Date().toISOString()} keccak256("AmendSideMismatch(uint128)")[:4] = 0x${sel}`);
for (const [label, a] of [["old impl (until block 29293076)", "0x772e9B720C8140FaAA4D561a15269ED60E01521D"], ["new impl (from block 29293077)", "0x81F9EB88C95a52B4D3eA47A73ac394b8A547d443"]]) {
  const code = (await c.getCode({ address: a })).toLowerCase();
  const n = code.split("63" + sel).length - 1; // PUSH4 <selector>
  const n32 = code.split("7f" + sel).length - 1; // PUSH32 <selector>...
  const any = code.split(sel).length - 1;
  console.log(`${label} ${a}: code ${(code.length - 2) / 2} bytes | '${sel}' occurrences ${any} (PUSH4 ${n}, PUSH32 ${n32})`);
}
