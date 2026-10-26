// Read-only: plain eth_call / eth_getStorageAt, no keys, no state overrides, nothing signed.
// Usage: SDK_ERRORS_ABI=<markets-sdk 0.32.1>/package/src/contractErrorsAbi.ts node amend_side_flip.mjs [block|latest] [ETH,BTC,SOL|all]
import { createPublicClient, http, defineChain, parseAbi, parseAbiItem, encodeFunctionData, decodeErrorResult, keccak256, toHex } from "viem";
import { readFileSync } from "node:fs";

const RPC = "https://api.hideki2.infra.testnet.somnia.network"; // from live docs, perps-testnet page
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000, retryCount: 2 }) });
const FACTORY = "0xE631fAEE547baeE07353E290f0562ea67d856560"; // PerpPoolFactory, live docs
const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50"; // EIP-1967 beacon slot

// ABIs copied from SDK 0.32.1 src/readsAbi.ts + src/tradeAbi.ts (read as text)
const ORDER_T = "(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k)";
const abi = parseAbi([
  "function getPerpPools() view returns (address[])",
  "function getBaseTokenForPool(address perpPool) view returns (address)",
  "function symbol() view returns (string)",
  "function implementation() view returns (address)",
  "function getAllOpenOrdersOffChain(bool isBid, uint256 maxCount, uint64 startCursor) view returns ((uint128 orderId, bool isBid, address owner, uint64 userData, uint256 price, uint256 fullQuantity, uint256 quantityRemaining, uint64 expireTimestampNs)[] orders, bool hasMoreOrders, uint64 nextCursor)",
  "function getBookLevels(bool isBid, uint64 numLevels) view returns ((uint256 price, uint256 quantity)[])",
  "function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))",
  `function amendOrder((uint128 oldOrderId, bool alwaysPlace, ${ORDER_T} newOrder) request) returns (uint128 newOrderId)`,
  `function amendOrders((uint128 oldOrderId, bool alwaysPlace, ${ORDER_T} newOrder)[] requests) returns (uint128[] newOrderIds)`,
]);

// SDK revert table, parsed by my own regex from the 0.32.1 tarball text (never executed)
const src = readFileSync(process.env.SDK_ERRORS_ABI ?? "sdk/package/src/contractErrorsAbi.ts", "utf8");
const errs = [...src.matchAll(/\{\s*type:\s*"error",\s*name:\s*"(\w+)",\s*inputs:\s*\[(.*?)\]\s*\}/gs)].map((m) => `error ${m[1]}(${[...m[2].matchAll(/type:\s*"([\w\[\]]+)"/g)].map((x) => x[1]).join(",")})`);
const sdkAbi = []; let bad = 0; for (const s of errs) { try { sdkAbi.push(parseAbiItem(s)); } catch { bad++; } }
const tupleWarn = /type:\s*"tuple/.test(src) ? " (note: table has tuple-typed inputs; approximated)" : "";
const sdkDecode = (d) => { if (!d || d === "0x") return "empty revert data"; try { const r = decodeErrorResult({ abi: sdkAbi, data: d }); return `SDK decodes: ${r.errorName}(${(r.args ?? []).join(",")})`; } catch (e) { return `SDK table has NO match for selector ${d.slice(0, 10)} (${e.name})`; } };

const SEL = keccak256(toHex("AmendSideMismatch(uint128)")).slice(0, 10);
console.log(`run at ${new Date().toISOString()} | SDK errors parsed ${sdkAbi.length}/${errs.length} (unparsed ${bad})${tupleWarn} | keccak("AmendSideMismatch(uint128)")[:4] = ${SEL} | selector string in SDK src: ${src.includes(SEL.slice(2)) || src.includes("AmendSideMismatch")}`);

const tag = process.argv[2] ?? "latest";
const block = tag === "latest" ? await c.getBlockNumber() : BigInt(tag);
const bh = toHex(block);
const blk = await c.getBlock({ blockNumber: block });
const now = blk.timestamp;
console.log(`block ${block} ts ${new Date(Number(now) * 1000).toISOString()}`);

const pools = await c.readContract({ address: FACTORY, abi, functionName: "getPerpPools", blockNumber: block });
const want = (process.argv[3] ?? "ETH,BTC,SOL").split(",");

const rawErr = (e) => { let d = e; for (let i = 0; i < 8 && d; i++) { if (typeof d.data === "string" && d.data.startsWith("0x")) return d.data; if (typeof d.data?.data === "string") return d.data.data; d = d.cause; } return undefined; };
async function sim(from, to, data) {
  try { const r = await c.request({ method: "eth_call", params: [{ from, to, data, gas: "0x1c9c380" }, bh] }); return { ok: true, ret: r }; }
  catch (e) { return { ok: false, data: rawErr(e), msg: (e.details || e.shortMessage || "").slice(0, 120) }; }
}
const show = (r, oid) => {
  if (r.ok) return `OK returns ${r.ret.length > 66 ? r.ret.slice(0, 66) + "…" : BigInt(r.ret)}`;
  const argHex = r.data && r.data.length >= 74 ? BigInt("0x" + r.data.slice(10, 74)) : null;
  return `REVERT raw=${r.data ?? "none (" + r.msg + ")"}${r.data?.startsWith(SEL) ? ` => ${SEL}=AmendSideMismatch, arg=${argHex}${oid !== undefined ? (argHex === oid ? " (== oldOrderId)" : " (!= oldOrderId)") : ""}` : ""} | ${sdkDecode(r.data)}`;
};

