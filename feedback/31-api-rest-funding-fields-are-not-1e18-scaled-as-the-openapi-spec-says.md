# REST API: `GET /v0/markets/{symbol}/funding` and the `perp` block of `GET /v0/markets` do not return funding "as 1e18-scaled fractions, exactly as the contract emits them", as the API's OpenAPI spec says: `fundingRate` is a plain decimal (`"0.0001"` for `1e14` on chain), and `cumulativeFundingPerUnit` is the contract value ÷ 1e18 (quote wei per whole base), unlike the USDso prices next to it
Severity: normal
Area: API

> **Summary.** The OpenAPI document of `https://api.testnet.dreamdex.io` says the funding route returns rates "as
> 1e18-scaled fractions, exactly as the contract emits them". The API does not do that. On all 24 perp markets,
> `fundingRate` is the contract value ÷ 1e18 (`"0.0001"` where `getCurrentFundingRate()` returns `100000000000000`).
> `cumulativeFundingPerUnit` is also the contract value ÷ 1e18. That is not the emitted value, and it is not a USDso
> amount either: it is quote wei (USDso has 18 decimals) per whole base, while `indexPrice` and `markPrice` in the same
> object are plain USDso decimals. For ADA:USDso the API returns `"1681955455868061.497…"`, and the actual cumulative
> is 0.00168 USDso per ADA. The spec gives no other unit for either field. The indexer and the SDK return the raw
> contract value under the same field name. A client that follows the spec misreads both fields, and a client that
> combines REST with indexer or SDK data is off by 1e18.

> **Checked 2026-10-26, 07:31–07:40 UTC, Somnia Shannon testnet (chain 50312, the only chain this host serves).** An
> earlier run at 05:51–06:10 UTC showed the same scaling. Evidence: `evidence/31/funding_units_check_2026-10-26T0733Z.json`,
> `evidence/31/curl_cast_2026-10-26T0735Z.txt`, `evidence/31/fundingupdated_logs_2026-10-26T0738Z.txt`,
> `evidence/31/oapi_apitestnet_2026-10-26T0731Z.json`.

The spec served at `https://api.testnet.dreamdex.io/.well-known/oapi.json` (its `servers` entry is
`https://api.testnet.dreamdex.io`, "testnet") describes `GetMarketSymbolFunding` (`GET /v0/markets/{symbol}/funding`,
tags `Perps`, `Public`, `Alpha`) as follows:

> The pool's live funding state plus its settlement history, newest first. Rates are per funding CALCULATION WINDOW as
> 1e18-scaled fractions, exactly as the contract emits them.

`fundingRate` and `cumulativeFundingPerUnit` are typed `SignedAmount` in `FundingSnapshot` (`current`),
`FundingHistoryPoint` (`history[]`) and `PerpParams` (the `perp` block of `GET /v0/markets?kind=perp`). `SignedAmount` is
a bare pattern, `^-?[0-9]+(\.[0-9]+)?$`, with no description. So the sentence above is the only unit the spec gives for
these fields. `indexPrice` and `markPrice` are typed `Price`: "Price as a decimal string".

