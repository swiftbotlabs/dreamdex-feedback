// Read-only: ERC-20 transfers in one Somnia mainnet transaction (what the Event Contract trader paid). usage: node ec_fill_transfers.mjs <txHash>
import { createPublicClient, http, defineChain, formatUnits } from "viem";
const RPC = "https://api.infra.mainnet.somnia.network";
const c = createPublicClient({ chain: defineChain({ id: 5031, name: "S", nativeCurrency: { name: "S", symbol: "S", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }), transport: http(RPC) });
const r = await c.getTransactionReceipt({ hash: process.argv[2] });
const T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", T1155 = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
for (const l of r.logs) {
  if (l.topics[0] === T && l.topics.length === 3) console.log("ERC20", l.address, "from", "0x" + l.topics[1].slice(26), "to", "0x" + l.topics[2].slice(26), formatUnits(BigInt(l.data), 18));
  else if (l.topics[0] === T1155) { const d = l.data.slice(2); console.log("1155", l.address, "from", "0x" + l.topics[2].slice(26), "to", "0x" + l.topics[3].slice(26), "id", BigInt("0x" + d.slice(0, 64)).toString().slice(-4), "amt", formatUnits(BigInt("0x" + d.slice(64, 128)), 18)); }
  else console.log("log", l.address.slice(0, 10), l.topics[0].slice(0, 10));
}
