// Builds the exact amendOrder calldata for one pinned case and prints it as a raw eth_call body (read-only).
// Usage: node pinned_call.mjs <pool> <owner> <orderId> <price> <qty> <isBidOfReplacement:true|false> <block>
import { createPublicClient, http, defineChain, parseAbi, encodeFunctionData, toHex } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const T = "(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k)";
const abi = parseAbi([`function amendOrder((uint128 oldOrderId, bool alwaysPlace, ${T} newOrder) request) returns (uint128 newOrderId)`]);
const [pool, owner, id, price, qty, isBid, blk] = process.argv.slice(2);
const b = await c.getBlock({ blockNumber: BigInt(blk) });
const data = encodeFunctionData({ abi, functionName: "amendOrder", args: [{ oldOrderId: BigInt(id), alwaysPlace: false, newOrder: { isBid: isBid === "true", userData: 0n, price: BigInt(price), quantity: BigInt(qty), expireTimestampNs: (b.timestamp + 7200n) * 1_000_000_000n, orderType: 0, selfMatchingOption: 0, builder: "0x0000000000000000000000000000000000000000", builderFeeBpsTimes1k: 0n } }] });
console.log(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from: owner, to: pool, data, gas: "0x1c9c380" }, toHex(BigInt(blk))] }));
