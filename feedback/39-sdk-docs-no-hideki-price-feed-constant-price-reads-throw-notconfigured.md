# SDK + docs: there is no Hideki price-feed constant, so the SDK's price reads throw `NotConfiguredError` on a Hideki client, and the only testnet feed the SDK ships is labelled "Shannon"
Severity: normal
Area: docs

> **Summary.** On a `SomniaMarkets` client built for Hideki (the bounty network, chain 50383), the price-feed reads
> `fetchPrice` and `fetchPriceOHLCV` throw `NotConfiguredError` ("needs `config.priceFeed = { url }`") unless the
> caller sets `priceFeed` by hand. The SDK exports exactly two feed constants, `SOMNIA_TESTNET_PRICE_FEED` and
> `SOMNIA_MAINNET_PRICE_FEED`; the reference's endpoint table maps the testnet one to **Shannon testnet**, not
> Hideki, and there is no Hideki price-feed constant or endpoint anywhere, even though the same reference says Hideki
> runs its own `PriceFeedScheduler` at `0x1998C88D54a240b8C671493f27f58eC416b81D7F`. In practice pointing the Hideki
> client at `SOMNIA_TESTNET_PRICE_FEED` works (dev-feed BTC 80,019.08 vs the Hideki on-chain BTC perp mark 79,975.91
> at 13:21 UTC, 0.054% apart), but nothing tells a Hideki developer to use the "Shannon" constant or whether its
> prices correspond to Hideki's own scheduler.

> **Checked 2026-10-26, 13:21 UTC, Somnia Tokyo testnet (chain 50383), SDK 0.32.1.** Evidence:
> `evidence/39/price_feed_no_hideki_constant_2026-10-26T1321Z.txt`.

## Steps to reproduce
1. Build a client with only the Hideki chain + addresses and read a price (`node evidence/39/cap39.mjs`, read-only):

```js
const m = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl, addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES });
await m.fetchPrice('BTC');          // throws NotConfiguredError
await m.fetchPriceOHLCV('BTC','1m'); // throws NotConfiguredError
```

2. Add the only testnet feed the SDK exports and read again:

```js
const m2 = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl, addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
                               priceFeed: SOMNIA_TESTNET_PRICE_FEED });
await m2.fetchPrice('BTC');          // works
```

3. Look for a Hideki feed in the reference: `docs/reference/networks-and-endpoints.md` price-feed table, and the
   exported constants in `dist/index.d.ts`.

## Expected
The perps-testnet docs name the price-feed constant and endpoint to use for Hideki (or `hidekiTestnet` carries a
default), so `fetchPrice` on the bounty network works without guessing which of two differently-named constants
applies and whether its prices are Hideki's.

## Actual
Run 2026-10-26 13:21 UTC (`evidence/39/price_feed_no_hideki_constant_2026-10-26T1321Z.txt`):

```
(a) default Hideki client (no priceFeed):
    fetchPrice('BTC')        -> THROW NotConfiguredError: needs config.priceFeed = { url }
    fetchPriceOHLCV('BTC',…) -> THROW NotConfiguredError: needs config.priceFeed = { url }

(b) the only two feed constants the SDK exports:
    SOMNIA_TESTNET_PRICE_FEED = { url: "https://price-feed.dev.oracle.somnia.host/v1/graphql", quote: "USDC" }
    SOMNIA_MAINNET_PRICE_FEED = { url: "https://price-feed.prd.oracle.somnia.host/v1/graphql", quote: "USDC" }

(c) Hideki client pointed at SOMNIA_TESTNET_PRICE_FEED:
    dev-feed fetchPrice('BTC')                = 80019.08
    Hideki on-chain BTC perp mark (getPerpLeverage) = 79975.91   (diff 0.054%)
```

The reference lists only two price-feed rows, and neither is Hideki:

```
| Somnia mainnet  | price-feed.prd.oracle.somnia.host/v1/graphql | SOMNIA_MAINNET_PRICE_FEED |
| Shannon testnet | price-feed.dev.oracle.somnia.host/v1/graphql | SOMNIA_TESTNET_PRICE_FEED |
```

The constant's own TSDoc (`dist/config.d.ts`) calls it "the known Somnia-testnet price feed (dev) ... indexes the
testnet `PriceFeedScheduler`", while the endpoint table calls the same URL "Shannon testnet". A developer on Hideki
is left to infer that the "Shannon/testnet-dev" feed is the one to use and that its prices track Hideki's.

## Evidence
- `evidence/39/price_feed_no_hideki_constant_2026-10-26T1321Z.txt`: the thrown errors, both feed constants, the
  dev-feed vs on-chain-mark comparison, the reference's two-row price-feed table, and the two exported constant names.
- `evidence/39/cap39.mjs`: the read-only script.
- SDK 0.32.1 `dist/index.d.ts` (exports `SOMNIA_TESTNET_PRICE_FEED`, `SOMNIA_MAINNET_PRICE_FEED` — no Hideki one);
  `dist/config.d.ts` 265–295; `docs/reference/networks-and-endpoints.md` lines 93–94, 105–109; `docs/PRICES.md` 46–53.

## Suggested fix
Add a Hideki price-feed entry: either ship a `SOMNIA_HIDEKI_TESTNET_PRICE_FEED` constant (or have `hidekiTestnet`
default it, as the chain binding already defaults the RPC/WS), and add a Hideki row to the price-feed table in
`networks-and-endpoints.md`. State which feed serves Hideki's `PriceFeedScheduler` prices and that the perps-testnet
guide needs `priceFeed` set for `fetchPrice` to work.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (npm `latest`), run against Hideki
- Indexer `https://hideki-dev.smk.somnia.host/v1/graphql`; price feed `https://price-feed.dev.oracle.somnia.host/v1/graphql`
- Somnia Tokyo testnet, chain id 50383 ("Hideki")
- Date: 2026-10-26, 13:21 UTC
- Wallet: n/a (read-only)

**Distinct from** every other report we are aware of: no competitor repo mentions `PRICES.md`, the price-feed
constants, or `fetchPrice` on Hideki. Separate from our docs reports 05/06/09/16/23, which are about margin events,
the Errors page, gas, leverage units and the hosted reference version.
