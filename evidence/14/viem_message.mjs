// What viem (the SDK's transport) reports for this revert when given the SDK's own error table (parsed from text, SDK code not executed).
import { createPublicClient, http, defineChain, parseAbi, parseAbiItem, decodeErrorResult } from "viem";
import { readFileSync } from "node:fs";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const src = readFileSync(process.env.SDK_ERRORS_ABI ?? "sdk/package/src/contractErrorsAbi.ts", "utf8");
const errs = [...src.matchAll(/\{\s*type:\s*"error",\s*name:\s*"(\w+)",\s*inputs:\s*\[(.*?)\]\s*\}/gs)].map((m) => parseAbiItem(`error ${m[1]}(${[...m[2].matchAll(/type:\s*"([\w\[\]]+)"/g)].map((x) => x[1]).join(",")})`));
const T = "(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k)";
const abi = [...parseAbi([`function amendOrder((uint128 oldOrderId, bool alwaysPlace, ${T} newOrder) request) returns (uint128 newOrderId)`,
  "function getAllOpenOrdersOffChain(bool isBid, uint256 maxCount, uint64 startCursor) view returns ((uint128 orderId, bool isBid, address owner, uint64 userData, uint256 price, uint256 fullQuantity, uint256 quantityRemaining, uint64 expireTimestampNs)[] orders, bool hasMoreOrders, uint64 nextCursor)"]), ...errs];
const POOL = "0xD6Cb1DD58580B84D76068aC21594219ce03aeddf"; // ETH-PERP
const blockNumber = await c.getBlockNumber();
const [bids] = await c.readContract({ address: POOL, abi, functionName: "getAllOpenOrdersOffChain", args: [true, 5n, 0n], blockNumber });
const o = bids[0]; const blk = await c.getBlock({ blockNumber });
console.log(`${new Date().toISOString()} block ${blockNumber} ETH-PERP bid ${o.orderId} owner ${o.owner}`);
try {
  await c.simulateContract({ address: POOL, abi, functionName: "amendOrder", account: o.owner, blockNumber, args: [{ oldOrderId: o.orderId, alwaysPlace: false, newOrder: { isBid: false, userData: 0n, price: o.price, quantity: o.quantityRemaining, expireTimestampNs: (blk.timestamp + 3600n) * 1_000_000_000n, orderType: 0, selfMatchingOption: 0, builder: "0x0000000000000000000000000000000000000000", builderFeeBpsTimes1k: 0n } }] });
  console.log("unexpected: succeeded");
} catch (e) {
  const r = e.walk?.((x) => x.name === "ContractFunctionRevertedError");
  console.log("viem error:", e.name, "| revert errorName:", r?.data?.errorName, "| signature:", r?.signature, "| reason:", r?.reason);
  console.log("shortMessage:", JSON.stringify(e.shortMessage));
}
