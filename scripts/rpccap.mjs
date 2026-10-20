// Supporting probe (not tied to one report): what the Hideki RPC supports for the eth_call reproductions
// (plain eth_call, state overrides, eth_simulateV1).
// Run:  node scripts/rpccap.mjs
// Read-only.
import { createPublicClient, http, parseAbi, encodeFunctionData, defineChain, parseEther } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const client = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const ME = "0x2A11e7388D1D2F9690f2636846d44b478f61bF08";
const VOUCHER = "0x2ACD9EFdA721450906bfE1bef3edE269636E42C4";
const abi = parseAbi(["function claim()", "function isClaimed(address) view returns (bool)"]);
const data = encodeFunctionData({ abi, functionName: "claim" });
const show = (l, p) => p.then(r => console.log(l, JSON.stringify(r, (_, v) => typeof v === "bigint" ? v.toString() : v).slice(0, 300))).catch(e => console.log(l, "ERR", (e.shortMessage || e.message).slice(0, 300)));
await show("balance", client.getBalance({ address: ME }));
await show("eth_call claim (no override)", client.call({ account: ME, to: VOUCHER, data }));
await show("eth_call claim (balance override)", client.call({ account: ME, to: VOUCHER, data, stateOverride: [{ address: ME, balance: parseEther("1") }] }));
await show("estimateGas claim", client.estimateGas({ account: ME, to: VOUCHER, data }));
await show("eth_simulateV1", client.request({ method: "eth_simulateV1", params: [{ blockStateCalls: [{ stateOverrides: { [ME]: { balance: "0xde0b6b3a7640000" } }, calls: [{ from: ME, to: VOUCHER, data }] }], validation: false, traceTransfers: false }, "latest"] }));
await show("gasPrice", client.getGasPrice());
await show("net_version", client.request({ method: "net_version", params: [] }));
