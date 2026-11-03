// Read-only, Somnia mainnet. The maker-yield distributor's nonce and balances at its last payout and now,
// plus proof that the biggest paid maker is still making markets.
// Usage: node evidence/73/distributor_state.mjs
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
const c = createPublicClient({ transport: http("https://api.infra.mainnet.somnia.network", { timeout: 60000, retryCount: 2 }) });
const USDSO = "0x00000022dA000002656c64D9eA6011ea952D008A";
const DIST = "0xf1da6d99cf64c1ccf810c04cdcc844878d2510da", SAFE = "0xddc4f8a5664f91cda4abc13c80bbb8e4f2f6a280";
const MAKER = "0xd86a1425f51ea1e41767025626137f35d399ed88"; // largest YieldPayout payee 2026-10-09..12
const abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const head = await c.getBlockNumber();
for (const b of [437566459n, 437566460n, head]) {
  const blk = await c.getBlock({ blockNumber: b });
  const [bal, nonce, safeBal] = await Promise.all([
    c.readContract({ address: USDSO, abi, functionName: "balanceOf", args: [DIST], blockNumber: b }),
    c.getTransactionCount({ address: DIST, blockNumber: b }),
    c.readContract({ address: USDSO, abi, functionName: "balanceOf", args: [SAFE], blockNumber: b })]);
  console.log(`block ${b} ${new Date(Number(blk.timestamp) * 1000).toISOString()}: distributor nonce ${nonce}, USDso ${formatUnits(bal, 18)}; Safe 0xDDc4 USDso ${formatUnits(safeBal, 18)}`);
}
const q = `{ f: Fill(where:{maker:{_eq:"${MAKER}"}, blockNumber:{_gt:${Number(head) - 200000}}}, limit:3) { blockNumber timestamp market_id txHash } }`;
const r = await (await fetch("https://prd.smk.somnia.host/v1/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q }) })).json();
const f = r.data?.f ?? [];
console.log(`maker ${MAKER}: ${f.length ? "maker fills in the last ~5.5 h, e.g." : "no maker fills in the last ~5.5 h"}`);
for (const x of f) console.log(`  block ${x.blockNumber} ${new Date(Number(x.timestamp) * 1000).toISOString()} market ${x.market_id} tx ${x.txHash}`);
for (const s of ["SOMI:USDso", "WETH:USDso", "WBTC:USDso", "USDC.e:USDso"]) {
  const ob = await (await fetch(`https://api.dreamdex.io/v0/orderbooks?symbols=${encodeURIComponent(s)}`)).json();
  const o = Array.isArray(ob.orderbooks) ? ob.orderbooks[0] : (ob.orderbooks?.[s] ?? ob[s] ?? ob);
  console.log(`book ${s}: ${o?.bids?.length ?? "?"} bid levels (best ${o?.bids?.[0]?.price}), ${o?.asks?.length ?? "?"} ask levels (best ${o?.asks?.[0]?.price})`);
}
