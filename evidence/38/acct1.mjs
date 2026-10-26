import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { getAddress } from "viem";
const IDX="https://hideki-dev.smk.somnia.host/v1/graphql";
const m = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: IDX, addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES });
const c=m.client;
const j=(x)=>JSON.stringify(x,(k,v)=>typeof v==='bigint'?v.toString():v);
// pick accounts with open perp positions
const q = await fetch(IDX,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'{ PerpPosition(limit:6, where:{size:{_neq:"0"}}){ account pool size } }'})}).then(r=>r.json());
const rows=q.data.PerpPosition;
const MB='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
for (const r of rows.slice(0,3)) {
  const lo=r.account.toLowerCase(), cs=getAddress(lo);
  for (const [lab,a] of [['lower',lo],['checksum',cs]]) {
    try {
      const s = await c.accountOrders.getSnapshot(a);
      console.log('orders',lab,a.slice(0,8), s.status, s.status==='ready'? `orders=${s.data.orders.length} stops=${s.data.stops?.length}`: (s.reason||s.detail||''));
    } catch(e){ console.log('orders',lab,'ERR',(e.shortMessage||e.message).slice(0,120)); }
    try {
      const p = await c.accountPositions.getSnapshot?.(MB,a);
      console.log('positions',lab, p? `${p.status} n=${p.data?.positions?.length}`:'no getSnapshot', Object.keys(c.accountPositions));
    } catch(e){ console.log('positions',lab,'ERR',(e.shortMessage||e.message).slice(0,120)); }
  }
}
await m.close?.(); process.exit(0);
