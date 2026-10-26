// Read-only: fetch receipts of trades that left a position below minQuantity and decode the
// MarginBank PositionUpdated logs for the account. Usage: node dust_origin_receipts.mjs
import { parseAbi, decodeEventLog } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const ev = parseAbi(["event PositionUpdated(address indexed account, address indexed perpPool, int128 newSize, uint128 avgEntryPrice, int256 realizedPnl, int256 entryFundingIndex)"]);
const post = async (method, params) => (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
const CASES = [
  ["WLD-PERP (min 26e18)", "0x143639eb810c340a9d041e6cdc6154065f2ddb1df242222e0a6e3fe5d579b6ec", "0x3391dc5839157e746c5f1756cc11e0765ad5ae62"],
  ["BTC-PERP (min 13000)", "0xfd97806156143b1b298d5ef551190bcff60d4cca506fe1a5738663956769ebc1", "0x2f92ab9455b49892ac77ca2fc6321fdf23e55590"],
];
console.log("run", new Date().toISOString());
for (const [label, tx, acct] of CASES) {
  const r = (await post("eth_getTransactionReceipt", [tx])).result;
  const b = (await post("eth_getBlockByNumber", [r.blockNumber, false])).result;
  console.log(`\n== ${label} tx ${tx} block ${BigInt(r.blockNumber)} (${new Date(Number(BigInt(b.timestamp)) * 1000).toISOString()}) status ${r.status} from ${r.from}`);
  for (const l of r.logs) {
    try {
      const d = decodeEventLog({ abi: ev, topics: l.topics, data: l.data });
      if (d.args.account.toLowerCase() !== acct) continue;
      console.log(`   PositionUpdated account ${d.args.account} pool ${d.args.perpPool} newSize ${d.args.newSize} realizedPnl ${d.args.realizedPnl}`);
    } catch {}
  }
}
