// getClaimable() vs getClaimablePage() for mainnet wallets (read-only). node get_claimable_check.mjs <address>...
import { SomniaMarkets, SOMNIA_MAINNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { defineChain } from "viem";
const IDX = "https://prd.smk.somnia.host/v1/graphql", RPC = "https://api.infra.mainnet.somnia.network", WS = "wss://api.infra.mainnet.somnia.network/ws";
const chain = defineChain({ id: 5031, name: "somnia", nativeCurrency: { name: "S", symbol: "S", decimals: 18 }, rpcUrls: { default: { http: [RPC], webSocket: [WS] } } });
const ex = new SomniaMarkets({ indexerUrl: IDX, chain, addresses: SOMNIA_MAINNET_ADDRESSES, wsRpcUrl: WS });
for (const a of process.argv.slice(2)) {
  try { const c = await ex.client.getClaimable(a); console.log(a, "getClaimable ->", c.length, "entries"); }
  catch (e) { console.log(a, "getClaimable THROWS", e?.name, String(e?.message).slice(0, 220)); }
  try { const p = await ex.client.getClaimablePage(a, { limit: 200 }); console.log("   getClaimablePage(limit 200) ->", p.claims.length, "claims, nextOffset", p.nextOffset); } catch (e) { console.log("   page THROWS", e?.name, String(e?.message).slice(0, 160)); }
}
process.exit(0);
