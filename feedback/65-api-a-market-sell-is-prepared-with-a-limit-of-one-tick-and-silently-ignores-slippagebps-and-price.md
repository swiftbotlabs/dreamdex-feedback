# REST API: a market sell is prepared with a limit of one tick and silently ignores `slippageBps` and `price`, so it has no price protection at all
Severity: normal
Area: API | docs

> **Summary.** The docs say a market order "carries a price limit" and that "Via the SDK or API you set the limit yourself: above the best ask for buys, below the best bid for sells". On `POST /v0/markets/{symbol}/orders`
> a client can't: for `type: market, side: sell` the server always writes the market's smallest tick as the limit (0.01 for WETH at 2,266, 0.0001 for USDC.e at 1.00). `slippageBps: 10` makes no difference, and a `price` field is accepted with `200` and dropped. So a bot that asks for a
> market sell with 10 bps of slippage gets an order that may fill any distance down the book. The app's own market orders stop at the slippage tolerance; this one doesn't. The same happens on perps, where it is the natural way to close a long.
>
> **Checked 2026-11-01, 12:10 UTC**, prepare only, with a fresh wallet on mainnet and on the perps host. Nothing was signed or sent. Evidence: `evidence/65/`.

## Steps to reproduce
Sign in with SIWE and prepare, or run `npm install && cd evidence/65 && node market_sell_prepare.mjs`:
```sh
curl -s -X POST "$API/markets/WETH:USDso/orders" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"type":"market","side":"sell","amount":"0.01","slippageBps":10}'
```
Decode `data`. The third word of `placeOrder(...)` is the limit price.

## Expected
Either the buy-side behaviour (best bid scaled down by `slippageBps`, default 5%), or a 400 for a field the route won't use.

## Actual
```
USDC.e:USDso {"type":"market","side":"sell","amount":"1"}                    200  price word 0.0001  orderType 2
USDC.e:USDso {"type":"market","side":"sell","amount":"1","price":"0.99"}     200  price word 0.0001  orderType 2
USDC.e:USDso {"type":"market","side":"sell","amount":"1","slippageBps":10}   200  price word 0.0001  orderType 2
WETH:USDso   {"type":"market","side":"sell","amount":"0.01","slippageBps":10} 200 price word 0.01    orderType 2
WETH:USDso   {"type":"market","side":"buy","amount":"0.01","slippageBps":10}  200 price word 2270.12 orderType 2
WETH best bid 2266.96, best ask 2267.85
```
- The buy honours `slippageBps` (2267.85 + 0.1%). The sell does not.
- The perp route is the same: `POST .../orders?kind=perp` with `side: sell, slippageBps: 10, fundingSource: marginBank` gives a price word of 0.01 on WETH.
- The spec states "Ignored for sells" on `slippageBps`, in one field description. The trader docs (Order Types, and "My order was rejected") say the opposite in general terms.

How much it costs depends on the book. Today's mainnet bids are deep near the touch and an order of normal size stops well before the bottom, so we rate this normal. The exposure is on a thin book or a large order, on mainnet funds, where the client asked for a limit and got none.

## Evidence
- `evidence/65/market_sell_prepare.mjs`, `siwe.mjs`, and the output `market_sell_prepare_2026-11-01T1209Z.txt`.
- Docs: Order Types, "Market Order"; OpenAPI `PrepareMarketOrder.slippageBps`.

## Suggested fix
Apply `slippageBps` to sells: `best bid * (1 - slippageBps / 10000)`, tick-aligned. Reject `price` on `type: market` with `invalid_request_body`, since the schema doesn't define it.

## Environment
- REST: `https://api.dreamdex.io/v0` and `https://api.testnet.dreamdex.io/v0`, spec `/.well-known/oapi.json`
- Fresh throwaway wallet; prepare only, no transactions sent
