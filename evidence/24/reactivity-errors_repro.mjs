// verify-5: independent repro. Read-only: no private key, nothing signed, nothing broadcast.
// Checks what @somnia-chain/markets-sdk/reactivity (createReactivity -> upstream @somnia-chain/reactivity SDK)
// methods do when called WITHOUT a wallet (or with a wallet that has no account), vs the docs:
//   "Upstream methods resolve to `T | Error` instead of throwing."
//   "writes need a wallet client: pass one to createReactivity, or upstream's write silently resolves to `null`."
import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { createReactivity, unwrap, DEFAULT_SUBSCRIPTION_OPTIONS } from "@somnia-chain/markets-sdk/reactivity";
import { createWalletClient, http, keccak256, toBytes } from "viem";
import { readFileSync } from "node:fs";

const ts = () => new Date().toISOString();
const J = (o) => JSON.stringify(o, (k, v) => (typeof v === "bigint" ? v.toString() + "n" : v));
const ver = (p) => JSON.parse(readFileSync(new URL(`../node_modules/${p}/package.json`, import.meta.url))).version;
console.log(ts(), "node", process.version, "| markets-sdk", ver("@somnia-chain/markets-sdk"), "| reactivity", ver("@somnia-chain/reactivity"), "| viem", ver("viem"));

const ex = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql", addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES });
const v = ex.client.getViemClient();
console.log(ts(), "eth_chainId ->", await v.getChainId(), "| head block", String(await v.getBlockNumber()));

const r = createReactivity(ex.client); // no wallet: the read/watch-only construction
const handler = "0x1111111111111111111111111111111111111111"; // any non-zero address; nothing is sent
const topic = keccak256(toBytes("Transfer(address,address,uint256)"));
const filter = { emitter: SOMNIA_HIDEKI_TESTNET_ADDRESSES.marginBank, eventTopics: [topic] };
const opts = DEFAULT_SUBSCRIPTION_OPTIONS;

async function probe(label, fn) {
  try {
    const out = await fn();
    const desc = out === null ? "null" : out instanceof Error ? `Error object (${out.name}): ${out.message.split("\n")[0]}` : (J(out) ?? String(out)).slice(0, 160);
    console.log(ts(), `${label}: RESOLVED -> ${desc}`);
  } catch (e) {
    console.log(ts(), `${label}: REJECTED (threw) -> ${e?.name}: ${(e?.shortMessage ?? e?.message ?? String(e)).split("\n")[0].slice(0, 200)}`);
  }
}

console.log("--- A. no wallet passed to createReactivity ---");
await probe("A1 subscribe()", () => r.subscribe({ handlerContractAddress: handler, filter, options: opts }));
await probe("A2 subscribeRaw()", () => r.subscribeRaw({ eventTopics: [topic, "0x" + "00".repeat(32), "0x" + "00".repeat(32), "0x" + "00".repeat(32)], origin: "0x0000000000000000000000000000000000000000", caller: "0x0000000000000000000000000000000000000000", emitter: filter.emitter, handlerContractAddress: handler, handlerFunctionSelector: "0x2a3b2bd4", priorityFeePerGas: 0n, maxFeePerGas: 20_000_000_000n, gasLimit: 10_000_000n, isGuaranteed: false, isCoalesced: false }));
await probe("A3 scheduleSubscriptionAtTimestamp(now+60s)", () => r.scheduleSubscriptionAtTimestamp({ timestampMs: Date.now() + 60_000, handlerContractAddress: handler, options: opts }));
const head = await v.getBlockNumber();
await probe("A4 scheduleSubscriptionAtBlock(head+100)", () => r.scheduleSubscriptionAtBlock({ blockNumber: head + 100n, handlerContractAddress: handler, options: opts }));
await probe("A5 scheduleSubscriptionAtEpoch(7n)", () => r.scheduleSubscriptionAtEpoch({ epochNumber: 7n, handlerContractAddress: handler, options: opts }));
await probe("A6 unsubscribe(1n)", () => r.unsubscribe(1n));
await probe("A7 getSubscriptionInfo(10n**30n) (unknown id)", () => r.getSubscriptionInfo(10n ** 30n));
await probe("A8 getSubscriptionInfo(2n**255n) (unknown id)", () => r.getSubscriptionInfo(2n ** 255n));
await probe("A9 getSubscriptionInfo(1n) (control: existing id?)", () => r.getSubscriptionInfo(1n));

console.log("--- B. controls on the SAME no-wallet client: validation failures do resolve to Error ---");
await probe("B1 subscribe() gasLimit 0n", () => r.subscribe({ handlerContractAddress: handler, filter, options: { ...opts, gasLimit: 0n } }));
await probe("B2 scheduleSubscriptionAtTimestamp(now-1s)", () => r.scheduleSubscriptionAtTimestamp({ timestampMs: Date.now() - 1000, handlerContractAddress: handler, options: opts }));
await probe("B3 scheduleSubscriptionAtBlock(head-1)", async () => r.scheduleSubscriptionAtBlock({ blockNumber: (await v.getBlockNumber()) - 1n, handlerContractAddress: handler, options: opts }));

console.log("--- C. the documented idiom, written literally (docs 'Errors' section, option 2) ---");
try {
  const result = await r.subscribe({ handlerContractAddress: handler, filter, options: opts });
  if (result instanceof Error) { console.log(ts(), "C1 idiom: reached instanceof check -> Error:", result.message); }
  else if (result === null) { console.log(ts(), "C1 idiom: result === null"); }
  else { console.log(ts(), "C1 idiom: result =", String(result)); }
} catch (e) {
  console.log(ts(), `C1 idiom: the await itself THREW before 'if (result instanceof Error)' ran -> ${e.name}: ${e.message}`);
}
try {
  const hash = unwrap(await r.subscribe({ handlerContractAddress: handler, filter, options: opts }));
  console.log(ts(), "C2 unwrap idiom: hash", hash);
} catch (e) {
  console.log(ts(), `C2 unwrap idiom: threw (from the await, not from unwrap) -> ${e.name}: ${e.message}`);
}
try {
  const res = await r.unsubscribe(1n);
  console.log(ts(), `C3 'no wallet -> null' check on unsubscribe: res === null is ${res === null}; res instanceof Error is ${res instanceof Error}`);
} catch (e) { console.log(ts(), "C3 unsubscribe threw", e.message); }

console.log("--- D. wallet client passed but with no hoisted account (e.g. an injected/JSON-RPC wallet created without `account`) ---");
const walletNoAcct = createWalletClient({ chain: hidekiTestnet, transport: http(hidekiTestnet.rpcUrls.default.http[0]) });
const rW = createReactivity(ex.client, { wallet: walletNoAcct });
await probe("D1 subscribe() wallet without account", () => rW.subscribe({ handlerContractAddress: handler, filter, options: opts }));

await ex.close?.();
process.exit(0);
