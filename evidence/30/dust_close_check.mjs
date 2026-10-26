// Read-only (eth_call only, no transaction). Pins ONE block, reads each dust position and the
// pool's book parameters on chain, applies the SDK 0.32.1 previewPerpClosePnl `placeable` rule
// (dist/perp/margin.js:1976), then simulates placeOrder variants from the position owner and
// from a flat account. Usage: node dust_close_check.mjs [blockHex]   (default: chain head)
import { parseAbi, encodeFunctionData, decodeFunctionResult, decodeErrorResult } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const FLAT = "0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817";
const ZERO = "0x0000000000000000000000000000000000000000";
const reads = parseAbi([
  "function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))",
  "function getBookLevels(bool isBid, uint64 numLevels) view returns ((uint256 price, uint256 quantity)[])",
  "function tryGetMarkPrice() view returns (bool ok, uint256 price)",
  "function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))",
]);
const w = parseAbi(["function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) payable"]);
const errs = parseAbi(["error QuantityBelowMinimum(uint256 quantity, uint256 minimum)", "error QuantityBelowMinimum()"]);
let id = 0;
async function rpc(method, params) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  return r.json();
}
async function call(from, to, data, block) { return rpc("eth_call", [{ from, to, data }, block]); }
async function read(to, fn, args, block) {
  const data = encodeFunctionData({ abi: reads, functionName: fn, args });
  const j = await call(ZERO, to, data, block);
  if (j.error) throw new Error(fn + " " + JSON.stringify(j.error));
  return decodeFunctionResult({ abi: reads, functionName: fn, data: j.result });
}
function dec(errData) {
  if (!errData) return "no-data";
  try { const e = decodeErrorResult({ abi: errs, data: errData }); return `${e.errorName}(${e.args?.map(String).join(",") ?? ""})`; }
  catch { return "raw " + errData.slice(0, 74); }
}
const blk = process.argv[2] ?? (await rpc("eth_blockNumber", [])).result;
const b = (await rpc("eth_getBlockByNumber", [blk, false])).result;
const ts = BigInt(b.timestamp);
console.log(`run ${new Date().toISOString()} block ${blk} (${BigInt(blk)}) timestamp ${ts} (${new Date(Number(ts) * 1000).toISOString()})`);
const EXP = (ts + 3600n) * 1000000000n;
const flatCheck = {};
const CASES = [
  ["BTC", "0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0", "0x1cc7ecc3a7dba7760c7a47b926bd11b6211ed276"],
  ["BTC", "0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0", "0x9002b9c4958ef4b71675d7a33956f9f6913ff566"],
  ["ETH", "0xd6cb1dd58580b84d76068ac21594219ce03aeddf", "0x5ad3f981bc477868844f1c925a82c6c0f5a33817"],
  ["ETH", "0xd6cb1dd58580b84d76068ac21594219ce03aeddf", "0x879f00002e1ebf877da934a6332ca1bed907154f"],
  ["WLD", "0x0f464d57c1fd839e4d87a408bbccdab8f77e6394", "0x3391dc5839157e746c5f1756cc11e0765ad5ae62"],
];
for (const [sym, pool, acct] of CASES) {
  const book = await read(pool, "getOrderBookParameters", [], blk);
  const pos = await read(MB, "getPosition", [acct, pool], blk);
  const bids = await read(pool, "getBookLevels", [true, 1n], blk);
  const asks = await read(pool, "getBookLevels", [false, 1n], blk);
  const [, mark] = await read(pool, "tryGetMarkPrice", [], blk);
  if (!(pool in flatCheck)) flatCheck[pool] = (await read(MB, "getPosition", [FLAT, pool], blk)).size;
  const size = pos.size, abs = size < 0n ? -size : size;
  const lot = book.lotSize > 0n ? book.lotSize : 1n;
  // SDK 0.32.1 dist/perp/margin.js previewPerpClosePnl, full close (quantity omitted):
  const closedQuantity = (abs / lot) * lot;
  const remaining = size === 0n ? 0n : size - (size > 0n ? 1n : -1n) * closedQuantity;
  const placeable = closedQuantity >= book.minQuantity && closedQuantity > 0n;
  console.log(`\n== ${sym} pool ${pool} account ${acct}`);
  console.log(`   chain: size ${size} (${size > 0n ? "long" : "short"}), minQuantity ${book.minQuantity}, lotSize ${lot}, tick ${book.tickSize}, mark ${mark}, bestBid ${bids[0]?.price}/${bids[0]?.quantity}, bestAsk ${asks[0]?.price}/${asks[0]?.quantity}`);
  console.log(`   SDK previewPerpClosePnl port: closedQuantity ${closedQuantity}, fullClose ${size !== 0n && remaining === 0n}, placeable ${placeable}`);
  console.log(`   flat control ${FLAT}: size in this pool ${flatCheck[pool]}`);
  if (size === 0n) { console.log("   position is now flat, skipping"); continue; }
  const closeIsBid = size < 0n; // closing a short = buy
  const pxFor = (isBid) => (isBid ? asks[0].price : bids[0].price); // crossing price
  const variants = [
    ["owner  full close  IOC  q=|size|", acct, closeIsBid, abs, 2],
    ["owner  full close  LIMIT q=|size|", acct, closeIsBid, abs, 0],
    ["owner  full close  FOK  q=|size|", acct, closeIsBid, abs, 1],
    ...(abs - lot > 0n ? [["owner  partial     IOC  q=|size|-lot", acct, closeIsBid, abs - lot, 2]] : []),
    ["owner  close+flip  IOC  q=|size|+lot", acct, closeIsBid, abs + lot, 2],
    ["owner  close side  IOC  q=minQuantity", acct, closeIsBid, book.minQuantity, 2],
    ["owner  increase    IOC  q=|size|", acct, !closeIsBid, abs, 2],
    ["flat   same order  IOC  q=|size|", FLAT, closeIsBid, abs, 2],
  ];
  for (const [label, from, isBid, q, ot] of variants) {
    const px = pxFor(isBid);
    const data = encodeFunctionData({ abi: w, functionName: "placeOrder", args: [isBid, 0n, px, q, EXP, ot, 0, ZERO, 0n] });
    const j = await call(from, pool, data, blk);
    const out = j.error ? `REVERT ${dec(j.error.data)}` : `ACCEPTED ret=${(j.result ?? "").slice(0, 2 + 64 * 2)}`;
    console.log(`   ${label.padEnd(38)} ${isBid ? "buy " : "sell"} q=${q} px=${px}: ${out}`);
  }
}
