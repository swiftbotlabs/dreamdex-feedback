// Control: SAME call with a wallet that HAS an account (random in-memory key, never funded, 0 STT).
// subscribeRaw checks balance >= 32 STT first and returns an Error before any write: nothing is signed or sent.
import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { createReactivity, DEFAULT_SUBSCRIPTION_OPTIONS } from "@somnia-chain/markets-sdk/reactivity";
import { createWalletClient, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
const ts = () => new Date().toISOString();
const ex = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql", addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES });
const acct = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ account: acct, chain: hidekiTestnet, transport: http(hidekiTestnet.rpcUrls.default.http[0]) });
console.log(ts(), "random account", acct.address, "balance", String(await ex.client.getViemClient().getBalance({ address: acct.address })));
const r = createReactivity(ex.client, { wallet });
const filter = { emitter: SOMNIA_HIDEKI_TESTNET_ADDRESSES.marginBank, eventTopics: [keccak256(toBytes("Transfer(address,address,uint256)"))] };
for (const [label, fn] of [
  ["E1 subscribe() with funded-less account wallet", () => r.subscribe({ handlerContractAddress: "0x1111111111111111111111111111111111111111", filter, options: DEFAULT_SUBSCRIPTION_OPTIONS })],
  ["E2 scheduleSubscriptionAtTimestamp(now+60s) same wallet", () => r.scheduleSubscriptionAtTimestamp({ timestampMs: Date.now() + 60_000, handlerContractAddress: "0x1111111111111111111111111111111111111111", options: DEFAULT_SUBSCRIPTION_OPTIONS })],
]) {
  try { const v = await fn(); console.log(ts(), `${label}: RESOLVED ->`, v instanceof Error ? "Error object: " + v.message : String(v)); }
  catch (e) { console.log(ts(), `${label}: REJECTED -> ${e.name}: ${e.message.split("\n")[0]}`); }
}
await ex.close?.(); process.exit(0);
