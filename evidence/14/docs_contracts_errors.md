
# Errors

The Somnia DEX contracts revert with **custom errors**, not string messages. A failing `eth_call` (preflight simulation) or mined transaction returns ABI-encoded revert data whose first four bytes are the error **selector** - `keccak256("ErrorName(argTypes)")[:4]`. This page maps every selector to its error so integrators can decode a revert instead of guessing.

## Decoding a revert

The revert data is `selector (4 bytes) || abi.encode(args)`. Match the leading 4 bytes against the tables below.

With Foundry:

```bash
# Decode a raw revert blob (selector + args)
cast decode-error 0xcf479181000000000000000000000000000000000000000000000000000000000000000a...

# Or look up just the selector
cast 4byte 0xcf479181
```

> [!NOTE]
> Two selectors reported most often during preflight are `0xf5e39c1f` = `IncorrectSender(address,address)` (usually an `eth_call` sent without `from`, or `placeOrderFor`/`cancelOrderFor` from an unauthorized operator) and `0xcf479181` = `InsufficientBalance(uint256,uint256)` (the owner's **free** vault balance does not cover `principal + max(makerFee, takerFee) + builderFee`). A bare `0x` revert with no selector is an out-of-gas or a low-level `call` failure - re-check the gas limit (see [`InsufficientGasForPayout`](#gas) on native-base BUYs).

## SpotPool errors

### Order validation

| Selector | Error | Meaning / fix |
| -------- | ----- | ------------- |
| `0xaf608abb` | `InvalidPrice(uint256 price, uint256 tickSize)` | `price` is not a whole multiple of `tickSize`. Tick-align the price - see [Quantization](functions.md#getpoolparams). |
| `0x4f174b29` | `InvalidQuantity(uint256 quantity, uint256 constraint)` | `quantity` is not a whole multiple of `lotSize`. Lot-align the quantity. |
| `0xeaa68ceb` | `QuantityBelowMinimum(uint256 quantity, uint256 minimum)` | `quantity` is below the pool's `minQuantity`. |
| `0x2c5211c6` | `InvalidAmount()` | Amount is zero or otherwise invalid. |
| `0x57b0e210` | `PriceTooLarge()` | Price exceeds the encodable range. |
| `0xdf6c8c3d` | `InvalidTakerSide()` | Taker side is inconsistent with the requested operation. |
| `0xe967701d` | `ZeroQuoteFillsAllowed()` | Order would produce a zero-quote fill. Increase size or improve price. |

### Order rejection

A **well-formed** order the book cannot honour reverts with one of the five errors below. These are distinct from the validation errors above: nothing is wrong with your input, the book simply could not do what you asked. On the singular entrypoints ([`placeOrder`](functions.md#placeorder), `placeOrderFor`, `amendOrder`) they are the *only* way a rejection surfaces — `success` is always `true` when the call returns.

| Selector | Error | Meaning / fix |
| -------- | ----- | ------------- |
| `0x3154078e` | `OrderAlreadyExpired()` | `expireTimestampNs` is at or before the current block time. Rebuild the expiry from a fresh timestamp. |
| `0x6ffc9258` | `SelfMatchCancelTaker()` | The order would have matched your own resting order under `SelfMatchingOption.CancelTaker`. Cancel the resting side first, price away from it, or pass `CancelMaker`. |
| `0x7cf05fcb` | `PostOnlyWouldCross()` | A `PostOnly` order would have filled immediately instead of resting. Re-price further from the touch. |
| `0xc04ad919` | `FillOrKillNotFillable()` | A `FillOrKill` order could not be filled in full at placement. Reduce size or widen the price. |
| `0xd48c4403` | `ImmediateOrCancelNoFill()` | An `ImmediateOrCancel` order filled nothing at all. The book moved, or your price never crossed. |

> [!WARNING]
> **All five are custom errors, so `catch Error(string)` will not match them.** A contract that must tolerate a rejection has to use `catch (bytes memory)` or a bare `catch`. Batch callers should prefer [`placeOrders`](functions.md#placeorders), which flags the individual request and emits [`OrderRejected`](events.md#orderrejected) rather than reverting.

### Funding and vault

| Selector | Error | Meaning / fix |
| -------- | ----- | ------------- |
| `0xcf479181` | `InsufficientBalance(uint256 available, uint256 required)` | Free vault balance does not cover `principal + max(makerFee, takerFee) + builderFee`. Fees debit the **free** balance, not the locked principal. See [free-balance requirement](functions.md#placeorder). |
| `0x890a6062` | `UseDepositNative()` | Called `deposit(NATIVE_TOKEN, ...)` on a native-side pool. Call [`depositNative()`](functions.md#depositnative) with `msg.value` instead. |
| `0x6ee800fc` | `UnexpectedNativeDeposit()` | Sent `msg.value` to a fully-ERC20 pool. |
| `0x1f89f671` | `InvalidMsgValue(uint256 expected, uint256 received)` | `msg.value` does not match the required native input. |
| `0x3022f2e4` | `NativeTokenTransferFailed()` | A native payout `call` was rejected by the recipient. |
| `0x734b5f70` | `InvalidDepositOrWithdrawal()` | Token is neither the base nor quote of the market, or amount is invalid. |

### Gas

| Selector | Error | Meaning / fix |
| -------- | ----- | ------------- |
| `0x782b2567` | `InsufficientGasForPayout(uint256 gasLeft)` | Native-base BUY did not clear the payout gas headroom guard. Set the tx gas limit **≥ 5,000,000** and simulate with the same limit. See [Contract Specifications](contract-specifications.md). |

### Order lifecycle

| Selector | Error | Meaning / fix |
| -------- | ----- | ------------- |
| `0xd4ec9006` | `ExpiredOrderMustBeCancelled(uint128 orderId)` | Called [`reduceOrder`](functions.md#reduceorder) on a past-expiry order. Use [`cancelOrder`](functions.md#cancelorder). |
| `0x71fa8de6` | `OrderIdMismatch()` | The stored order for that slot no longer matches the supplied `OrderId` (already filled, cancelled, or expired-and-reused). Re-read state with [`getOrder`](functions.md#getorder) / [`getOwnOpenOrders`](functions.md#getownopenorders) before cancelling. |
| `0x8080c2ed` | `IncorrectOrder()` | Order lookup did not resolve to a live order. |
| `0xf5e39c1f` | `IncorrectSender(address caller, address expected)` | Caller is not the order owner (or, for `eth_call`, no `from` was set). For operator flows the owner must authorize the operator - see below. |

### Batch and amend

| Selector | Error | Meaning / fix |
| -------- | ----- | ------------- |
| `0xc2e5347d` | `EmptyBatch()` | A batch method ([`placeOrders`](functions.md#placeorders), [`cancelOrders`](functions.md#cancelorders), [`reduceOrders`](functions.md#reduceorders), [`amendOrders`](functions.md#amendorders), and the `...For` variants) was called with an empty array. Pass at least one request. |
| `0x4723981c` | `AmendReplacementRejected(uint256 requestIndex, uint8 reason)` | Emitted by [`amendOrders`](functions.md#amendorders) when a replacement would neither rest nor fill, naming **which** rung died and why (`reason` is an [`OrderRejectionReason`](types.md#orderrejectionreason-enum)). The batch reverts and the cancelled orders are restored - the no-gap guarantee. Singular [`amendOrder`](functions.md#amendorder) reverts with the bare rejection error instead (e.g. `PostOnlyWouldCross`). |
| `0xb16f4abb` | `AmendOldOrderGone(uint128 oldOrderId)` | The amend's `oldOrderId` was already filled/cancelled by the time the tx landed and the request did not set `alwaysPlace`. Kept distinct from `IncorrectSender` so a maker racing a fill can branch to a re-quote. Set `alwaysPlace = true` to place the replacement anyway. |

### Operators and authorization

| Selector | Error | Meaning / fix |
| -------- | ----- | ------------- |
| `0x3fb0ba2e` | `OnlyApprovedContracts()` | Caller is not authorized for a `...For` call. `placeOrderFor` admits a per-user approval **or** a system-contract allowlist; `cancelOrderFor` / `reduceOrderFor` admit the per-user approval **only**. See [Operators](../../trading/spot/operators.md). |
| `0x118cdaa7` | `OwnableUnauthorizedAccount(address)` | Caller is not the contract owner (admin-only entrypoint). |

### Builder codes

| Selector | Error | Meaning / fix |
| -------- | ----- | ------------- |
| `0x41ec099f` | `BuilderCodesNotSupported()` | Passed a non-zero `builder` while the pool's cap is `0`. Every mainnet and testnet pool currently runs a `100000` (100 BPS) cap, so this should not fire - read [`getMaxBuilderFeeBpsTimes1k()`](functions.md#getmaxbuilderfeebpstimes1k) rather than assuming. |
| `0x6d10926b` | `InvalidBuilder()` | `builderFeeBpsTimes1k != 0` while `builder == address(0)`, or approved `address(0)`. |
| `0x0c9a7210` | `BuilderNotApproved()` | Owner has not called [`approveBuilder`](functions.md#approvebuilder) for this builder. |
| `0x528c953f` | `BuilderFeeExceedsApproval()` | Per-order builder fee exceeds the owner's approval. Read [`getEffectiveBuilderApproval`](functions.md#geteffectivebuilderapproval). |
| `0xf559e808` | `BuilderFeeExceedsCap()` | Approval or cap update exceeds the protocol-wide cap. |
| `0xcd4e6167` | `FeeTooHigh()` | Configured fee exceeds the allowed maximum. |

> [!WARNING]
> **Retired selector.** `AmendReplacementFailed()` (`0x1d98a950`) no longer exists. Decoders keyed on it should map to the per-reason errors above, or to `AmendReplacementRejected(uint256,uint8)` (`0x4723981c`) for the batch surface. It is an error, not an event, so nothing on-chain and no reactivity subscription is affected.

> [!NOTE]
> Admin/config selectors (`InvalidTickSize` `0x747a60fb`, `InvalidLotSize` `0x96a6cd0c`, `InvalidMinQuantity` `0xe4c236aa`, `InconsistentMinQuantityAndLotSize` `0xe94c2d7c`, `InvalidFeeRecipient` `0x768dc598`, `InvalidMidpointEmaParameters` `0xd8879b90`, `InvalidOperatorPermissionsRegistry` `0x6e116665`) are only reachable from owner-only entrypoints and should not appear during normal trading. Internal invariants (`LinkedListCorrupted`, `ReentrancyGuardReentrantCall`, allocator errors) indicate a bug - report them.

## SpotStopOrderRegistry errors

See [Stop Orders](../../trading/spot/stop-orders.md) for the full mechanics.

| Selector | Error | Meaning / fix |
| -------- | ----- | ------------- |
| `0xfa0d8bfd` | `InsufficientSomiPayment()` | `createPendingOrder` requires `msg.value == somiPaymentPerOrder()` **exactly** (under- and over-payment both revert). Re-read it immediately before sending. |
| `0x5eb24725` | `NoActiveSubscription()` | Registry is dormant (`createSubscription` not called, or `removeSubscription` was called). |
| `0xf5a46358` | `TriggerTooCloseToEma()` | `triggerPrice` is within `minStopDistanceBps` of the current EMA midpoint. Move the trigger further out. |
| `0x8b76b49c` | `LimitPriceIncompatibleWithTrigger()` | For a LIMIT stop, `limitPrice` must be on the executable side of `triggerPrice` for the order direction. |
| `0x5cd9bd3a` | `InvalidLimitPrice()` | LIMIT stop with a zero/misaligned `limitPrice`, or a MARKET stop with a non-zero `limitPrice` (MARKET must pass `0`). |
| `0x42e1941c` | `InvalidTriggerPrice()` | Trigger price is zero or otherwise invalid. |
| `0x961ac3e3` | `PriceNotAlignedToTickSize()` | `limitPrice` is not tick-aligned to the SpotPool. |
| `0x4c4705ca` | `QuantityNotAlignedToLotSize()` | Quantity is not a multiple of the SpotPool's `lotSize`. |
| `0x84c3adbe` | `QuantityBelowMinimum()` | Quantity is below the SpotPool's `minQuantity`. |
| `0x14ecd6c7` | `InsufficientVaultBalance()` | Owner's SpotPool vault balance does not cover the order's collateral at creation time. |
| `0xc32ff34d` | `InvalidOrderOwner()` | `order.owner` does not match the caller. |
| `0x5dcaf2d7` | `OrderDoesNotExist()` | No pending order for that `OrderId`. |
| `0x71fa8de6` | `OrderIdMismatch()` | Supplied `OrderId` no longer matches stored state. |
| `0x969bf728` | `NothingToClaim()` | `claimSomi()` with a zero unclaimed balance. |
| `0xe72f2f75` | `SubscriptionStillActive()` | `cancelInertOrders` while the registry still has an active subscription. |

## Preflight (HTTP API) reverts

The HTTP `prepare order` endpoint simulates the transaction. A returned `success: false` / `orderId: 0` means the simulated call reverted - decode the revert data with the tables above. Backend-side decoding of these reasons into the API response is tracked separately; until then, decode the selector client-side.
