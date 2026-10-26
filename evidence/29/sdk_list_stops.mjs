// Read-only. Sends the SDK 0.32.1 `listPerpStopOrders` query document (copied as text from dist/perp/stops.js)
// with the `where` that `listPerpStopOrders({ account, pool, status })` builds for a perp pool
// (market_id = pool, owner, status _in). Prints what an SDK caller gets back for one owner, plus the owner's position.
// usage: node sdk_list_stops.mjs <pool> <owner> [statuses comma-separated, default PENDING,TRIGGERED,TRIGGER_FAILED,CANCELLED]
import { createPublicClient, http, parseAbi, defineChain, formatUnits } from "viem";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const IDX = "https://hideki-dev.smk.somnia.host/v1/graphql";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000, retryCount: 2 }) });
const MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
const bank = parseAbi(["function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))"]);
const poolAbi = parseAbi(["function tryGetMarkPrice() view returns (bool ok, uint256 price)"]);
const PerpStopOrdersQuery = `
  query PerpStopOrders($where: StopOrder_bool_exp!, $limit: Int, $offset: Int) {
    _sdkWatermark: chain_metadata { chain_id latest_processed_block }
    StopOrder(where: $where, order_by: [{ createdAt: desc }, { id: desc }], limit: $limit, offset: $offset) {
      id
      registry
      orderIdRaw
      owner
      isBid
      quantity
      triggerPrice
      triggerOperator
      orderType
      builder
      builderFeeBpsTimes1k
      status
      placedOrderId
      dropReason
      siblingOrderId
      intent
      cancelReason
      createdAt
      updatedAt
      txHash
      market {
        poolAddress
        baseSymbol
        quoteSymbol
        baseDecimals
        quoteDecimals
      }
    }
  }
`;
const [pool, owner, st] = process.argv.slice(2);
const statuses = (st || "PENDING,TRIGGERED,TRIGGER_FAILED,CANCELLED").split(",");
const where = { market_id: { _eq: pool.toLowerCase() }, owner: { _eq: owner.toLowerCase() }, status: { _in: statuses } };
const r = await fetch(IDX, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: PerpStopOrdersQuery, variables: { where, limit: 200, offset: 0 } }) });
const j = await r.json();
const head = await c.getBlock();
const [pos, mark] = await Promise.all([
  c.readContract({ address: MB, abi: bank, functionName: "getPosition", args: [owner, pool], blockNumber: head.number }),
  c.readContract({ address: pool, abi: poolAbi, functionName: "tryGetMarkPrice", blockNumber: head.number })]);
const rows = j.data?.StopOrder ?? [];
const bd = rows[0]?.market?.baseDecimals ?? 9;
console.log(JSON.stringify({
  headBlock: String(head.number), headTimeUTC: new Date(Number(head.timestamp) * 1000).toISOString(),
  indexer: j.data?._sdkWatermark, where, errors: j.errors,
  positionNow: formatUnits(pos.size, bd), markNow: formatUnits(mark[1], 18),
  rows: rows.map((o) => ({ orderIdRaw: o.orderIdRaw, status: o.status, cancelReason: o.cancelReason, dropReason: o.dropReason, placedOrderId: o.placedOrderId,
    isBid: o.isBid, triggerOperator: o.triggerOperator, triggerPrice: formatUnits(BigInt(o.triggerPrice), 18), quantity: formatUnits(BigInt(o.quantity), bd),
    siblingOrderId: o.siblingOrderId, createdAtUTC: new Date(Number(o.createdAt) * 1000).toISOString(), updatedAtUTC: new Date(Number(o.updatedAt) * 1000).toISOString(),
    fieldNames: Object.keys(o).join(",") })),
}, null, 1));
