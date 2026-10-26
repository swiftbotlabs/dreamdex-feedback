import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
const IDX="https://hideki-dev.smk.somnia.host/v1/graphql";
const m = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: IDX, addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES });
const c=m.client;
const MB='0x478769E1177C0773c43A593DCCc4Ad15F15F1394'; const REG='0x5b3C5Bf1F7AdA852e8AA783f6299932E32073aFb';
const child='0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a', main='0x93b72eac8f4c06d8adfccd2fa47e1b5a93d5a31e';
const j=(x)=>JSON.stringify(x,(k,v)=>typeof v==='bigint'?v.toString():v);
for (const [n,f] of Object.entries({
  registry:()=>c.getPerpLinkedWalletRegistry(MB),
  linkageChild:()=>c.getPerpWalletLinkage(REG,child),
  linkageMain:()=>c.getPerpWalletLinkage(REG,main),
  mainFunding:()=>c.getPerpMainFunding(MB,child),
  payerChild:()=>c.quotePerpFundingPayer(MB,child),
  payerMain:()=>c.quotePerpFundingPayer(MB,main),
  pullCapMain:()=>c.getPerpWalletPullCapacity(MB,main),
  pullCapChild:()=>c.getPerpWalletPullCapacity(MB,child),
  children:()=>c.listPerpLinkedChildren(REG,main),
  maxChildren:()=>c.getPerpMaxLinkedChildren(REG),
})) { try { console.log(n, j(await f())); } catch(e){ console.log(n,'ERR',(e.shortMessage||e.message||'').slice(0,160)); } }
await m.close?.(); process.exit(0);