let n = 0;
for (const pool of pools) {
  let sym = "?";
  try { const bt = await c.readContract({ address: FACTORY, abi, functionName: "getBaseTokenForPool", args: [pool], blockNumber: block }); sym = await c.readContract({ address: bt, abi, functionName: "symbol", blockNumber: block }); } catch {}
  if (!want.includes("all") && !want.some((w) => sym.toUpperCase().startsWith(w))) continue;
  const beacon = "0x" + (await c.getStorageAt({ address: pool, slot: BEACON_SLOT, blockNumber: block })).slice(-40);
  let impl = "?"; try { impl = await c.readContract({ address: beacon, abi, functionName: "implementation", blockNumber: block }); } catch {}
  const { tickSize } = await c.readContract({ address: pool, abi, functionName: "getOrderBookParameters", blockNumber: block });
  const [bids] = await c.readContract({ address: pool, abi, functionName: "getAllOpenOrdersOffChain", args: [true, 50n, 0n], blockNumber: block });
  const [asks] = await c.readContract({ address: pool, abi, functionName: "getAllOpenOrdersOffChain", args: [false, 50n, 0n], blockNumber: block });
  const bestAsk = (await c.readContract({ address: pool, abi, functionName: "getBookLevels", args: [false, 1n], blockNumber: block }))[0]?.price;
  console.log(`\n== ${sym} pool ${pool} beacon ${beacon} impl ${impl} tick ${tickSize} bids ${bids.length} asks ${asks.length} bestAsk ${bestAsk}`);
  const far = (now + 7200n) * 1_000_000_000n;
  const mk = (isBid, price, qty, orderType = 0) => ({ isBid, userData: 0n, price, quantity: qty, expireTimestampNs: far, orderType, selfMatchingOption: 0, builder: "0x0000000000000000000000000000000000000000", builderFeeBpsTimes1k: 0n });
  // one bid and one ask, live (not expired)
  const live = (o) => o.expireTimestampNs === 0n || o.expireTimestampNs > now * 1_000_000_000n;
  const b = bids.find(live); const a = asks.find(live);
  for (const [o, label] of [[b, "BID"], [a, "ASK"]]) {
    if (!o) { console.log(`  no live ${label}`); continue; }
    const q = o.quantityRemaining;
    const sameSidePx = o.isBid ? o.price - 10n * tickSize : o.price + 10n * tickSize; // moves away from the touch: rests
    const flipFarPx = o.isBid ? (bestAsk ?? o.price) + 200n * tickSize : (o.price > 200n * tickSize ? o.price - 200n * tickSize : tickSize); // flipped AND far: a bid->ask far above best ask (cannot cross)
    console.log(`  ${label} orderId ${o.orderId} (hex 0x${o.orderId.toString(16)}) owner ${o.owner} price ${o.price} qty ${q}`);
    const cases = [
      ["control: same side, 10 ticks away, GTC", mk(o.isBid, sameSidePx, q)],
      ["flip side, same price/size, GTC", mk(!o.isBid, o.price, q)],
      ["flip side, far non-crossing price, GTC", mk(!o.isBid, flipFarPx, q)],
      ["flip side, far price, PostOnly", mk(!o.isBid, flipFarPx, q, 3)],
    ];
    for (const [lab, newOrder] of cases) {
      const r = await sim(o.owner, pool, encodeFunctionData({ abi, functionName: "amendOrder", args: [{ oldOrderId: o.orderId, alwaysPlace: false, newOrder }] }));
      console.log(`    amendOrder  ${lab.padEnd(42)} ${show(r, o.orderId)}`);
    }
    const rb = await sim(o.owner, pool, encodeFunctionData({ abi, functionName: "amendOrders", args: [[{ oldOrderId: o.orderId, alwaysPlace: false, newOrder: mk(!o.isBid, o.price, q) }]] }));
    console.log(`    amendOrders [flip side, same price/size]                  ${show(rb, o.orderId)}`);
    const rb2 = await sim(o.owner, pool, encodeFunctionData({ abi, functionName: "amendOrders", args: [[{ oldOrderId: o.orderId, alwaysPlace: false, newOrder: mk(o.isBid, sameSidePx, q) }]] }));
    console.log(`    amendOrders [control: same side]                          ${show(rb2, o.orderId)}`);
  }
  n++;
}
console.log(`\npools checked: ${n} of ${pools.length}`);
