# Funding

A perp has no expiry date, so funding payments keep its price close to the asset's index price instead. Funding is paid directly between longs and shorts: the protocol takes no cut.

## Who pays whom

- **Perp above the index** (positive funding): longs pay shorts.
- **Perp below the index** (negative funding): shorts pay longs.

Paying the side that trades against the gap is what pulls the perp back toward the index.

## When it is paid

| | |
|---|---|
| **Rate window** | 8 hours |
| **Settlement** | Every hour |

The funding rate is quoted per 8-hour window, and each hourly settlement applies an eighth of it:

```
Hourly payment = position size × index price × funding rate / 8
```

For example, a 1 BTC long with the index at 100,000 USDso and a funding rate of 0.08% pays 1 × 100,000 × 0.0008 / 8 = **10 USDso** to shorts for that hour.

Funding is applied to your position the next time it is touched, by a trade, a withdrawal or a liquidation, and everything owed since the last time is settled at once. The result is the same as paying every hour.

> [!NOTE]
> Both the window and the settlement interval are per-market settings that can change. On testnet every market currently uses an 8-hour window settled hourly.
