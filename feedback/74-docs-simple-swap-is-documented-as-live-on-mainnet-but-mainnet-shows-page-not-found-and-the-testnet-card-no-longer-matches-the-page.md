# Docs: Simple Swap is documented as live on mainnet, but mainnet shows "Page not found", and the testnet card no longer matches the page (Limit tab works, no settings sheet, `/simple/debug` faucet gone, Events venue undocumented)
Severity: normal
Area: docs | app

> **Summary.** Trading → Spot → Simple Swap says: "Simple Swap is **live on Somnia mainnet** (chain ID `5031`) and testnet (chain ID `50312`)." On mainnet, `app.dreamdex.io/simple` renders **Page not found**. The page is gated by the `simple-mode` feature flag, and that flag isn't in the mainnet flag set at all. On testnet the card exists, but four of the page's claims are out of date. The Limit tab is a limit-order form, not "Coming soon". There is no gear or settings sheet: slippage is fixed at 0.5% and there's no deadline setting. The `/simple/debug` test-token faucet returns 404. And the card's **Events** venue (Up/Down on BTC and ETH, 1m to Daily) isn't mentioned.
>
> **Checked 2026-11-03, 10:54–11:00 UTC**, read-only: mainnet logged out, testnet signed in as our test account. No order or swap was placed. Evidence: `evidence/74/`.

## Steps to reproduce
1. Open https://app.dreamdex.io/simple: you get "Page not found". There is no Simple Swap entry in the nav either: the **Trade** menu lists only Spot and Perps (`/preregister`).
2. Open https://app.testnet.dreamdex.io/simple while signed in. Click **Limit**, then **Events**.
3. Open https://app.testnet.dreamdex.io/simple/debug: HTTP 404.

## Expected (docs, Trading → Spot → Simple Swap)
- "Simple Swap is **live on Somnia mainnet** (chain ID `5031`) and testnet (chain ID `50312`). Open it from the Simple Swap card in the dreamDEX app."
- "On chain `50312`, … mint test tokens (USDso / WETH / WBTC) from the in-app faucet at `/simple/debug`."
- "Click the **gear icon** at the top-right of the card to open the settings sheet", with slippage presets 0.10% / 0.50% (default) / 1.0% / Custom (≤ 50%, warning above 5%), and deadline presets 5 m / 10 m / 30 m (default) / Custom.
- "**Limit tab disabled.** The Simple Swap card renders a Limit tab as 'Coming soon' — the router is taker-only by design."

## Actual
| Claim | What the app does |
|---|---|
| Live on mainnet | `app.dreamdex.io/simple` renders "Page not found" (`mainnet_simple_page_not_found_2026-11-03T1054Z.png`). The route is gated on the `simple-mode` flag (default `dev-only`). The mainnet flag response has 23 flags and no `simple-mode`. The testnet response has 43, including `simple-mode=true`. |
| `/simple/debug` faucet | Not in the app's route list (`/simple` and `/simple-b` only). `app.testnet.dreamdex.io/simple/debug` returns HTTP 404. |
| Gear icon, slippage and deadline settings | The card has no gear. Its only slippage text is a static "0.5% slippage tolerance" line, and in the code that value is a constant (`0.005`). There is no deadline control on the card. (The header gear opens the account panel.) |
| Limit tab "Coming soon" | **Limit** opens a limit form: a "Limit price, USDso per STT" field with a **Mid** button, and the note "Only rests as a maker. Rejected if any of it would fill immediately." (`testnet_simple_limit_tab_2026-11-03T1057Z.png`) |
| (not mentioned) | A **Spot / Events** switch. Events sells BTC or ETH Up/Down contracts for tUSDC, with durations 1m (BTC only), 5m, 15m, 1h, 4h and Daily (`testnet_simple_events_venue_2026-11-03T1057Z.png`). |

## Evidence
- `evidence/74/simple_swap_checks_2026-11-03T1100Z.txt`: HTTP status of the four URLs; the flag names returned on each network; the app's route list; the flag definition and surface gate; the card's slippage constant; the Limit tab copy
- Screenshots: `mainnet_simple_page_not_found_2026-11-03T1054Z.png`, `mainnet_trade_menu_2026-11-03T1101Z.png` (the Trade menu open), `testnet_simple_market_tab_2026-11-03T1055Z.png`, `testnet_simple_limit_tab_2026-11-03T1057Z.png`, `testnet_simple_events_venue_2026-11-03T1057Z.png`

## Why it matters
The docs send mainnet users and aggregator integrators to a consumer surface that doesn't exist there. On testnet, the page tells users to set a slippage and deadline they can't change, says limits are impossible when the tab places resting orders, and points to a faucet that 404s. That last one is the one testnet step a new user needs.

## Suggested fix
Say that Simple Swap is testnet-only for now (or turn `simple-mode` on for mainnet). Replace the settings section with "fixed 0.5% slippage", or ship the sheet. Document the Limit tab as post-only (ALO). Add the Events venue. Point the faucet line at a working faucet.

## Environment
App `https://app.dreamdex.io` (deployment `dpl_822sE9mQ3NfGnHbKcFyMvMvnWPGc`) and `https://app.testnet.dreamdex.io` (deployment `dpl_6kazR8bUm5vCrftsg7B6q1mEuRT1`), Chrome 1400 × 1000.
