// eth_call only: can an IOC sell at a one-tick limit open a short beyond the account's margin?
import { createPublicClient, http, parseAbi, encodeFunctionData, defineChain, decodeFunctionResult } from "viem";
const chain = defineChain({ id: 50383, name: "hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: ["https://api.hideki2.infra.testnet.somnia.network"] } } });
const c = createPublicClient({ chain, transport: http() });
const POOL = "0xd6cb1dd58580b84d76068ac21594219ce03aeddf", ME = "0x2A11e7388D1D2F9690f2636846d44b478f61bF08", ZERO = "0x0000000000000000000000000000000000000000";
const abi = parseAbi(["function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) payable returns (bool success, uint128 orderId)"]);
const exp = BigInt(Math.floor(Date.now() / 1000) + 86400) * 1000000000n;
const sim = async (label, args) => { const data = encodeFunctionData({ abi, functionName: "placeOrder", args }); try { const r = await c.call({ account: ME, to: POOL, data, gas: 30000000n }); console.log(label, "OK", String(r.data).slice(0, 70)); } catch (e) { const d = e?.walk?.((x) => typeof x?.data === "string")?.data ?? ""; let t=d; try{ if(d.startsWith("0x08c379a0")){ const len=parseInt(d.slice(74,138),16); t="Error(\""+Buffer.from(d.slice(138,138+2*len),"hex").toString()+"\")"; } }catch{}; console.log(label, "REVERT", t.slice(0,110)); } };
const tick = 10n ** 16n;
for (const [q, name] of [[4n * 10n ** 15n, "0.004 ETH"], [10n ** 16n, "0.01 ETH"], [10n ** 17n, "0.1 ETH"], [10n ** 18n, "1 ETH"], [10n * 10n ** 18n, "10 ETH"]]) {
  await sim(`IOC sell ${name} at 1 tick`, [false, 0n, tick, q, exp, 2, 0, ZERO, 0n]);
  await sim(`IOC sell ${name} at 2200   `, [false, 0n, 2200n * 10n ** 18n, q, exp, 2, 0, ZERO, 0n]);
}
