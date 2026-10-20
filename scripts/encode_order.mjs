// Calldata for the real transactions in reports 01, 04-07 and 09 (send it with any wallet; no key here).
// Print calldata for one action against live Hideki params (no key involved).
// node scripts/encode_order.mjs wrongscale <pool>            -> placeOrder bid, qty 0.001e18 (wrong scale), price mark*0.9
// node scripts/encode_order.mjs perpbid <pool> <pct-below>  -> PostOnly bid, minQuantity, price mark*(1-pct/100)
// node scripts/encode_order.mjs cancel <orderId>
// node scripts/encode_order.mjs spotsell <qtyWei> <pct-below-bestbid>   -> IOC sell of native STT on STT:USDso
// node scripts/encode_order.mjs approve <spender> <amountWei> | deposit <amountWei>
// Prints calldata only; it never signs or sends.
import { createPublicClient, http, defineChain, encodeFunctionData, parseAbi, parseUnits } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) });
const ZERO = "0x0000000000000000000000000000000000000000";
const SPOT = "0xbe6c45bf96e1b4e5ec4655bdae0f23c0410db35d";
const abi = parseAbi([
  "function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k)",
  "function cancelOrder(uint128 orderId)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function deposit(uint256 amount)",
  "function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))",
  "function tryGetMarkPrice() view returns (bool ok, uint256 price)",
  "function getBookLevels(bool isBid, uint64 numLevels) view returns ((uint256 price, uint256 quantity)[])",
]);
const far = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 3600) * 1_000_000_000n;
const [cmd, a1, a2] = process.argv.slice(2);
const down = (v, g) => (v / g) * g;
let out;
if (cmd === "wrongscale" || cmd === "perpbid") {
  const [obp, mark] = await Promise.all([c.readContract({ address: a1, abi, functionName: "getOrderBookParameters" }), c.readContract({ address: a1, abi, functionName: "tryGetMarkPrice" })]);
  const pct = cmd === "perpbid" ? BigInt(a2 ?? "10") : 10n;
  const price = down(mark[1] * (100n - pct) / 100n, obp.tickSize);
  const qty = cmd === "wrongscale" ? parseUnits("0.001", 18) : obp.minQuantity;
  const type = cmd === "wrongscale" ? 0 : 3; // 0 = GTC limit, 3 = PostOnly
  out = { to: a1, price: price.toString(), qty: qty.toString(), mark: mark[1].toString(), tick: obp.tickSize.toString(), min: obp.minQuantity.toString(), data: encodeFunctionData({ abi, functionName: "placeOrder", args: [true, 0n, price, qty, far, type, 0, ZERO, 0n] }) };
} else if (cmd === "spotsell") {
  const [obp, bids] = await Promise.all([c.readContract({ address: SPOT, abi, functionName: "getOrderBookParameters" }), c.readContract({ address: SPOT, abi, functionName: "getBookLevels", args: [true, 5n] })]);
  const qty = down(BigInt(a1), obp.lotSize);
  const price = down(bids[0].price * (100n - BigInt(a2 ?? "2")) / 100n, obp.tickSize);
  out = { to: SPOT, value: qty.toString(), price: price.toString(), bestBid: bids[0].price.toString(), bids: bids.map(b => [b.price.toString(), b.quantity.toString()]), data: encodeFunctionData({ abi, functionName: "placeOrder", args: [false, 0n, price, qty, far, 2, 0, ZERO, 0n] }) };
} else if (cmd === "cancel") {
  out = { data: encodeFunctionData({ abi, functionName: "cancelOrder", args: [BigInt(a1)] }) };
} else if (cmd === "approve") {
  out = { to: "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72", data: encodeFunctionData({ abi, functionName: "approve", args: [a1, BigInt(a2)] }) };
} else if (cmd === "deposit") {
  out = { to: "0x478769E1177C0773c43A593DCCc4Ad15F15F1394", data: encodeFunctionData({ abi, functionName: "deposit", args: [BigInt(a1)] }) };
} else { console.error("unknown cmd"); process.exit(2); }
console.log(JSON.stringify(out));
