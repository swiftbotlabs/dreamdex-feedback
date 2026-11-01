# REST API: a delisted perp market stays in `/v0/markets` with no status field, shows a frozen mark, and `POST orders` answers 200 with a transaction that reverts `MarketSettled()`
Severity: normal
Area: API

> **Summary.** SWBTCC was delisted on Shannon on 2026-09-22 09:42 UTC. Forty days later the perps REST API still lists it like any live market. A market row has no status field at all, so nothing on the row says delisted, reduce-only or live.
> Its `markPrice` is frozen at 85,907.82 next to a live `indexPrice` of about 77,700, and `POST /v0/markets/SWBTCC:USDso/orders?kind=perp` still answers `200` with a transaction to sign, which reverts `MarketSettled()`. Clients have to discover a delisting from a revert.
>
> **Checked 2026-11-01, 12:12–12:18 UTC.** Fresh wallet, prepare only, simulated with `eth_call`. Evidence: `evidence/66/`.

## Steps to reproduce
```sh
curl -s 'https://api.testnet.dreamdex.io/v0/markets?kind=perp' | jq '.markets[] | select(.symbol=="SWBTCC:USDso")'
python3 evidence/66/delisting_history.py
```
Then sign in with SIWE, `POST /v0/markets/SWBTCC:USDso/orders?kind=perp` with `{"type":"limit","side":"buy","amount":"0.001","price":"70000","fundingSource":"marginBank"}`, and `eth_call` the returned `to` and `data` from any account.

## Expected
A delisted market is left out of `/v0/markets`, or the row carries a status (`active`, `reduceOnly`, `delisted`), and the prepare route refuses it with a 4xx.

## Actual
- `/v0/markets?kind=perp` lists it. Row keys: `base, baseDecimals, chainId, contract, kind, lotSize, minQuantity, perp, quote, quoteDecimals, stopRegistry, symbol, tickSize`. The `perp` block has no status either.
- `perp.markPrice` 85907.82, `perp.indexPrice` about 77,700, `asOf` 2026-09-22, and `maxLeverage` 40.
- Limit order: `200`, and the simulated call reverts `MarketSettled()` (`0x50e929ad`). Market sell: `200`, then `ImmediateOrCancelNoFill()` on the empty book.
- The reduce-only `SW*` markets have the same gap: nothing in the row tells a client that new positions will be refused.

## Evidence
`evidence/66/delisting_history.py` with `delisting_history_2026-11-01T1218Z.txt`, and `delisted_prepare_2026-11-01T1218Z.txt`.

## Suggested fix
Add `status` to the market row from the pool's own state, and answer the prepare route with a 4xx for a settled market.

## Environment
- `https://api.testnet.dreamdex.io/v0` (serves chain 50312), indexer `https://dev.smk.somnia.host/v1/graphql`, RPC `https://api.infra.testnet.somnia.network`
- Fresh throwaway wallet; no transactions sent
