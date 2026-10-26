import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES, SOMNIA_TESTNET_PRICE_FEED, SOMNIA_MAINNET_PRICE_FEED } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
const IDX="https://hideki-dev.smk.somnia.host/v1/graphql";
const j=(x)=>JSON.stringify(x,(k,v)=>typeof v==='bigint'?v.toString():v);
console.log("Price-feed reads on the Hideki (chain 50383) perps client, SDK 0.32.1.");
console.log("Run:", new Date().toISOString());
console.log("\n(a) default client (no priceFeed) -> price-feed reads throw:");
const noFeed = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: IDX, addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES });
for (const [n,f] of [["fetchPrice('BTC')",()=>noFeed.fetchPrice('BTC')],["fetchPriceOHLCV('BTC','1m')",()=>noFeed.fetchPriceOHLCV('BTC','1m')],["listPriceFeeds()",()=>noFeed.listPriceFeeds()]]) {
  try { await f(); console.log("  "+n+": returned (no throw)"); } catch(e){ console.log("  "+n+": THROW "+e.name+" — "+(e.message||'').slice(0,150)); }
}
await noFeed.close?.();
console.log("\n(b) shipped feed constants (the only two the SDK exports):");
console.log("  SOMNIA_TESTNET_PRICE_FEED =", j(SOMNIA_TESTNET_PRICE_FEED));
console.log("  SOMNIA_MAINNET_PRICE_FEED =", j(SOMNIA_MAINNET_PRICE_FEED));
console.log("\n(c) pointing the Hideki client at SOMNIA_TESTNET_PRICE_FEED and reading BTC, vs the Hideki on-chain BTC perp mark:");
const feed = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: IDX, addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES, priceFeed: SOMNIA_TESTNET_PRICE_FEED });
const c = feed.client;
const perps = await c.listPerpMarkets();
const btc = perps.find(p=>p.baseSymbol==='BTC');
let feedPrice=null, mark=null;
try { const r = await feed.fetchPrice('BTC'); feedPrice=r.price; console.log("  dev-feed fetchPrice('BTC') =", r.price, "at", r.datetime); } catch(e){ console.log("  fetchPrice THREW", e.name); }
// on-chain mark via getPerpLeverage on a known account holding a BTC position
try {
  const q=await fetch(IDX,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:`{ PerpPosition(limit:1, where:{pool:{_eq:"${btc.poolAddress.toLowerCase()}"}, size:{_neq:"0"}}){ account } }`})}).then(r=>r.json());
  const acct=q.data.PerpPosition[0].account;
  const L=await c.getPerpLeverage({marginBank:btc.marginBank, account:acct, pool:btc.poolAddress});
  mark=L.markPrice; console.log("  Hideki on-chain BTC perp markPrice (getPerpLeverage) =", (Number(L.markPrice)/1e18).toFixed(2), "raw", L.markPrice);
} catch(e){ console.log("  on-chain mark read error:", (e.message||'').slice(0,100)); }
if(feedPrice&&mark){ const mk=Number(mark)/1e18; console.log("  diff:", (100*Math.abs(feedPrice-mk)/mk).toFixed(3)+"%"); }
await feed.close?.(); process.exit(0);
