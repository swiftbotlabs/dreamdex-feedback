# App: the Markets page says Lend "lend[s] collateral to the venue and earn[s] the borrow rate". Lend supplies to SomniaLend, not the venue, and suppliers earn the supply rate, which on mainnet is 1% to 54% of the borrow rate
Severity: normal
Area: app

> **Summary.** The mainnet Markets page (`/explore`) links to Lend from its "Elsewhere" card with the line "**lend collateral to the venue and earn the borrow rate.**" Both halves contradict the Lend docs and the chain. Lend supplies wallet assets to SomniaLend, a third-party pool ("not a separate vault", "Lend is separate, and it is not your trading margin"), not collateral to dreamDEX. Suppliers earn the pool's **supply** rate. That rate is the borrow rate times utilisation, less the reserve factor (10% on every mainnet reserve), so it is always lower. Right now it's 0.83% against 2.04% for USDso, 0.21% against 2.64% for WETH, and 0.0013% against 0.15% for SOMI.
>
> **Checked 2026-11-03, 11:22–11:24 UTC**, logged out, read-only. Evidence: `evidence/76/`.

## Steps to reproduce
1. Open https://app.dreamdex.io/explore and read the **lend** row under "Elsewhere".
2. `node evidence/76/lend_rates_mainnet.mjs`: supply and borrow APY for every mainnet SomniaLend reserve, from the same `UiPoolDataProviderV3.getReservesData` read the Lend page makes.

## Expected
Copy consistent with Trading → Lend: "Lend lets you supply spot assets into SomniaLend … Supplied assets earn a variable yield from lending-market activity." It should also be consistent with the FAQ: "It uses your smart wallet balance, not your trading margin." For example, "supply idle assets to SomniaLend and earn the supply rate".

## Actual
| Reserve | Supply APY | Borrow APY | Supply as a share of borrow |
|---|---|---|---|
| USDC.e | 3.5020% | 6.5095% | 53.8% |
| USDso | 0.8284% | 2.0389% | 40.6% |
| WETH | 0.2123% | 2.6377% | 8.1% |
| WSOMI | 0.0013% | 0.1514% | 0.9% |
| WBTC | 0% | 0% | — |

(Somnia mainnet block 455,505,841, 2026-11-03 11:24:14 UTC.) The Lend page shows these supply rates in its **Supply assets** APY column (USDC.e 3.50%, WETH 0.21%, USDso 0.83%, SOMI and WBTC 0.00%, rendered at 11:29 UTC: `mainnet_lend_page_supply_table_2026-11-03T1129Z.txt`). So the Markets page promises a rate that the Lend page itself doesn't offer.

## Evidence
- `evidence/76/explore_lend_copy_2026-11-03T1124Z.txt`: the link and text as served in the page HTML
- `evidence/76/mainnet_explore_page_2026-11-03T1123Z.png`
- `evidence/76/lend_rates_mainnet.mjs`, output `lend_rates_mainnet_2026-11-03T1124Z.txt`
- `evidence/76/mainnet_lend_page_supply_table_2026-11-03T1129Z.txt`: the Lend page's own Supply assets table

## Why it matters
"Earn the borrow rate" overstates the yield by about 2× (USDC.e) to over 100× (SOMI) on today's reserves. "Lend collateral to the venue" suggests that Lend uses or backs trading collateral at dreamDEX, which the FAQ explicitly says it doesn't. It's a money claim, on the app's own overview of what it offers.

## Suggested fix
Reword to something like "supply idle assets to SomniaLend and earn the supply rate", or show the live supply APY.

## Environment
`https://app.dreamdex.io/explore` (deployment `dpl_822sE9mQ3NfGnHbKcFyMvMvnWPGc`), logged out; Somnia mainnet RPC `https://api.infra.mainnet.somnia.network`; viem 2.57.7.
