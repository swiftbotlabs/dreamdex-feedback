// Leverage units for MarginBank.setMaxLeverage / getMaxLeverage on Somnia Tokyo (50383).
// Read-only: eth_call only, no transactions are sent.
import { createPublicClient, http, parseAbi, encodeFunctionData, toFunctionSelector, defineChain } from "viem";

const chain = defineChain({ id: 50383, name: "Somnia Tokyo testnet", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: ["https://api.hideki2.infra.testnet.somnia.network"] } } });
const c = createPublicClient({ chain, transport: http() });

const MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const FACTORY = "0xE631fAEE547baeE07353E290f0562ea67d856560";
const FROM = "0x2A11e7388D1D2F9690f2636846d44b478f61bF08";
const OTHER = "0xd631B6253990e7669e8cb5100c375ED2F8142122";

const mbAbi = parseAbi([
  "function setMaxLeverage(address perpPool, uint16 leverageX)",
  "function getMaxLeverage(address account, address perpPool) view returns (uint16)",
  "function getMaxLeverageLimit() view returns (uint16)",
]);
const facAbi = parseAbi([
  "function getPerpPoolStatuses() view returns ((address perpPool, address baseToken, bool restricted)[] statuses)",
]);
const ercAbi = parseAbi(["function symbol() view returns (string)"]);

const sel = (s) => toFunctionSelector(s);
const ERR = { [sel("InvalidLeverage()")]: "InvalidLeverage()" };
const t = () => new Date().toISOString();

const chainId = await c.getChainId();
console.log(`${t()} chainId=${chainId}`);

const statuses = await c.readContract({ address: FACTORY, abi: facAbi, functionName: "getPerpPoolStatuses" });
const pools = [];
for (const s of statuses) {
  let sym = "?";
  try { sym = await c.readContract({ address: s.baseToken, abi: ercAbi, functionName: "symbol" }); } catch {}
  pools.push({ pool: s.perpPool, sym, restricted: s.restricted });
}
const btc = pools.find((p) => p.pool.toLowerCase() === "0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0");
console.log(`${t()} factory pools=${pools.length}; 0x4181dd08... base symbol=${btc?.sym} restricted=${btc?.restricted}`);

let bn = await c.getBlockNumber();
const lim = await c.readContract({ address: MB, abi: mbAbi, functionName: "getMaxLeverageLimit", blockNumber: bn });
console.log(`${t()} block ${bn} getMaxLeverageLimit() = ${lim}`);

const pool = btc.pool;
for (const L of [1, 5, 20, 21, 10000, 50000, 200000]) {
  bn = await c.getBlockNumber();
  let data;
  try {
    data = encodeFunctionData({ abi: mbAbi, functionName: "setMaxLeverage", args: [pool, L] });
  } catch (e) {
    console.log(`${t()} setMaxLeverage(${btc.sym}, ${L}): ENCODE ERROR ${e.name}: ${e.shortMessage ?? e.message.split("\n")[0]}`);
    continue;
  }
  try {
    const r = await c.request({ method: "eth_call", params: [{ from: FROM, to: MB, data }, "0x" + bn.toString(16)] });
    console.log(`${t()} block ${bn} eth_call setMaxLeverage(${btc.sym}, ${L}) from ${FROM}: OK returned ${r}`);
  } catch (e) {
    const raw = e?.cause?.data ?? e?.data ?? e?.details ?? "";
    const m = String(JSON.stringify(e?.cause ?? {}) + " " + (e.details ?? "")).match(/0x[0-9a-fA-F]{8,}/);
    const d = typeof raw === "string" && raw.startsWith("0x") ? raw : (m ? m[0] : "");
    console.log(`${t()} block ${bn} eth_call setMaxLeverage(${btc.sym}, ${L}) from ${FROM}: REVERT data=${d} -> ${ERR[d.slice(0, 10)] ?? "unknown"} | ${e.shortMessage ?? ""} ${e.details ?? ""}`.trim());
  }
}

bn = await c.getBlockNumber();
const nonzero = [];
for (const p of pools) {
  const v = await c.readContract({ address: MB, abi: mbAbi, functionName: "getMaxLeverage", args: [OTHER, p.pool], blockNumber: bn });
  if (v !== 0) nonzero.push(`${p.sym} ${p.pool}=${v}`);
}
console.log(`${t()} block ${bn} getMaxLeverage(${OTHER}, pool) non-zero: ${nonzero.join("; ") || "none"}`);
const mine = await c.readContract({ address: MB, abi: mbAbi, functionName: "getMaxLeverage", args: [FROM, pool], blockNumber: bn });
console.log(`${t()} block ${bn} getMaxLeverage(${FROM}, ${btc.sym}) = ${mine}`);
