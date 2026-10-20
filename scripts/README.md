# scripts

Plain `viem` scripts (no SDK code is executed; ABIs are copied from the SDK's `readsAbi.ts` /
`tradeAbi.ts`). Install from the repo root with `npm ci` (pins viem 2.57.7 via `package-lock.json`), then `node scripts/<name>.mjs`.
Each script's header comment names the report(s) it reproduces and its exact command.

- `survey.mjs` — every perp pool: order-book params, pool params, mark, voucher allowlist, system config (report 03).
- `voucher_check.mjs [address]` — the eligibility reads `getPerpVoucherEligibility` makes + `eth_call claim()` (reports 01, 02).
- `claim_from.mjs <address...>` — `eth_call claim()` from arbitrary senders with state (reports 01, 02).
- `errsel.mjs <contractErrorsAbi.ts> <selector...>` — selector -> error name from the SDK's error ABI (reports 02, 06).
- `sim_orders.mjs <contractErrorsAbi.ts> [from] [pool]` — simulated orders, decoded: a paper-USDso-only account's accepted bids (report 03) and the documented order errors (report 06).
- `sim_cap.mjs` — position-cap cases (report 06).
- `mark_lag.mjs` — indexer mark vs chain mark for all markets (report 07, withdrawn 2026-10-20).
- `indexer_timing.sh [account]` — MarginEvents query timings by query shape (report 04).
- `indexer_accounts.sh <account...>` — per account: more than 100k MarginEvent rows?, and the SDK query's time and result (report 04).
- `margin_event_fields.sh` — the indexer's MarginEvent fields vs Fill / Order / LiquidationEvent, and blocks per timestamp (report 12).
- `rpccap.mjs` — RPC capability probe (state overrides, eth_simulateV1).
- `encode_order.mjs <cmd> …` — calldata (from live pool params) for the real transactions: `wrongscale` (the test order removed from report 06), `perpbid` / `cancel` (reports 04, 09; also withdrawn 07), `spotsell`, `approve`, `deposit`. No key involved.
- `fee_floor_test.mjs` — `PRIVATE_KEY=0x… node scripts/fee_floor_test.mjs`: 0.6 gwei vs 6 gwei self-transfers (report 09). Throwaway testnet key only.
- `perp_gas_sample.mjs <pool...>` — what recent order senders on the perp pools paid (gas used × effective gas price), by sender (report 09).
