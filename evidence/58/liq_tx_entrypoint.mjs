// Read-only: sender, target, selector and first arguments of each transaction. usage: node liq_tx_entrypoint.mjs <txHash>...
import { createPublicClient, http, defineChain } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const c = createPublicClient({ chain: defineChain({ id: 50383, name: "H", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }), transport: http(RPC) });
for (const h of process.argv.slice(2)) { const t = await c.getTransaction({ hash: h }); console.log(h.slice(0, 12), "from", t.from, "to", t.to, "sel", t.input.slice(0, 10), "len", (t.input.length - 2) / 2, "type", t.type, "args", t.input.slice(10, 10 + 64 * 4).match(/.{64}/g)?.map(x => x.replace(/^0+/, "") || "0").join(",")); }
