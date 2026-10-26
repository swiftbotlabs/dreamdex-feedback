# Margin & Liquidations

Perp positions are backed by the USDso in your **Perps account**, which is separate from your spot wallet. Move USDso between the two with **Perps ⇆ Spot** on the perps page.

## Margin thresholds

Each threshold is a percentage of the position's notional value, and each is half the one above it.

| Threshold | What it means | 20x markets | 10x markets | 5x markets |
|---|---|---|---|---|
| **Initial margin** | What you need to open a position. It is 1 / max leverage | 5% | 10% | 20% |
| **Maintenance margin** | Below this, liquidation starts | 2.5% | 5% | 10% |
| **Close-out margin** | The last-resort level the protocol's backstop stages work against | 1.25% | 2.5% | 5% |

Each market's maximum leverage is in the [market table](README.md#markets).

## Margin modes

- **Cross** is the default. Every position in the account shares one USDso balance, so a gain on one offsets a loss on another, and one position can be closed to cover another.
- **Isolated** confines the account to a single market: the margin backs positions there only, and orders in any other market are rejected, reducing ones included. Choosing a margin mode in the app is coming soon.

To keep strategies fully apart today, give each its own wallet, for example Wallet 2 for a bot. Each wallet is a separate account with its own margin and its own liquidation.

## Leverage

A market's maximum leverage is 1 divided by its initial margin: 20x, 10x or 5x on testnet. You can trade below it. Choosing 10x on a 20x market means holding 10% of the position's value as margin instead of 5%.

## Paper USDso

The 1,000 USDso that Perps Arena gives you is a **credit voucher**. It counts as margin like any other USDso, with a few rules while any of it remains in the account:

- **It can't be withdrawn.** Only USDso above the voucher balance can leave the Perps account.
- **Only some markets.** You can open or increase positions only in the markets marked **Yes** under Paper USDso in the [market table](README.md#markets). The six newest markets are not on that list.
- **Your leverage setting can't be changed** while it remains.
- **Reducing and closing are never blocked**, in any market.
- **No builder fees** are charged on the account.

You can add your own USDso alongside it; both sit in one balance. A voucher can be taken back 14 days after it was granted, but only while the account has no positions and no resting orders: it never forces a position closed.

## Liquidations

When your account's equity falls below its maintenance margin, it can be liquidated. Your open orders are cancelled first, then positions are closed on the order book one at a time until the account is back above maintenance margin.

A liquidation on the book charges a fee of **up to 1%** of the notional it closes, taken only from the surplus the close creates: an account that comes back just above maintenance margin pays nothing. When the close leaves no position open, the fee can come out of the remaining equity instead, still capped at 1%.

If closing on the book is not enough, the protocol escalates: a registered backstop bidder can take the position over, the Insurance Fund covers any remaining shortfall, and only when both are exhausted does **auto-deleveraging (ADL)** start. ADL reduces profitable positions on the opposite side of the same market, those with the most profit relative to their account's equity first. No backstop bidders are registered on testnet, so the later stages come in sooner.

The **ADL** column in your positions table shows where each position stands in that queue as five bars. The more bars are lit, the closer the position is to the front.

> [!TIP]
> To stay clear of liquidation, keep equity well above maintenance margin: use less than the maximum leverage, add margin through **Perps ⇆ Spot**, or set a stop loss. See [Orders](orders.md).
