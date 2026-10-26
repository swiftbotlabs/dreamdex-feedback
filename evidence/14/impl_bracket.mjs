import { createPublicClient, http, defineChain, parseAbi, toHex } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const BEACON = "0xb787f7d2f87d32c1505c110c4457ed36a3f6b002";
const abi = parseAbi(["function implementation() view returns (address)"]);
for (const b of [29292900n, 29293076n, 29293077n]) {
  const impl = await c.readContract({ address: BEACON, abi, functionName: "implementation", blockNumber: b });
  const blk = await c.getBlock({ blockNumber: b });
  console.log(`block ${b} ${new Date(Number(blk.timestamp) * 1000).toISOString()} impl ${impl}`);
}
// Upgraded(address) event on the beacon around the upgrade
const logs = await c.getLogs({ address: BEACON, event: parseAbi(["event Upgraded(address indexed implementation)"])[0], fromBlock: 29292900n, toBlock: 29293200n });
for (const l of logs) console.log(`Upgraded -> ${l.args.implementation} block ${l.blockNumber} tx ${l.transactionHash}`);
