import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
const IDX="https://hideki-dev.smk.somnia.host/v1/graphql";
const m = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: IDX, addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES });
const c=m.client;
const a='0xa343fd06c0e0e0f2bba0b7e1a3b8d41ba1a9c3a1'; // dummy lower-case, may not matter
const s = await c.accountOrders.getSnapshot('0x5173f339'.padEnd(42,'0')).catch(e=>({err:e.message}));
console.log(JSON.stringify(s,(k,v)=>typeof v==='bigint'?v.toString():v).slice(0,600));
// introspect schema for account view capability
const r = await fetch(IDX,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'{ AccountCapability(limit:5){ id } AccountOrderChange(limit:1){ id } AccountPositionCapability(limit:3){ id } }'})}).then(r=>r.json());
console.log(JSON.stringify(r).slice(0,500));
await m.close?.(); process.exit(0);
