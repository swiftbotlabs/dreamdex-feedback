# Perps on Testnet for Developers

Testnet perps run on the **Hideki** testnet chain, which the app shows as the **DreamDEX** region. Build against it with [`@somnia-chain/markets-sdk`](https://www.npmjs.com/package/@somnia-chain/markets-sdk); this page uses version 0.32.1, the one the app runs. For how the markets themselves work, see [Perps on Testnet](../../trading/perps-testnet/README.md).

## Network

| | |
|---|---|
| **Chain ID** | `50383` |
| **RPC** | `https://api.hideki2.infra.testnet.somnia.network` |
| **WebSocket** | `wss://api.hideki2.infra.testnet.somnia.network/ws` |
| **Indexer (GraphQL)** | `https://hideki-dev.smk.somnia.host/v1/graphql` |
| **Explorer** | [explorer.testnet.somnia.network/tokyo](https://explorer.testnet.somnia.network/tokyo) |
| **Gas coin** | STT |

## Contracts

| Contract | Address |
|---|---|
| MarginBank | `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` |
| Collateral (USDso) | `0xed7993A74dAe1e6656B704A424DcD8711aAf4F72` |
| PerpPoolFactory | `0xE631fAEE547baeE07353E290f0562ea67d856560` |
| LiquidationEngine | `0xA66d3C24Ad4a389d863846905D8173e1017e9F4D` |
| InsuranceFund | `0x50826894D47C6D4f3BeA38BFDC7Dc5c5be171b80` |
| VoucherDistributor (paper USDso) | `0x2ACD9EFdA721450906bfE1bef3edE269636E42C4` |
| OperatorPermissionsRegistry | `0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a` |

Read per-market addresses off the market row rather than hardcoding them: `poolAddress`, `marginBank` and `stopRegistry` are all on it. `client.getPerpSystemConfig(marginBank)` returns the MarginBank's collateral, factory, liquidation engine and insurance fund in one read, which is the check worth running before trusting any list.

## Connect

```ts
import {
  SOMNIA_HIDEKI_TESTNET_ADDRESSES,
  SomniaMarkets,
} from "@somnia-chain/markets-sdk"
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains"

const markets = new SomniaMarkets({
  chain: hidekiTestnet,
  indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql",
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
  privateKey: process.env.PRIVATE_KEY as `0x${string}`, // leave out for read-only
})

const perps = await markets.client.listPerpMarkets()
const btc = perps.find((m) => m.baseSymbol === "BTC")!
```

## Get test funds

**STT for gas.** The simplest route is through the app: sign in at [app.testnet.dreamdex.io](https://app.testnet.dreamdex.io/perps), then [Link a Bot](../../trading/common/link-a-bot.md) with your key's address and use **Send it … for gas** or **Top up**. Gas is billed on what a transaction uses, not on its gas limit: transactions to perp pools measured on testnet cost between 0.0003 and 0.003 STT each.

**Paper USDso.** Any address can claim the 1,000 USDso perps credit once, as long as it holds no perp positions or orders:

```ts
const account = markets.walletAddress!
const eligibility = await markets.client.getPerpVoucherEligibility(btc.marginBank, account)
if (eligibility.eligible) {
  await markets.trader.claimPerpVoucher({ marginBank: btc.marginBank })
}
```

The credit comes with rules, most importantly that it can only open positions in the markets on its allowlist. See [Paper USDso](../../trading/perps-testnet/margin-and-liquidations.md#paper-usdso).

## Size and place an order

Prices are raw quote units per whole base asset and quantities are raw base units, so convert with each market's own decimals: they differ per market. A price must sit on the market's `tickSize` and a quantity on its `lotSize`, at least `minQuantity`.

```ts
import { parseUnits } from "viem"

const price = parseUnits("100000", btc.quoteDecimals)
const max = await markets.client.getMaxPerpOrderSize({
  pool: btc.poolAddress,
  marginBank: btc.marginBank,
  account,
  isBid: true,
  price,
})

const quantity = parseUnits("0.001", btc.baseDecimals)
if (!max.priceable) throw new Error("No live mark price to size against")
if (!max.placeable || quantity > max.maxQuantity) {
  throw new Error(`Order too large for this account: limited by ${max.limitedBy}`)
}
await markets.trader.placePerpOrder({ pool: btc.poolAddress, isBid: true, price, quantity })
```

`getMaxPerpOrderSize` tells you the largest order the account can place (`maxQuantity`) and which limit binds it (`limitedBy`), so check it before sending rather than reading a revert afterwards. It answers `priceable: false` when the market's mark price is stale, and then quotes no size at all.

## Trade an app wallet with a bot

To have code trade a wallet you use in the app, link your key to it with [Link a Bot](../../trading/common/link-a-bot.md): the key can then place, cancel and reduce orders for that wallet, and nothing else. The open-source [dreamDEX bot kit](https://github.com/somnia-chain/dreamdex-bot-kit) does this when `OWNER_ADDRESS` is set to the linked wallet, and the [dreamBot Builder](https://app.testnet.dreamdex.io/dreambot-builder) sets up a perps bot for you.

## Raw and operator calls

If you call the pools directly instead of through the SDK, for example a bot key placing orders for a linked wallet with `placeOrderFor`, three things trip people up.

```solidity
function placeOrderFor(address owner, bool isBid, uint64 userData, uint256 price, uint256 quantity,
    uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder,
    uint96 builderFeeBpsTimes1k) payable returns (bool success, uint128 orderId)
```

### Scale quantity by the base asset's decimals

`price` always has 18 decimals, because every market's collateral, USDso, does. `quantity` uses the **base asset's own decimals**, which differ per market:

| Base decimals | Markets |
|---|---|
| 6 | ADA, HYPE, PUMP, XRP |
| 7 | XLM |
| 8 | BTC, DOGE, ZEC |
| 9 | SOL, SUI, TAO |
| 18 | 1000PEPE, AVAX, BNB, ETH, LINK, LIT, VVV, WLD, ZRO |
| 24 | NEAR |

Read them rather than copying this table: `baseDecimals` is on every market row. `getOrderBookParameters()` on the pool returns the raw `tickSize`, `minQuantity` and `lotSize`, in that order.

A wrong scale does not fail with an error that says so. 0.1 SOL written with 18 decimals is 100,000,000 SOL, and `placeOrderFor` reverts with `InsufficientCollateral()` (`0x3a23d825`). The owner's own `placeOrder` fails differently, with `ERC20: transfer amount exceeds balance`, because the pool tries to pull the shortfall from the wallet.

### Leave plenty of gas

Successful `placeOrderFor` transactions on testnet used up to about 1.56M gas, and a simple resting order simulated with a 1.5M limit reverts while the same call with 3.2M succeeds. `eth_estimateGas` returned 3.2M for a resting order and 7.7M for an IOC that crossed several price levels. Gas is billed on what is used, so a generous limit costs nothing extra: the [bot kit](https://github.com/somnia-chain/dreamdex-bot-kit) sends every perp order with 10,000,000.

A transaction that runs out of gas or reverts lands with status `0` and no reason in the receipt. Replay it with `eth_call` at the parent block to see the revert.

### An IOC that fills nothing reverts

An IOC order that finds nothing to fill reverts a single `placeOrderFor` with `ImmediateOrCancelNoFill()` (`0xd48c4403`). In a batch (`placeOrdersFor`) a refused request does not revert: the rest of the batch commits, `successes[i]` is false for that entry, and its `OrderRejected` log carries reason `5`, which `client.listPerpOrderRejections` returns by name. An all-or-nothing `amendOrders` reverts with `AmendReplacementRejected(requestIndex, reason)` instead.

The level you saw can be gone by the time the transaction lands, so price an IOC through the book with some slippage room rather than exactly at the touch. The full list of order errors is on the [Errors](../contracts/errors.md#order-rejection) page.

## Common pitfalls

- **The SDK reads the chain over WebSocket.** An environment that only proxies HTTP fails on the first chain read with `genesis check failed`. Give it access to the WebSocket endpoint above.
- **The perps collateral is not `SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral`.** That entry is a different token. Read the perps collateral from the market row (`quoteToken`) or from `getPerpSystemConfig`.
- **Decimals vary per market**, from 6 to 24 on the base side. Never assume 18; see [the table above](#scale-quantity-by-the-base-assets-decimals).
- **Paper USDso blocks some markets.** Increasing a position in a market outside the credit's allowlist reverts, and `getMaxPerpOrderSize` reports it as `limitedBy: "voucherBlocked"`.
- **An isolated account trades one market only.** Orders anywhere else revert with `IsolatedMarketBlocked`, reducing ones included.
- **Each account has a position cap per market**, a tenth of the market's open interest cap on most markets. An order that would take the account past it reverts with `MaxPositionSizeExceeded()` (`0x714b36d6`); `getMaxPerpOrderSize` reports the cap as `maxPositionSize`.
- **Stop orders carry 0.15 STT each**, sent with the order and refunded on cancel. An account holding only USDso cannot place one.
