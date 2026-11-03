# Lend (testnet): the dreamDEX Lend page uses a different SomniaLend pool from SomniaLend's own app and the SDK's `SOMNIA_TESTNET_LEND`, so positions don't carry over and USDso can't be supplied through the SDK
Severity: normal
Area: docs | SDK | app

> **Summary.** The Lend page says it runs "against the same on-chain pools as SomniaLend's own app", and that "a position opened here is visible in SomniaLend's own app, and vice versa". That holds on mainnet, but not on Shannon testnet (chain 50312). There, the dreamDEX testnet app reads and writes pool `0x5A44…2D09`. SomniaLend's own app, and the SDK's `SOMNIA_TESTNET_LEND` constant, use pool `0x7Cb9…8176`. These are two separate deployments with different reserves. dreamDEX's testnet USDso is a reserve only in the app's pool. Through the SDK constant, a USDso supply reverts with empty revert data, and every position opened on the dreamDEX Lend page reads as empty.
>
> **Checked 2026-11-03, 10:28–10:35 UTC**, read-only (no transactions). Evidence: `evidence/72/`.

## Steps to reproduce
```sh
node evidence/72/testnet_lend_pools.mjs 0xF06fC64627c7853Ca1DB2022661aa1c11D11Cd25 0x74E9aa912b384f4dd9f436db82E76AED352774c0
```
The script reads both testnet pools at the same block. It lists their reserves and runs `eth_call supply(USDso, 1)` against each. It also reads `getUserAccountData` for the accounts you pass. (Both accounts are suppliers in the app's pool; we picked them from the aUSDso holder list on the Shannon explorer.)

Then open https://app.testnet.dreamdex.io/lend and compare the reserves and the **Pool liquidity** column with the script's output. Click **Browse all markets on SomniaLend**.

## Expected
Docs, Trading → Lend:
- "Lend covers the full position lifecycle … against the same on-chain pools as SomniaLend's own app."
- "Lend is supported on both Somnia mainnet (chain ID `5031`) and Shannon testnet (`50312`), each against that network's own SomniaLend deployment."
- "Same pools as SomniaLend. … A position opened here is visible in SomniaLend's own app, and vice versa."
- Support → FAQ → Fees and gas, "Lend is separate": "Supplied assets sit in the SomniaLend contracts, not in a dreamDEX vault. It is the same pool you would reach at SomniaLend directly."

SDK `docs/LEND.md` (0.32.1): `SOMNIA_TESTNET_LEND` is "extracted from the official app's testnet mode (app.somnialend.finance)", and the guide's use case is "supply USDso between sessions".

## Actual
| | dreamDEX testnet app | SDK `SOMNIA_TESTNET_LEND` and SomniaLend's app |
|---|---|---|
| Pool / provider | `0x5A44488FBC0BC2296359b3decE3049Ab96aB2D09` / `0xA052…F251` | `0x7Cb9df1bc191B16BeFF9fdEC2cd1ef91Cac18176` / `0xEbf5…28f1` |
| Reserves | WSTT, WETH `0x4d8E…D7b0`, **USDso `0x9c32…b171`**, WBTC `0x4e85…f384` | WSTT, USDC `0xE9CC…5e38`, WETH `0xd248…8452`, NIA, AQT, MISOT |
| `supply(USDso, 1e18)` (eth_call) | gets past the reserve checks, then fails on allowance (`0xfb8f41b2`, `ERC20InsufficientAllowance`), as any first supply would | **reverts with data `0x`**: USDso isn't listed there (`getReserveData(USDso)` is all zeros) |
| `0xF06f…Cd25` | $676.54 collateral, $569.82 debt, health factor **1.009** | $0 / $0, no position |
| `0x74E9…74c0` | $159.06 collateral, $3.78 debt, HF 35.8 | $1.19 collateral, $0.53 debt, HF 1.84: a different position |

(Shannon block 531,277,390, 2026-11-03 10:35:08 UTC.)

- The app's per-chain Lend map (chunk `3vmw5t3leotm9.js`, served by `app.testnet.dreamdex.io`, deployment `dpl_6kazR8bU…`) uses the SDK's `SOMNIA_MAINNET_LEND` for chain 5031. For chain 50312 it replaces `addresses.lend` with the `0x5A44…` set.
- SomniaLend's app (`app.somnialend.finance`) knows exactly two markets: mainnet `0xEC67…0168` and testnet `0x7Cb9…8176`. `0x5A44…` doesn't appear in any of its 20 build-manifest chunks. So the page's **Browse all markets on SomniaLend** link (`app.somnialend.finance/markets/`) opens a testnet market without the user's dreamDEX positions, and without USDso or this WBTC.
- The rendered testnet Lend page shows 4 reserves with pool liquidity of 1,544.62 STT, 2.00 WETH and 479.31 USDso. That is the `0x5A44…` pool to the cent (`evidence/72/app_testnet_lend_page_2026-11-03T1032Z.png`).
- Mainnet is consistent: the app, `SOMNIA_MAINNET_LEND` and SomniaLend's app all use `0xEC67…0168`.

**The testnet indexer follows the other pool too.** The testnet app reads Lend history (`LendAction`, `LendLiquidation`, `LendRateUpdate`) from `https://dev.smk.somnia.host/v1/graphql`. That indexer tracks pool `0x7Cb9…`, not the app's `0x5A44…` (`evidence/72/testnet_indexer_lend_rows_2026-11-03T1038Z.txt`):
- `LendRateUpdate` has rows for one reserve only, WSTT. Its newest `LendAction` is a WITHDRAW through SomniaLend's gateway `0x29ed…3f19` at 2026-10-23 14:49:50 UTC. That is exactly the last update of `0x7Cb9`'s WSTT reserve on chain.
- The app's pool was active later: USDso on 2026-10-27 22:42 UTC, WSTT on 2026-10-28 09:49 UTC (`testnet_pools_last_update_2026-11-03T1037Z.txt`). None of it is indexed. There are 0 `LendAction` rows for USDso `0x9c32…`, and 0 for `0xF06f…`, which holds 676 USDso in the app's pool.
- `0x74E9…`'s two indexed rows (SUPPLY 6.986 WSTT, BORROW 3.099 WSTT, both through `0x29ed…`) are its position in `0x7Cb9…`, not the one the dreamDEX page shows.

So the **All-time earnings** card can't be correct on testnet for anyone using the page. By the page's own code (chunk `237baddg7fuct.js`), it compares the supplied balance with the indexed flows. With no flows, that check fails, and the card falls back to "—", the state the docs reserve for loading or for "tokens moved … by means the pool does not record". We read this from the code. We didn't observe it on an account, because our test account has no testnet Lend position.

## Evidence
- `evidence/72/testnet_lend_pools.mjs`, output `testnet_lend_pools_2026-11-03T1035Z.txt`
- `evidence/72/app_and_somnialend_lend_addresses_2026-11-03T1030Z.txt`: the address sets quoted from the dreamDEX testnet chunk, SomniaLend's app chunk and SDK 0.32.1 `dist/lend/client.js`
- `evidence/72/app_testnet_lend_page_2026-11-03T1032Z.png` and `.txt`: the testnet Lend page and its links
- `evidence/72/testnet_indexer_lend_rows.sh`, output `testnet_indexer_lend_rows_2026-11-03T1038Z.txt`; `testnet_pools_last_update_2026-11-03T1037Z.txt` (each reserve's `lastUpdateTimestamp` in both pools)

## Why it matters
A bot built from the SDK's Lend guide on testnet follows the guide exactly and still fails. It can't supply the venue's own quote token, and the revert is empty, so there is no reason to debug. It also can't see what the same wallet holds on the dreamDEX Lend page, so a bot that checks health factors reads "no debt" for an account at 1.009 (the `0xF06f…` row). A user who follows the docs' "visible in SomniaLend's own app" to manage a testnet position there won't find it.

## Suggested fix
Pick one testnet deployment and use it in the app, the SDK constant, the testnet indexer and SomniaLend's app. Or, if the separate pool is intended, export it from the SDK (for example `DREAMDEX_TESTNET_LEND`), and change the docs to say that testnet Lend uses a dreamDEX-specific SomniaLend pool that SomniaLend's app does not list. On testnet, hide the "Browse all markets on SomniaLend" link or point it somewhere that shows this pool.

## Environment
- Somnia Shannon testnet (chain 50312), RPC `https://api.infra.testnet.somnia.network`; mainnet compared read-only
- App `https://app.testnet.dreamdex.io` (deployment `dpl_6kazR8bUm5vCrftsg7B6q1mEuRT1`); SomniaLend app `https://app.somnialend.finance`; `@somnia-chain/markets-sdk` 0.32.1 (npm `latest`); viem 2.57.7
