# REST API: market buys are prepared at a near-infinite price, so a perp market buy reverts with Panic(0x11) unless it only reduces a short, and a vault-funded spot market buy reverts InsufficientBalance on mainnet
Severity: major
Area: API

> **Summary.** `POST /v0/markets/{symbol}/orders` with `type: market, side: buy` answers `200` and a ready-to-sign transaction, but for `fundingSource: marginBank` and `vault` it
> sets the limit price to `floor((2^256 - 1) / quantity)`, rounded to the tick. The pools cannot process that price. On **perps**, 82 of 90 simulated accounts fail with `Panic(0x11)` (arithmetic overflow),
> including every flat and long account. The API can't open a perp long at market. The same size at best-ask + 5% succeeds for those accounts. The only market buys that worked are 5 that reduce a short.
> On **mainnet spot**, a vault-funded market buy fails with `InsufficientBalance(have, need)`, where `need` has 60 to 70 digits, from accounts holding over 100,000 USDso in the vault, for a 30 USDso order. Wallet-funded market
> buys are fine because they are priced at best ask + `slippageBps`. The route is documented as supporting both.
>
> **Checked 2026-11-01, 11:57–12:12 UTC.** The API was used with a fresh throwaway wallet, and nothing was sent through it. Prepared transactions were simulated with `eth_call` from accounts that hold live positions or
> vault balances. One real transaction was sent on Tokyo from our own test wallet: `0x3f660c19…bda27`, status `reverted`. Evidence: `evidence/64/`.

## Steps to reproduce
1. Sign in with SIWE on `https://api.testnet.dreamdex.io/v0` (any fresh wallet) and prepare a perp market buy:
   ```sh
   curl -s -X POST "$API/markets/WETH:USDso/orders?kind=perp" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
     -d '{"type":"market","side":"buy","amount":"0.01","fundingSource":"marginBank"}'
   ```
   It answers `200`. Decode `data`: `placeOrder(true, 0, 11579208923731619542357098500868790785326998460000000000000000, 10000000000000000, …, 2 /*IOC*/, …)`. That price word is `floor((2^256-1)/1e16)`, cut to the 0.01 tick.
2. Simulate it with `eth_call`, `from` = any account with collateral. The result is `Panic(0x11)`. Or run the whole matrix:
   ```sh
   npm install && cd evidence/64 && node rest_perp_market_order_matrix.mjs      # signs in, prepares, simulates, sends nothing
   ```
3. Spot, on mainnet, the same way:
   ```sh
   node rest_vault_market_buy.mjs      # read-only: prepared vault market buy vs vault IOC limit buy at best ask + 5%
   ```
4. To see the pool's own behaviour on the bounty network, send the same price shape to the Tokyo ETH-PERP pool: `PRIVATE_KEY=… node tokyo_market_buy_price_tx.mjs 0xd6cb1dd58580b84d76068ac21594219ce03aeddf 4000000000000000 10000000000000000 --go`

## Expected
- OpenAPI, `POST /v0/markets/{symbol}/orders`: "The same route places orders on both market kinds", and "Supports both market orders (immediate execution at best price) and limit orders".
- Docs, HTTP API → Vault: "Vault-funded orders support all order types including resting limit orders."
- The prepared transaction should do what it says, as the wallet-funded path does ("priced off the live best ask plus `slippageBps`").

## Actual
**Perps** (Shannon REST host, WETH, SOL and ADA, 30 most recent accounts each, 90 in all; the market sell is the same size, the last column is a same-size limit buy at mark + 5%, all from the same account):

| Accounts | Position | Market buy | Market sell | Limit buy +5% |
|---|---|---|---|---|
| 66 | flat | **Panic(0x11)** | ok | ok |
| 7 | long | **Panic(0x11)** | ok | ok |
| 1 | short | **Panic(0x11)** | ok | ok |
| 5 | short | ok | ok | ok |
| 8 | flat, no allowance or margin | **Panic(0x11)** | account-specific (`ERC20InsufficientAllowance`, `InsufficientCollateral`, `ERC20InsufficientBalance`, `InsufficientMarginForOrder`) | mostly the same error |
| 3 | short with own quotes on top | `SelfMatchCancelTaker` | `SelfMatchCancelTaker` | `SelfMatchCancelTaker` |

The 5 accounts it works for hold a short that the buy reduces, which we read as the pool not pricing new margin on a pure reduce. One other short (`0x6ac2…`, 64.7 WETH) panics too, and we can't explain that from outside.

**The same on Tokyo.** Our own account, flat with 3.43 USDso free, on the ETH-PERP pool `0xd6cb…eddf`, buying 0.004: `eth_call` at that price gives `Panic(0x11)`, and at 2,290 it returns success. The real transaction `0x3f660c19e38be98c023ba1b2cd4929beeebc67a343fdae7ba32d6809581bda27` is `reverted` (block 38,814,525, gas 155,588).

**Spot, mainnet, vault-funded market buy of about 30 USDso:**
```
WBTC:USDso  0xd86a…ed88 vault USDso 100796.05: market buy -> InsufficientBalance(have 100796.05, need 70 digits) | IOC limit +5% -> ok
WETH:USDso  0xd86a…ed88 vault USDso 110407.59: market buy -> InsufficientBalance(have 110407.59, need 60 digits) | IOC limit +5% -> ok
SOMI:USDso  0x43a4…6703 vault USDso   481.74: market buy -> InsufficientBalance(have 481.74, need 60 digits)    | IOC limit +5% -> ok
```
The other accounts in the output revert `SelfMatchCancelTaker` on both orders because their own quotes are at the top of the book.

The spec already notes that `slippageBps` is "Ignored for sells and for vault-funded buys". The trouble is the price the server uses instead: the response is a `200` that can never fill, and the error tells a developer nothing. Bots that follow the spec's advice to `eth_call` first see a bare panic.

## Evidence
- `evidence/64/rest_perp_market_order_matrix.mjs`, output `rest_perp_market_order_matrix_2026-11-01T1205Z.txt` (the table above).
- `evidence/64/rest_vault_market_buy.mjs`, output `rest_vault_market_buy_2026-11-01T1212Z.txt`.
- `evidence/64/tokyo_market_buy_price_tx.mjs`, output `tokyo_market_buy_price_tx_2026-11-01T1207Z.txt`: the eth_call, the comparator and the reverted transaction on Tokyo.

## Suggested fix
Price all market buys the way wallet-funded ones are: best ask scaled up by `slippageBps`, with the same default, and apply it to `marginBank` and `vault`. If the ask side is empty return the existing 400. Until then, refuse these combinations with a 400 rather than returning a transaction that cannot succeed.

## Environment
- REST: `https://api.testnet.dreamdex.io/v0` (perps, serves chain 50312) and `https://api.dreamdex.io/v0` (mainnet spot), spec `/.well-known/oapi.json`
- RPC: `https://api.infra.testnet.somnia.network`, `https://api.infra.mainnet.somnia.network`, `https://api.hideki2.infra.testnet.somnia.network`
- Tokyo test wallet `0x2A11e7388D1D2F9690f2636846d44b478f61bF08`; viem 2.57.7
