// Real transaction on Tokyo (Hideki) from our own test key: the REST API's market-buy price shape on an ETH-PERP order.
import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
const raw = process.env.PRIVATE_KEY;   // a funded Tokyo test key
const acct = privateKeyToAccount(raw.startsWith("0x") ? raw : `0x${raw}`);
const chain = defineChain({ id: 50383, name: "hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: ["https://api.hideki2.infra.testnet.somnia.network"] } } });
const c = createPublicClient({ chain, transport: http() }), w = createWalletClient({ account: acct, chain, transport: http() });
const POOL = process.argv[2]; const qty = BigInt(process.argv[3]); const tick = BigInt(process.argv[4]); const go = process.argv[5] === "--go";
const price = (((2n ** 256n - 1n) / qty) / tick) * tick;
const abi = parseAbi(["function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) payable returns (bool,uint128)"]);
const exp = BigInt(Math.floor(Date.now() / 1000) + 86400) * 1000000000n;
const data = encodeFunctionData({ abi, functionName: "placeOrder", args: [true, 0n, price, qty, exp, 2, 0, "0x0000000000000000000000000000000000000000", 0n] });
console.log("price", String(price), "qty", String(qty));
try { const r = await c.call({ account: acct.address, to: POOL, data, gas: 30000000n }); console.log("eth_call ok", String(r.data).slice(0, 40)); }
catch (e) { const d = e?.walk?.((x) => typeof x?.data === "string")?.data ?? ""; console.log("eth_call revert", d.slice(0, 74), String(e.shortMessage ?? "").slice(0, 80)); }
// comparator: same order at ask + 1%
const cmp = encodeFunctionData({ abi, functionName: "placeOrder", args: [true, 0n, BigInt(process.argv[6] ?? 0), qty, exp, 2, 0, "0x0000000000000000000000000000000000000000", 0n] });
if (process.argv[6]) { try { const r = await c.call({ account: acct.address, to: POOL, data: cmp, gas: 30000000n }); console.log("comparator eth_call ok", String(r.data).slice(0, 70)); } catch (e) { console.log("comparator revert", String(e.shortMessage ?? "").slice(0, 100)); } }
if (go) {
  const hash = await w.sendTransaction({ to: POOL, data, gas: 10000000n });
  const r = await c.waitForTransactionReceipt({ hash });
  console.log("tx", hash, "status", r.status, "gasUsed", String(r.gasUsed), "block", String(r.blockNumber));
}
