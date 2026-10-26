# Orders

Buying opens or adds to a long, selling opens or adds to a short. Every order is checked against your margin before it is placed. See [Margin & Liquidations](margin-and-liquidations.md).

## Order types

- **Market** fills against the book straight away at the best available prices.
- **Limit** fills at your price or better. Choose how long it lives with **Time in force**:

| | Name | What happens |
|---|---|---|
| **GTC** | Good til cancelled | Rests on the book until it fills or you cancel it. The default on perps |
| **IOC** | Immediate or cancel | Fills whatever is available at your price or better right now; the rest is cancelled |
| **FOK** | Fill or kill | Fills the whole size immediately, or places nothing at all |
| **ALO** | Add liquidity only | Only rests as a maker, and is rejected if any of it would fill immediately |

**Reduce-only** orders can only shrink a position, never open or flip one.

## Take profit and stop loss

A **take profit (TP)** closes a position when the price reaches your target, and a **stop loss (SL)** closes it when the price moves against you. Both are reduce-only.

- Set them on a new order, or on an open position from the positions table.
- On a limit order, TP/SL can be armed before it fills only with GTC or ALO, the time-in-force options that rest on the book.
- They show as lines on the chart, where you can drag them to a new price or cancel them.

## TP and SL hold a little STT

Each pending TP or SL holds **0.15 STT** from your wallet. It pays for the transaction that fires the trigger, and you get it back if you cancel it. Keep enough STT in the wallet for every TP and SL you want open.
