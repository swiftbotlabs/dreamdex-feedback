# scripts

Plain `viem` scripts (no SDK code is executed; ABIs are copied from the SDK's `readsAbi.ts` /
`tradeAbi.ts`). Install: `npm install --save-exact viem@2.57.7`, then `node scripts/<name>.mjs`.

- `survey.mjs` — every perp pool: order-book params, pool params, mark, voucher allowlist, system config (report 03).
- `voucher_check.mjs [address]` — the eligibility reads `getPerpVoucherEligibility` makes + `eth_call claim()` (reports 01, 02).
- `claim_from.mjs <address...>` — `eth_call claim()` from arbitrary senders with state (reports 01, 02).
- `errsel.mjs <contractErrorsAbi.ts> <selector...>` — selector -> error name from the SDK's error ABI (reports 02, 06).
- `sim_orders.mjs <contractErrorsAbi.ts> [from] [pool]` — simulated order rejections (report 06).
- `sim_cap.mjs` — position-cap cases (report 06).
- `mark_lag.mjs` — indexer mark vs chain mark for all markets (report 07).
- `indexer_timing.sh [account]` — MarginEvents query timings (report 04).
- `rpccap.mjs` — RPC capability probe (state overrides, eth_simulateV1).
- `encode_order.mjs <cmd> …` — calldata (from live pool params) for the real transactions: `wrongscale` (report 06), `perpbid` / `cancel` (reports 04, 07, 09), `spotsell`, `approve`, `deposit`. No key involved.
- `fee_floor_test.mjs` — `PRIVATE_KEY=0x… node scripts/fee_floor_test.mjs`: 0.6 gwei vs 6 gwei self-transfers (report 09). Throwaway testnet key only.
- `perp_gas_sample.mjs <pool...>` — what recent order senders on the perp pools paid (gas used × effective gas price), by sender (report 09).