On chain, the pool's funding rate and the `FundingUpdated` event are 1e18-scaled (`100000000000000` = 0.01 % per 8-hour
window). The cumulative is "1e18 x quote units per whole base" (SDK 0.32.1, `dist/perp/history.d.ts:356`). For
ADA:USDso, the chain value `1681955455868061497860058525909559` is 0.0016820 USDso per ADA. The REST API returns neither
form. It divides every 1e18-scaled value by 1e18 exactly once. For prices, that gives USDso. For the rate, it gives a
plain fraction. The cumulative carries two factors (the 1e18 scale and USDso's 18 decimals), so after one division it
is still in wei. ADA:USDso, pool `0x440f5a79857cd632ae45439410969c3f4049cc41`, at 07:33–07:35 UTC:

| field | contract / event value | REST `/funding` `current` and `/markets` `perp` | REST ÷ contract |
|---|---|---|---|
| `fundingRate` | `100000000000000` | `"0.0001"` | 1e-18 |
| `cumulativeFundingPerUnit` | `1681955455868061497860058525909559` | `"1681955455868061.497860058525909559"` | 1e-18 |
| `indexPrice` | `201900000000000000` | `"0.2019"` | 1e-18 |

What this does to a client:
- A client that follows the spec and divides `fundingRate` by 1e18 gets 1e-22, which is zero funding on every market.
- A client that reads `cumulativeFundingPerUnit` like the other decimals in the object (USDso per whole base) gets a
  value 1e18 too large. WBTC:USDso returns `"1783449812898165573859.89092568820239957"` next to `indexPrice`
  `"79947.35"`. The actual cumulative is 1,783.45 USDso per BTC.
- A client that follows the spec for the cumulative (treats it as the raw contract value and applies the SDK's
  `(end − start) / 1e18` "raw quote units per whole base", then ÷ 10^`quoteDecimals`) gets a value 1e18 too small.
- The indexer and the SDK use the same field name for the raw value. For the same ADA settlement, the indexer
  (`dev.smk.somnia.host`, chain 50312) returns `FundingRateUpdate.cumulativeFundingPerUnit`
  `"1681955455868061497860058525909559"`, and REST returns `"1681955455868061.497860058525909559"`. Code that reads
  history from one source and the current state from the other is off by 1e18.

The hourly steps confirm the unit. Between the REST history points at 05:51:54 and 06:51:55 UTC, ADA's cumulative rose by
`2528125000000`. The docs' funding formula (`/docs/trading/perps-testnet/funding`: "Hourly payment = position size × index
price × funding rate / 8") gives 1 × 0.20225 × 0.0001 / 8 = 0.000002528125 USDso for 1 ADA. That is exactly 1e18 times
smaller. The hour before gives the same ratio: a step of `2555000000000`, against 0.000002555 USDso at index 0.2044.
(The funding page, re-read at 07:40 UTC, still gives this formula, an 8-hour window and hourly settlement:
`evidence/31/docs_perps-testnet_funding_2026-10-26T0740Z.md`.)

## Steps to reproduce
1. Read the spec text:
   `curl -s https://api.testnet.dreamdex.io/.well-known/oapi.json | jq -r '.paths["/v0/markets/{symbol}/funding"].get.description, .components.schemas.SignedAmount'`
2. Read the funding state:
   `curl -s 'https://api.testnet.dreamdex.io/v0/markets/ADA:USDso/funding?kind=perp&limit=2'`
3. Read the same fields from the market list:
   `curl -s 'https://api.testnet.dreamdex.io/v0/markets?kind=perp' | jq -c '.markets[] | select(.symbol=="ADA:USDso") | {chainId, contract, quoteDecimals, perp: (.perp | {fundingRate, cumulativeFundingPerUnit, indexPrice})}'`
4. Read the pool on its chain (read-only):
   ```
   RPC=https://dream-rpc.somnia.network
   POOL=0x440f5a79857cd632ae45439410969c3f4049cc41
   cast call $POOL 'getCurrentFundingRate()(int256)' --rpc-url $RPC
   cast call $POOL 'getCumulativeFundingPerUnit()(int256)' --rpc-url $RPC
   ```
5. Read what the contract emitted. Decode the `FundingUpdated` log (topic0 `0x5380593b…57b9` =
   `cast keccak 'FundingUpdated(int256,int256,uint256,uint64,uint256)'`) of tx
   `0xa67746668780a74e39380b1fc9eb1db12c10d086d7a30daea863d3f864daca7e` (block 524161173):
   ```
   D=$(cast receipt 0xa67746668780a74e39380b1fc9eb1db12c10d086d7a30daea863d3f864daca7e --rpc-url $RPC --json | jq -r '.logs[] | select(.topics[0]=="0x5380593bd7dd2a1a6267dab2a1ab312f8e07094228a12ff26fe44fd6c6f857b9") | .data')
   cast decode-event --sig 'FundingUpdated(int256,int256,uint256,uint64,uint256)' $D
   ```
   Compare it with the REST history point at `timestamp` `1792990319000` (04:51:59 UTC). Use `limit=3`, or follow
   `nextCursor`.
6. Optional, the indexer value under the same field name:
   ```
   curl -s https://dev.smk.somnia.host/v1/graphql -H 'content-type: application/json' -d '{"query":"{ FundingRateUpdate(where:{pool:{_eq:\"0x440f5a79857cd632ae45439410969c3f4049cc41\"}}, order_by:{timestamp:desc}, limit:1) { fundingRate cumulativeFundingPerUnit indexPrice timestamp } }"}'
   ```
7. All markets at once: `node evidence/31/funding_units_check.mjs out.json` (Node.js 22, viem 2.57.7; public GETs, eth_call and
   eth_getTransactionReceipt only). For each of the 24 perp markets, it compares REST `fundingRate` and
   `cumulativeFundingPerUnit` with the contract value, the contract value ÷ 1e18 and the contract value ÷ 1e36. It also
   checks ADA's hourly steps against the docs' formula.

## Expected
The response matches the spec. Either:
- the API returns the contract integers, as the description says (`fundingRate` `"100000000000000"`,
  `cumulativeFundingPerUnit` `"1681955455868061497860058525909559"`), or
- the API returns decimals in the same units as the prices next to them (`fundingRate` `"0.0001"`,
  `cumulativeFundingPerUnit` `"0.001681955455868061…"` USDso per ADA, i.e. contract ÷ 1e18 ÷ 10^`quoteDecimals`), and the
  spec says so.

In both cases, the spec states the unit of each field.

## Actual
Run 2026-10-26 07:33:09–07:34:33 UTC, Shannon blocks 524258040–524258646 (`evidence/31/funding_units_check_2026-10-26T0733Z.json`).
Out of 24 perp markets:

| check | markets |
|---|---|
| REST `fundingRate` = contract value (as the spec says) | 0 |
| REST `fundingRate` = contract ÷ 1e18 | 24 |
| REST `cumulativeFundingPerUnit` = contract value (as the spec says) | 0 |
| REST `cumulativeFundingPerUnit` = contract ÷ 1e18 (quote wei per whole base) | 24 |
| REST `cumulativeFundingPerUnit` = contract ÷ 1e36 (USDso per whole base) | 0 |

Examples from the same run (REST `current` vs chain at the block read):

| market | REST `fundingRate` | chain rate | REST `cumulativeFundingPerUnit` | REST `indexPrice` | cumulative in USDso per base |
|---|---|---|---|---|---|
| ADA:USDso | `0.0001` | `100000000000000` | `1681955455868061.497860058525909559` | `0.2019` | 0.00168 |
| BNB:USDso | `0.0001` | `100000000000000` | `62508667129731870214.805328212268914253` | `738.125` | 62.51 |
| WBTC:USDso | `0.0001` | `100000000000000` | `1783449812898165573859.89092568820239957` | `79947.35` | 1,783.45 |
| WETH:USDso | `-0.000072010313089318` | `-72010313089318` | `39536010020612759903.074498221914464387` | `2315.585` | 39.54 |

The REST response at 07:35:23 UTC (`evidence/31/curl_cast_2026-10-26T0735Z.txt`):

```
{"symbol":"ADA:USDso","current":{"fundingRate":"0.0001","cumulativeFundingPerUnit":"1681955455868061.497860058525909559","indexPrice":"0.2016","markPrice":"0.20145","asOf":1792997513000},"history":[{"timestamp":1792997515000,"fundingRate":"0.0001","cumulativeFundingPerUnit":"1681955455868061.497860058525909559","indexPrice":"0.20225","markPrice":"0.20205","intervalsSettled":1},{"timestamp":1792993914000,"fundingRate":"0.0001","cumulativeFundingPerUnit":"1679427330868061.497860058525909559","indexPrice":"0.2044","markPrice":"0.20425","intervalsSettled":1}],"nextCursor":"Mg"}
```

The same pool, Shannon block 524259239, at 07:35:27 UTC:

```
getCurrentFundingRate()       100000000000000 [1e14]
getCumulativeFundingPerUnit() 1681955455868061497860058525909559 [1.681e33]
```

What the contract emitted (`evidence/31/fundingupdated_logs_2026-10-26T0738Z.txt`), compared with the REST history points:

| tx (block) | event `fundingRate` | event `cumulativeFundingPerUnit` | event `indexPrice` | REST history point |
|---|---|---|---|---|
| `0x82abff71…2baf` (524125126) | `100000000000000` | `1674329205868061497860058525909559` | `200500000000000000` | 03:51:53 UTC: `"0.0001"`, `"1674329205868061.497860058525909559"`, `"0.2005"` |
| `0xa6774666…ca7e` (524161173) | `100000000000000` | `1676872330868061497860058525909559` | `203450000000000000` | 04:51:59 UTC: `"0.0001"`, `"1676872330868061.497860058525909559"`, `"0.20345"` |

(The 03:51:53 point is in `evidence/31/rest_funding_units_2026-10-26T0610Z.txt`, and the 04:51:59 point in
`evidence/31/funding_units_check_2026-10-26T0733Z.json`, `adaHistory`.)

Indexer, 07:35 UTC (`evidence/31/indexer_shannon_ada_funding_2026-10-26T0735Z.json`, `chain_metadata.chain_id` 50312): the
newest `FundingRateUpdate` for the pool has `fundingRate` `"100000000000000"`, `cumulativeFundingPerUnit`
`"1681955455868061497860058525909559"` and `indexPrice` `"202250000000000000"`. This is the raw contract value, which
the REST API divides by 1e18.

Hourly steps, ADA (`adaSteps` in the run file):

| period (UTC) | REST step in `cumulativeFundingPerUnit` | docs formula, 1 ADA × index × rate / 8 | ratio |
|---|---|---|---|
| 05:51:54 → 06:51:55 | `2528125000000` | 0.000002528125 USDso (index 0.20225) | 1e18 |
| 04:51:59 → 05:51:54 | `2555000000000` | 0.000002555 USDso (index 0.2044) | 1e18 |

## Evidence
- `evidence/31/funding_units_check.mjs`: the read-only script from step 7. Its output is
  `evidence/31/funding_units_check_2026-10-26T0733Z.json`: the spec excerpts, every market's REST and chain values at the
  block read, the ADA history, the decoded `FundingUpdated` logs and the hourly steps.
- `evidence/31/curl_cast_2026-10-26T0735Z.txt`: steps 1–4 with `curl`, `jq` and `cast` 1.8.5, with timestamps and output.
- `evidence/31/fundingupdated_logs_2026-10-26T0738Z.txt`: step 5 for both transactions.
- `evidence/31/indexer_shannon_ada_funding_2026-10-26T0735Z.json`: step 6.
- `evidence/31/oapi_apitestnet_2026-10-26T0731Z.json`: the spec as served (sha256 `744be8364a579ee9…`). See
  `.paths["/v0/markets/{symbol}/funding"]` and `.components.schemas.{FundingSnapshot,FundingHistoryPoint,PerpParams,SignedAmount,Price}`.
- `evidence/31/rest_funding_units_2026-10-26T0610Z.txt`: an earlier run with the same result (REST at 06:10 UTC, chain and
  logs at 05:51 UTC).
- `evidence/31/stg_funding_route_2026-10-26T0737Z.txt` and `evidence/31/oapi_stg_2026-10-26T0731Z.json`: on
  `stg.api.dreamdex.io`, the docs' testnet base URL, the same route returns HTTP 501, "GetMarketSymbolFunding is not yet
  implemented". Its spec has the same schemas, describes `SignedAmount` as "Signed decimal amount as a string (e.g.
  "-12.5")", and has no 1e18 sentence. So `api.testnet.dreamdex.io` is the only host we found that answers this route.
- SDK 0.32.1 (`npm pack` tarball, read as text, not executed): `dist/perp/history.d.ts:350–361`, `fundingRate` "per
  CALCULATION WINDOW, 1e18-scaled, signed" and `cumulativeFundingPerUnit` "1e18 x quote units per whole base … realized
  funding over any range is exactly `(end - start) / 1e18` raw quote units per whole base". `dist/markets.d.ts:170–175`,
  `fundingRate` "1e18-scaled fraction, signed" and `cumulativeFundingPerUnit` "1e18-scaled, signed".

## Suggested fix
1. Choose one representation and document it on each field in the spec, not only in the route description. Give
   `fundingRate` and `cumulativeFundingPerUnit` their own schema descriptions in `FundingSnapshot`,
   `FundingHistoryPoint` and `PerpParams`.
2. If the API keeps decimals (this fits `indexPrice` / `markPrice`), divide the cumulative by 1e18 × 10^`quoteDecimals`
   (÷ 1e36 for USDso), so it is USDso per whole base. The difference between two history points is then the funding per
   1 unit of base for that period, the same figure the docs' formula gives. Change the route description from "1e18-scaled
   fractions, exactly as the contract emits them" to "decimal fractions per calculation window".
3. If the API keeps contract values, return the integers for both fields, as the description says, and state the
   cumulative's unit ("1e18 × quote base units per whole base", as in the SDK).

## Environment
- REST `https://api.testnet.dreamdex.io` (the `testnet` server in its own OpenAPI document; not in the HTTP API docs'
  base-URL table). Its `chainId` parameter says: "Defaults to 50312, the only chain this deployment serves". All 24
  markets from `GET /v0/markets?kind=perp` have `chainId` 50312 and `quoteDecimals` 18.
- Somnia Shannon testnet, chain id 50312, RPC `https://dream-rpc.somnia.network`. ADA:USDso pool
  `0x440f5a79857cd632ae45439410969c3f4049cc41`, WBTC:USDso `0x3892a5179f8ea0c810c45d1630546c0317b0e5b6`, BNB:USDso
  `0x11c8d997e291a83a59d86dd2cde7ffcb0ae66798`, WETH:USDso `0x6a7224a4ad765d6134c4f29200e67b1f6b62c29e`.
- Indexer `https://dev.smk.somnia.host/v1/graphql` (`chain_metadata.chain_id` 50312)
- `@somnia-chain/markets-sdk` 0.32.1 (types read as text; not executed)
- Tools: curl, jq, `cast` 1.8.5, Node.js v22.22.1 with viem 2.57.7
- Docs: `https://app.dreamdex.io/docs/trading/perps-testnet/funding.md`, fetched 2026-10-26 07:40 UTC
- Date: 2026-10-26, 07:31–07:40 UTC (Shannon blocks 524258040–524259239); first seen 05:51–06:10 UTC
- Wallet: n/a (read-only, public data; no transactions sent)
