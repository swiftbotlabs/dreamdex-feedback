import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { getAddress } from "viem";
const m = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql", addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES });
const c=m.client;
const MB='0x478769E1177C0773c43A593DCCc4Ad15F15F1394', REG='0x5b3C5Bf1F7AdA852e8AA783f6299932E32073aFb';
const mainLower='0x93b72eac8f4c06d8adfccd2fa47e1b5a93d5a31e', childLower='0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a';
const j=(x)=>JSON.stringify(x,(k,v)=>typeof v==='bigint'?v.toString():v);
for (const [label,a] of [['main lowercase',mainLower],['main checksummed',getAddress(mainLower)],['child lowercase',childLower],['child checksummed',getAddress(childLower)]]) {
  const L=await c.getPerpWalletLinkage(REG,a); const P=await c.quotePerpFundingPayer(MB,a);
  console.log(label.padEnd(18), 'isMain',L.isMain,'isChild',L.isChild,'| payer', j(P));
}
await m.close?.(); process.exit(0);
