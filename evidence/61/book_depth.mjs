// Read-only: for every perp market on Hideki, how much rests within 20 bps of the touch (the executor's IOC buffer)?
import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { defineChain } from "viem";
const chain = defineChain({ id: 50383, name: "hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: ["https://api.hideki2.infra.testnet.somnia.network"], webSocket: ["wss://api.hideki2.infra.testnet.somnia.network/ws"] } } });
const ex = new SomniaMarkets({ indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql", chain, wsRpcUrl: "wss://api.hideki2.infra.testnet.somnia.network/ws", addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES });
const all = await ex.loadMarkets(true);
const out = [];
for (const m of Object.values(all)) {
  if (m.type !== "swap" || !m.active) continue;
  try {
    const b = await ex.fetchOrderBook(m.symbol, 50);
    const f = (lv, sgn) => { if (!lv?.length) return [null, 0]; const t = lv[0][0]; let n = 0; for (const [p, q] of lv) { if (sgn * (p - t) / t <= 0.002) n += p * q; } return [t, n]; };
    const [bid, nb] = f(b.bids, -1), [ask, na] = f(b.asks, 1);
    out.push([m.symbol.split("/")[0], bid, ask, Math.round(nb), Math.round(na), bid && ask ? +(((ask - bid) / bid) * 1e4).toFixed(1) : null]);
  } catch (e) { out.push([m.symbol, "ERR", String(e).slice(0, 80)]); }
}
out.sort((a, b) => Math.min(a[3], a[4]) - Math.min(b[3], b[4]));
console.log("market bid ask usdso_within_20bps_bid usdso_within_20bps_ask spread_bps");
for (const r of out) console.log(r.join(" "));
process.exit(0);
