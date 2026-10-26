// READ-ONLY check of our live-run trail on Somnia Tokyo/Hideki (chain 50383).
// No key, no writes. Run from a directory where viem 2.57.7 is installed (e.g. this repo after `npm ci`).
import { createPublicClient, http, defineChain } from "viem";

const chain = defineChain({ id: 50383, name: "hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: ["https://api.hideki2.infra.testnet.somnia.network"] } } });
const c = createPublicClient({ chain, transport: http() });
const POOL = "0x7058579f3248559963f79adb937c6de9f953e060";
const BOT = "0x2a11e7388d1d2f9690f2636846d44b478f61bf08";
const abi = [{ name: "getOrder", type: "function", stateMutability: "view", inputs: [{ type: "uint128", name: "orderId" }],
  outputs: [{ type: "tuple", components: [
    { type: "uint128", name: "orderId" }, { type: "bool", name: "isBid" }, { type: "address", name: "owner" },
    { type: "uint64", name: "userData" }, { type: "uint256", name: "price" }, { type: "uint256", name: "fullQuantity" },
    { type: "uint256", name: "quantityRemaining" }, { type: "uint64", name: "expireTimestampNs" }] }] }];

const txs = {
  "watch: bid placed": "0x7849bd35167e1e68b25a1d9821a87e9d470d43033aeb5e39d2b4afbe52203a5d",
  "watch: ask placed": "0xdd572112e861cbaa78d651301fd63585a4572a230d8ea8f9a1335703b3c8640e",
  "manual cancel 1": "0x4c7c770bb2dfa61c0e2f504051c6f77c746c3e62f5f32bfaf8a6d4da615ae36e",
  "manual cancel 2": "0xebb8db3842bbb367f5effe5459485d6752f815c5fe8eb55a17b7a612a214a48b",
  "plain: bid placed": "0xa783694f18da0bf433c8e511842b8f55fe8dbe306320d63cd01686c4ed06af79",
  "plain: ask placed": "0xfc02449309f80308d1ae53703902b1217cbc4cc9fdea39257ba0ac02d016761c",
  "plain: bot cancel 1": "0x45276ecd7dc36b46730e72c6a903efa1c31388eb38b8ffed48e233c35981978d",
  "plain: bot cancel 2": "0xde8a95a040bd8a4b8cae38c775fe501328107625b640e93e7bd2a75f5f7bde31",
};
const ids = { watchBid: 664082786653550186447n, watchAsk: 866996971464355254224n, plainBid: 866996971464355254568n, plainAsk: 664082786653550186793n };
const hexOf = (n) => n.toString(16);

console.log("checked at", new Date().toISOString(), "chainId", await c.getChainId(), "head", await c.getBlockNumber());
for (const [k, h] of Object.entries(txs)) {
  const [r, t] = await Promise.all([c.getTransactionReceipt({ hash: h }), c.getTransaction({ hash: h })]);
  const b = await c.getBlock({ blockNumber: r.blockNumber });
  const targets = Object.entries(ids).filter(([, v]) => t.input.toLowerCase().includes(hexOf(v))).map(([n]) => n);
  console.log(`${k.padEnd(20)} block ${r.blockNumber} ${new Date(Number(b.timestamp) * 1000).toISOString()} status ${r.status} from ${r.from === BOT ? "BOT key" : r.from} to ${r.to === POOL ? "XRP-PERP pool" : r.to} sel ${t.input.slice(0, 10)} orderId-in-calldata ${targets.join(",") || "-"}`);
}
async function order(id, blockNumber) {
  try {
    const o = await c.readContract({ address: POOL, abi, functionName: "getOrder", args: [id], blockNumber });
    return `owner ${o.owner.toLowerCase() === BOT ? "BOT" : o.owner} isBid ${o.isBid} full ${o.fullQuantity} remaining ${o.quantityRemaining}`;
  } catch (e) { return "ERR " + (e.shortMessage || e.message).slice(0, 140); }
}
const probes = [
  ["watch run, after both placed", 33263651n, ["watchBid", "watchAsk"]],
  ["watch run, ~SIGINT+1s (01:35:10Z)", 33263700n, ["watchBid", "watchAsk"]],
  ["watch run, first run's 01:36:58Z block", 33264772n, ["watchBid", "watchAsk"]],
  ["watch run, block before manual cancel", 33264913n, ["watchBid", "watchAsk"]],
  ["watch run, after manual cancels", 33264918n, ["watchBid", "watchAsk"]],
  ["plain run, block before bot cancel", 33265224n, ["plainBid", "plainAsk"]],
  ["plain run, after bot cancels", 33265230n, ["plainBid", "plainAsk"]],
];
for (const [label, bn, which] of probes) {
  const blk = await c.getBlock({ blockNumber: bn });
  for (const w of which) console.log(`${label.padEnd(40)} block ${bn} (${new Date(Number(blk.timestamp) * 1000).toISOString()}) ${w}: ${await order(ids[w], bn)}`);
}
