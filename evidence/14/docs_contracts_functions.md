# Functions

## SpotPool / OrderBook

The SpotPool contract exposes the order book API and the integrated vault API. Functions are grouped by purpose: order management, vault, market data, mark price (EMA), and builder codes. Admin-only entrypoints (parameter updates, beacon upgrades, etc.) are not documented here — they are reserved for the protocol owner and emit events that are listed on the [Events](events.md) page.

### Auto-pull and auto-deliver

By **default** the pool moves funds between your wallet and the vault for you — no manual `deposit` / `withdraw` step:

* **Auto-pull.** [`placeOrder`](functions.md#placeorder) (or an operator's [`placeOrderFor`](functions.md#placeorderfor)) pulls the worst-case `principal + max(makerFee, takerFee) + builderFee` straight from your **wallet** — ERC-20 `transferFrom` (approve the pool once per input token) or native `msg.value` — then credits the vault and locks it. Call [`getAutoPullRequirement`](functions.md#getautopullrequirement) to read the exact wallet spend before placing.
* **Auto-deliver.** On fill, cancel, or expiry, proceeds flow **back to your wallet** automatically. If delivery to the recipient fails, the pool falls back to a vault credit and emits [`PayoutFallbackToVault`](events.md#payoutfallbacktovault) — withdraw it normally.

**Manual vault mode (opt-out).** Market makers / HFT integrators who manage their own funds can opt out per pool with [`setManualVaultMode(true)`](functions.md#setmanualvaultmode). Manual mode restores the legacy discipline: [`deposit`](functions.md#deposit) first, place against the vault balance, and [`withdraw`](functions.md#withdraw) proceeds yourself. Each order captures its delivery mode at placement, so toggling the flag never affects orders already resting.

### Funding source to function map

There is **one placement entrypoint** for every funding source and order type - [`placeOrder`](functions.md#placeorder). Which funds it uses is determined by your per-pool [`setManualVaultMode`](functions.md#setmanualvaultmode) flag, not by a different function:

| You want to…                                   | Function                                                                         | Notes                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Fund from your **wallet** (default)            | [`placeOrder`](functions.md#placeorder)                                          | Auto-pulls input at order time; approve the pool once per ERC-20, or send `msg.value` on native pools. Supports **all** order types, including resting GTC / PostOnly. |
| Fund from a pre-deposited **vault** balance    | [`setManualVaultMode(true)`](functions.md#setmanualvaultmode) → [`placeOrder`](functions.md#placeorder) | [`deposit`](functions.md#deposit) / [`depositNative`](functions.md#depositnative) first; proceeds settle to the vault. |
| Place **for another owner** (operator/session key) | [`placeOrderFor`](functions.md#placeorderfor)                                | Requires the owner's `placeOrderFor` approval. Funds follow the owner's mode. |

> [!CAUTION]
> `placeTakerOrderWithoutVault` was removed and no longer exists on the deployed contract. Earlier integration guides pointed wallet-funded takers at this function. Use the default auto-pull [`placeOrder`](functions.md#placeorder) instead — it covers every order type (GTC, IOC, FOK, PostOnly).

### Order Management

#### `placeOrder`

Places a new order in the order book for the caller. By default the pool **auto-pulls** the required input from the caller's wallet and **auto-delivers** proceeds back to it (see [Auto-pull and auto-deliver](functions.md#auto-pull-and-auto-deliver)); in [manual vault mode](functions.md#setmanualvaultmode) it draws from — and settles to — the caller's internal vault balance instead.

```solidity
function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, OrderType orderType, SelfMatchingOption selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) external payable returns (bool success, OrderId orderId);
```

| Parameter              | Type                                                     | Description                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isBid`                | `bool`                                                   | True for a buy (bid) order, false for a sell (ask) order                                                                                                                |
| `userData`             | `uint64`                                                 | Arbitrary 64-bit user data attached to the order (not used by the contract)                                                                                             |
| `price`                | `uint256`                                                | Limit price for the order; must be a multiple of tickSize                                                                                                               |
| `quantity`             | `uint256`                                                | Order quantity; must be >= minQuantity and a multiple of lotSize                                                                                                        |
| `expireTimestampNs`    | `uint64`                                                 | Expiration timestamp in nanoseconds (Must be a future value)                                                                                                            |
| `orderType`            | [`OrderType`](types.md#ordertype-enum)                   | Execution type: NormalOrder, FillOrKill, ImmediateOrCancel, or PostOnly                                                                                                 |
| `selfMatchingOption`   | [`SelfMatchingOption`](types.md#selfmatchingoption-enum) | Behavior when order would match against caller's own orders                                                                                                             |
| `builder`              | `address`                                                | Optional builder address that earns a fee on this order's fills. Use `address(0)` to omit. See [Builder Codes](functions.md#builder-codes).                             |
| `builderFeeBpsTimes1k` | `uint96`                                                 | Per-order builder fee rate in BPS\_TIMES\_1K units. Must be `0` when `builder` is `address(0)`; otherwise must satisfy the caller's approval and the protocol-wide cap. |

**Returns:** `success`: always `true`. An order the pool cannot honour (a crossed `PostOnly`, a `FillOrKill` that cannot fill in full, an `ImmediateOrCancel` that fills nothing, a past expiry) reverts with the matching error in [Contract errors](errors.md) rather than returning `false`; use [`placeOrders`](functions.md#placeorders) if you need a per-order flag instead of a revert. `orderId`: Unique identifier for the order; use this to cancel or query the order.

> [!CAUTION]
> **A rejected order now reverts — it no longer returns `success = false`.** The signature is unchanged and `success` is still returned, but the only way to observe a rejection on the singular surface is to catch the revert. A transaction can no longer report success for an order that achieved nothing.
>
> The five rejection reasons are all **custom errors**, so a `catch Error(string)` clause will **not** match them — use `catch (bytes memory)` or a bare `catch`:
>
> | Error | Selector | Raised when |
> | ----- | -------- | ----------- |
> | `OrderAlreadyExpired()` | `0x3154078e` | `expireTimestampNs` is at or before the current block time. |
> | `SelfMatchCancelTaker()` | `0x6ffc9258` | The order would match the caller's own resting order under `SelfMatchingOption.CancelTaker`. |
> | `PostOnlyWouldCross()` | `0x7cf05fcb` | A `PostOnly` order would have filled immediately instead of resting. |
> | `FillOrKillNotFillable()` | `0xc04ad919` | A `FillOrKill` order could not be filled in full. |
> | `ImmediateOrCancelNoFill()` | `0xd48c4403` | An `ImmediateOrCancel` order filled nothing at all. |
>
> Malformed input (`QuantityBelowMinimum`, `InvalidPrice`, `InvalidQuantity`, insufficient funds, builder rejection) is a **separate class** and reverts as it always has. See [Errors](errors.md#order-rejection).
>
> Placing many orders? Use [`placeOrders`](functions.md#placeorders) instead — it keeps a per-request `bool[]` so one dead rung cannot discard a whole re-ladder.

> [!NOTE]
> **Builder codes are gated by the protocol-wide cap.** The per-order builder fee is bounded by `getMaxBuilderFeeBpsTimes1k()`; when that cap is `0`, passing a non-zero `builder` reverts with `BuilderCodesNotSupported`. Builder codes are **live on both mainnet and testnet** — the cap is `100000` (100 BPS = 1%) on every pool on both networks. Read the cap at runtime rather than assuming a value. To tag an order, the owner must first [`approveBuilder`](functions.md#approvebuilder); otherwise pass `address(0)` and `0`.

> [!WARNING]
> **`expireTimestampNs` must be in the future.** Pass a nanosecond Unix timestamp strictly greater than the current block time. There is no "no expiry" sentinel — `0`, past, or current-time values are rejected. Build it from seconds with `now_seconds * 1e9`, plus your desired lifetime in nanoseconds.

> [!WARNING]
> **Native-base pools need extra gas on BUYs (≥ 5,000,000).** On native-base pools (e.g. SOMI/USDso), the native-token payout path enforces a gas headroom guard before transferring SOMI to the buyer. If the broadcast gas limit is too low, the call reverts with `InsufficientGasForPayout(uint256 gasLeft)` (selector `0x782b2567`), where `gasLeft` is the remaining gas at the guard. Reaching the guard costs \~256k; up to \~2.1M is forwarded to the recipient's `receive()` (mostly unused for EOAs, so actual `gasUsed` stays low) — the limit just has to clear the headroom check. **Set the tx gas limit ≥ 5,000,000 on native-base BUYs. Simulate (`eth_call`) with the same gas limit you broadcast** — otherwise the sim is dishonest and greenlights txs that will revert on inclusion.

***

#### `placeOrderFor`

Places an order **on behalf of `owner`**, callable by an operator the owner has approved. Authorization is granted by `owner` in the [OperatorPermissionsRegistry](../../trading/spot/operators.md) for the `placeOrderFor` selector (`0x80054449`) — or, for protocol system contracts, via the owner-managed contract allowlist. The order is owned by, and (under auto-pull) settles to, `owner`; the operator never receives funds. See [Operators & session keys](../../trading/spot/operators.md).

```solidity
function placeOrderFor(address owner, bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, OrderType orderType, SelfMatchingOption selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) external payable returns (bool success, OrderId orderId);
```

Parameters match [`placeOrder`](functions.md#placeorder) with a leading `owner` (the order owner). Reverts with `OnlyApprovedContracts` if the caller is not authorized by `owner` for this selector, and with the same [rejection errors](functions.md#placeorder) as `placeOrder` when the book cannot honour the order.

> [!WARNING]
> **Contracts calling `placeOrderFor` must tolerate a revert.** If your contract places on behalf of users in a loop (a market maker's quote ladder, a router's legs, a keeper's triggered orders), one rejected order will now unwind the whole transaction unless you wrap the call. Wrap it in `try` / `catch (bytes memory)` and decide per call site whether to skip that item or re-raise. Never route the call through your own contract to manufacture a `try`/`catch` boundary — call the pool directly.
>
> An **empty** revert (`reason.length == 0`) is a child-frame out-of-gas, **not** a rejection. Report it separately rather than folding it into "the book said no", or a gas-starved call will be recorded as a decision the pool made.

***

#### `cancelOrder`

Cancels an existing order and returns any remaining locked funds (per the order's delivery mode: to the owner's wallet under auto-pull, or to their withdrawable vault balance in manual mode).

```solidity
function cancelOrder(OrderId orderId) external;
```

**Reverts.** `cancelOrder` reverts rather than no-ops if the order is not cancellable by the caller:

* `OrderIdMismatch` (`0x71fa8de6`) - the slot no longer holds that `OrderId`. The order is already in a terminal state (filled, cancelled, or expired-and-reused) - there is nothing to cancel.
* `IncorrectSender` (`0xf5e39c1f`) - the caller does not own the order. Operators must use [`cancelOrderFor`](functions.md#cancelorderfor).

There is no `isOrderFillable`-style predicate; **check order state first** to avoid a wasted revert. [`getOrder(orderId)`](functions.md#getorder) returns the live order (a mismatched/absent order signals it is terminal), and [`getOwnOpenOrders()`](functions.md#getownopenorders) lists your still-open IDs. Full selector list on the [Errors](errors.md) page.

***

#### `cancelOrderFor`

Cancels an order **on behalf of `owner`**, callable by an operator the owner has approved for the `cancelOrderFor` selector (`0xe37b444b`) in the [OperatorPermissionsRegistry](../../trading/spot/operators.md). Unlike `placeOrderFor`, the system-contract allowlist does **not** admit callers here — only the owner's per-user approval does. Freed funds always return to `owner` (wallet or vault per the order's delivery mode), never the operator.

```solidity
function cancelOrderFor(address owner, OrderId orderId) external;
```

***

#### `reduceOrder`

Reduces the remaining quantity of an existing order. The new quantity must be smaller than the current remaining and must respect `minQuantity` and `lotSize`. Reverts with `ExpiredOrderMustBeCancelled` if the order is past its expiration — expired orders must be cancelled via [`cancelOrder`](functions.md#cancelorder).

```solidity
function reduceOrder(OrderId orderId, uint256 newQuantityRemaining) external;
```

***

#### `reduceOrderFor`

Reduces an order's remaining quantity **on behalf of `owner`**, callable by an operator the owner has approved for the `reduceOrderFor` selector (`0x364c2587`) in the [OperatorPermissionsRegistry](../../trading/spot/operators.md). Per-user approval only (no system allowlist). Freed funds return to `owner`. Reverts with `ExpiredOrderMustBeCancelled` on an expired order — use [`cancelOrderFor`](functions.md#cancelorderfor) instead.

```solidity
function reduceOrderFor(address owner, OrderId orderId, uint256 newQuantityRemaining) external;
```

***

#### `placeOrders`

Places multiple orders for the caller in one transaction — a thin batch wrapper applying each [`PlaceOrderRequest`](types.md#placeorderrequest-struct) through the same path as [`placeOrder`](functions.md#placeorder), in array order. **Best-effort per order:** `successes[i]` is `false` for a benign non-placement (already-expired, PostOnly-crossed, unfilled FillOrKill, IOC no-fill, or CancelTaker self-match) with `ids[i]` zero. A hard validation error on any request (bad price/lot/quantity, insufficient funds, builder rejection) reverts the **entire** batch. Reverts with `EmptyBatch` if `requests` is empty.

> [!TIP]
> **This is the surface to use when placing many orders.** Unlike singular [`placeOrder`](functions.md#placeorder), a rejected request here does **not** revert — it flags that one entry and lets the rest of the batch commit, so a single dead rung cannot discard an entire re-ladder. Read `successes[i]` for the pass/fail and the matching `OrderRejected` log for the reason.

```solidity
function placeOrders(PlaceOrderRequest[] calldata requests) external returns (bool[] memory successes, OrderId[] memory ids);
```

**Returns:** `successes` and `ids`, aligned index-for-index with `requests` (`ids[i]` is zero where `successes[i]` is false). **Best-effort per order:** unlike singular [`placeOrder`](functions.md#placeorder), a request the pool refuses (crossed `PostOnly`, unfillable `FillOrKill`, `ImmediateOrCancel` with no fill, past expiry) does **not** revert the batch; it is flagged `false` and the rest commit.

> [!WARNING]
> **Batch placement is non-payable.** It cannot auto-pull native `msg.value` — fund native-token orders by pre-depositing to the vault (auto-pull then draws the vault balance) or place them one at a time with [`placeOrder`](functions.md#placeorder). ERC-20 wallet auto-pull works normally per request.

***

#### `placeOrdersFor`

Places multiple orders **on behalf of `owner`**, same batch semantics as [`placeOrders`](functions.md#placeorders). Authorization is checked once for the whole batch and reuses the `placeOrderFor` grant (selector `0x80054449`) — there is no separate batch selector. Non-payable (see [`placeOrders`](functions.md#placeorders)). Reverts with `OnlyApprovedContracts` if the caller is not authorized by `owner`.

```solidity
function placeOrdersFor(address owner, PlaceOrderRequest[] calldata requests) external returns (bool[] memory successes, OrderId[] memory ids);
```

***

#### `cancelOrders`

Cancels multiple orders owned by the caller in one transaction, **best-effort (skip-stale)**. Any id that is no longer cancellable — already filled, cancelled, expired-and-swept, or not owned by the caller — is **skipped**, not reverted, so a single rung filling in a fast market no longer aborts pulling the rest of a ladder. Only the empty-array `EmptyBatch` pre-check reverts.

```solidity
function cancelOrders(OrderId[] calldata orderIds) external returns (bool[] memory cancelled);
```

**Returns:** `cancelled[i]` is `true` where the order was live and cancelled, `false` where it was skipped. A `false` entry does **not** disambiguate *why* (a benign race vs. a wrong id or wrong `owner`) — re-check the id independently if that distinction matters. Only a contract caller can read the return value; an EOA reconciles from the per-cancel [`OrderCancelled`](events.md#ordercancelled) / [`OrderExpired`](events.md#orderexpired) events (a skipped id emits nothing).

***

#### `cancelOrdersFor`

Cancels multiple orders **on behalf of `owner`**, same best-effort skip-stale semantics as [`cancelOrders`](functions.md#cancelorders). Authorization is checked once and reuses the `cancelOrderFor` grant (`0xe37b444b`) — the system-contract allowlist does **not** admit callers here. Freed funds always flow to `owner`.

```solidity
function cancelOrdersFor(address owner, OrderId[] calldata orderIds) external returns (bool[] memory cancelled);
```

***

#### `reduceOrders`

Reduces multiple orders owned by the caller in one transaction — a thin batch wrapper over [`reduceOrder`](functions.md#reduceorder). **Atomic:** if any reduction is invalid (not owned, id mismatch, expired, below minimum, not lot-aligned, or above current remaining) the **whole batch reverts**. Reverts with `EmptyBatch` if `requests` is empty.

```solidity
function reduceOrders(ReduceOrderRequest[] calldata requests) external;
```

***

#### `reduceOrdersFor`

Reduces multiple orders **on behalf of `owner`**, same atomic semantics as [`reduceOrders`](functions.md#reduceorders). Authorization is checked once and reuses the `reduceOrderFor` grant (`0x364c2587`). Freed funds always flow to `owner`.

```solidity
function reduceOrdersFor(address owner, ReduceOrderRequest[] calldata requests) external;
```

***

#### `amendOrder`

Atomically **cancels `oldOrderId` and places a replacement** in one call, returning a **new** `OrderId`. Cancel-first frees the old order's funds so the replacement reuses them and the two can never self-match. Because the replacement is a fresh order, callers **must** update local tracking to `newOrderId` — [`getOrder(oldOrderId)`](functions.md#getorder) reverts afterward.

The replacement is inserted at the **back** of the price-time queue for its price; this is not a priority-preserving resize. To only shrink quantity while keeping queue priority, use [`reduceOrder`](functions.md#reduceorder) instead.

```solidity
function amendOrder(AmendOrderRequest calldata request) external returns (OrderId newOrderId);
```

* **No-gap guarantee.** If the replacement would neither rest nor fill (a crossed PostOnly, unfilled FillOrKill, IOC that took nothing, already-expired order, or CancelTaker self-match), the whole amend reverts with the replacement's own rejection error (see [Order rejection](errors.md#order-rejection)) and, when the cancel ran, the original order is left in place.
* **Race handling (`alwaysPlace`).** If `oldOrderId` is already filled/cancelled by the time the tx lands, the default (`alwaysPlace = false`) reverts `AmendOldOrderGone` and places nothing — the industry-standard reject, kept distinct from the ownership errors so a maker racing a fill can branch to a re-quote. Set `alwaysPlace = true` to skip the (impossible) cancel and place the replacement anyway (opt-in upsert). `alwaysPlace` never skips an ownership failure (a live order owned by another still reverts `IncorrectSender`) and never relaxes the no-gap check.

> [!WARNING]
> **Amend is non-payable** — native (`msg.value`) auto-pull is unavailable. Fund a native-token replacement from a **manual-vault** balance; for an auto-pull owner the cancel leg auto-delivers the freed native back to the wallet, leaving nothing for the (non-payable) place to draw on.

***

#### `amendOrders`

Atomically cancels and replaces **multiple** orders in one call (re-ladder). All `oldOrderId`s are cancelled first, then all replacements placed, so a replacement never matches a not-yet-cancelled old order. **Fully atomic:** if any cancel or replacement fails (including a replacement that does not rest or fill) the whole batch reverts and no change takes effect — re-laddering never leaves a gap. Replacements are **not** shielded from one another: an overlapping later rung can cross one placed earlier (per that request's `selfMatchingOption`); a re-ladder of non-overlapping rungs never hits this. Per-request `alwaysPlace` applies the same race rule as [`amendOrder`](functions.md#amendorder). Non-payable. Reverts with `EmptyBatch` if `requests` is empty.

```solidity
function amendOrders(AmendOrderRequest[] calldata requests) external returns (OrderId[] memory newOrderIds);
```

**Returns:** `newOrderIds`, aligned index-for-index with `requests`.

***

#### `amendOrderFor`

Amends an order **on behalf of `owner`**, same semantics as [`amendOrder`](functions.md#amendorder). Because an amend is a cancel followed by a place, the caller must hold **both** the `cancelOrderFor` (`0xe37b444b`) **and** `placeOrderFor` (`0x80054449`) grants for `owner` — there is no separate amend selector. Requiring `placeOrderFor` also lets the replacement's auto-pull draw from `owner`'s wallet. The system-contract allowlist does **not** admit callers here. Funds always flow to `owner`.

```solidity
function amendOrderFor(address owner, AmendOrderRequest calldata request) external returns (OrderId newOrderId);
```

***

#### `amendOrdersFor`

Re-ladders **on behalf of `owner`**, same fully-atomic semantics as [`amendOrders`](functions.md#amendorders) with the same dual-grant authorization as [`amendOrderFor`](functions.md#amendorderfor) (the caller must hold both `cancelOrderFor` and `placeOrderFor` for `owner`). Non-payable. Funds always flow to `owner`.

```solidity
function amendOrdersFor(address owner, AmendOrderRequest[] calldata requests) external returns (OrderId[] memory newOrderIds);
```

***

#### `cancelExpiredOrders`

Permissionless cleanup for expired orders identified by ID. For each order, locked balances are returned to the owner's withdrawable balance and `OrderExpired` is emitted. Orders that are not expired or whose stored ID no longer matches the supplied ID are silently skipped rather than reverted.

```solidity
function cancelExpiredOrders(OrderId[] calldata orderIds) external;
```

***

#### `sweepExpiredAtLevel`

Permissionless cleanup for expired orders at a single price level. Walks the priority chain from the best order on the requested side and cleans up to `maxCount` expired orders found at exactly `price`. Useful for keeping the top of book clean after the head order expires.

```solidity
function sweepExpiredAtLevel(bool isBid, uint256 price, uint256 maxCount) external returns (uint256 cleaned);
```

**Returns:** the number of orders actually cleaned.

***

### Vault

#### `deposit`

Deposits ERC20 tokens into the on-chain vault, updating the caller's internal balance. The token must be either the base or quote token of the market.

```solidity
function deposit(address token, uint256 amount) external;
```

> [!NOTE]
> For native-token markets, use `depositNative()` instead. Calling `deposit()` with the native token sentinel reverts with `UseDepositNative`.

***

#### `depositNative`

Deposits native tokens into the vault. The deposit amount is `msg.value`. Only valid on pools where one side of the pair is the native token.

```solidity
function depositNative() external payable;
```

***

#### `withdraw`

Withdraws tokens from the caller's internal vault balance back to their wallet. Reverts with `InsufficientBalance` if the user's free balance is insufficient.

```solidity
function withdraw(address token, uint256 amount) external;
```

***

#### `getWithdrawableBalance`

Returns the free (withdrawable) balance for a given owner and token. This is the balance not currently locked in open orders.

```solidity
function getWithdrawableBalance(address owner, address token) external view returns (uint256);
```

> [!WARNING]
> **Native SOMI uses a sentinel address, not `address(0)`.** The vault tracks native SOMI under the constant `NATIVE_TOKEN = 0x28f34DeFd2b4CB48d9eE6d89f2Be4Bc601694c00`. Querying `getWithdrawableBalance(owner, address(0))` returns `0` and makes native funds look missing - pass the sentinel instead. To resolve the correct `token` argument for any pool generically, read the pool's base/quote (`getPoolParams()`, or the `base`/`quote` from [`GET /v0/markets`](../http-api/market-data.md)): a native side is reported as this sentinel. The same address is the `token` argument for [`withdraw`](functions.md#withdraw); fund with [`depositNative()`](functions.md#depositnative) (not `deposit(NATIVE_TOKEN, ...)`, which reverts with `UseDepositNative`).

***

#### `getOwnLockedBalance`

Returns the total base and quote tokens locked across all of the caller's orders that still occupy a slot in the book, including expired-but-unswept orders. Scoped to `msg.sender`. Locked amounts include the maker + builder fee headroom reserved at placement. For the free (withdrawable) balance, use [`getWithdrawableBalance`](functions.md#getwithdrawablebalance).

```solidity
function getOwnLockedBalance() external view returns (uint256 lockedBase, uint256 lockedQuote);
```

***

#### `getLockedTokenBreakdown`

Returns a pool-wide breakdown of locked tokens for the base and quote tokens, aggregated across every user. For each token the fields are exhaustive and disjoint — `principalLocked + lockedSurplus + leftover` equals the pool's on-chain balance of that token — so the result doubles as a solvency reconciliation. Walks the entire book (O(n) in resting orders); intended for off-chain / `eth_call` use.

```solidity
function getLockedTokenBreakdown() external view returns (TokenLockBreakdown memory base, TokenLockBreakdown memory quote);
```

See [`TokenLockBreakdown`](types.md#tokenlockbreakdown-struct).

***

#### `setManualVaultMode`

Opts the caller **out of** (or back into) auto-pull, per pool. When enabled, [`placeOrder`](functions.md#placeorder) / [`placeOrderFor`](functions.md#placeorderfor) draw from and settle to the caller's vault balance instead of their wallet — the legacy `deposit` → place → `withdraw` discipline used by market makers and HFT integrators. Default is `false` (auto-pull on). Emits [`ManualVaultModeUpdated`](events.md#manualvaultmodeupdated). Does not affect orders already on the book.

```solidity
function setManualVaultMode(bool enabled) external;
```

***

#### `getManualVaultMode`

Returns whether `user` has opted out of auto-pull on this pool.

```solidity
function getManualVaultMode(address user) external view returns (bool enabled);
```

***

#### `isOperatorAuthorized`

Returns whether `operator` is permitted to invoke `selector` on behalf of `owner` on this pool — the same yes/no the pool enforces inside `placeOrderFor` / `cancelOrderFor` / `reduceOrderFor`. Equivalent to `registry != address(0) && registry.isApproved(owner, operator, selector, address(this))`. For an answer spanning every pool the registry covers, query the [OperatorPermissionsRegistry](../../trading/spot/operators.md) directly.

```solidity
function isOperatorAuthorized(address owner, address operator, bytes4 selector) external view returns (bool authorised);
```

***

#### `getAutoPullRequirement`

Returns the worst-case wallet input an order will consume under auto-pull — `principal + max(makerFee, takerFee) + builderFee` (ceil-rounded for fees). Use it to size a native `msg.value` or an ERC-20 approval before placing. `delta` is the shortfall versus the owner's current free vault balance (zero if the vault already covers the requirement).

```solidity
function getAutoPullRequirement(address owner, bool isBid, uint256 price, uint256 quantity, uint96 builderFeeBpsTimes1k) external view returns (address inputToken, uint256 requiredAmount, uint256 delta);
```

***

### Market Data and Configuration

#### `getOrder`

Retrieves the details of an order by its ID.

```solidity
function getOrder(OrderId orderId) external view returns (Order memory);
```

See [`Order`](types.md#order-struct).

***

#### `getOwnOpenOrders`

Returns all open (non-expired) order IDs owned by the caller.

```solidity
function getOwnOpenOrders() external view returns (OrderId[] memory);
```

***

#### `getBookLevels`

Returns aggregated order book levels for the bid or ask side.

```solidity
function getBookLevels(bool isBid, uint64 numLevels) external view returns (OrderBookLevel[] memory);
```

See [`OrderBookLevel`](types.md#orderbooklevel-struct).

***

#### `getPoolParams`

Returns all pool configuration parameters in a single call.

```solidity
function getPoolParams() external view returns (address baseToken_, address quoteToken_, uint256 makerFeeBpsTimes1k_, uint256 takerFeeBpsTimes1k_, uint256 tickSize_, uint256 minQuantity_, uint256 lotSize_);
```

The call returns **seven** values in this exact order. When decoding by position, use the ordering below — note that `makerFeeBpsTimes1k_` precedes `takerFeeBpsTimes1k_` here, the reverse of the field order in the [`SpotPoolParameters`](types.md#spotpoolparameters-struct) struct.

| # | Return value          | Type      | Description                                          |
| - | --------------------- | --------- | ---------------------------------------------------- |
| 1 | `baseToken_`          | `address` | Base token contract address                          |
| 2 | `quoteToken_`         | `address` | Quote token contract address (USDso)                 |
| 3 | `makerFeeBpsTimes1k_` | `uint256` | Maker fee rate in basis points x 1000 (1 BPS = 1000) |
| 4 | `takerFeeBpsTimes1k_` | `uint256` | Taker fee rate in basis points x 1000 (1 BPS = 1000) |
| 5 | `tickSize_`           | `uint256` | Minimum price increment, in raw quote-token units    |
| 6 | `minQuantity_`        | `uint256` | Minimum order quantity, in raw base-token units      |
| 7 | `lotSize_`            | `uint256` | Minimum quantity increment, in raw base-token units  |

##### Quantizing price and quantity

`tickSize`, `minQuantity`, and `lotSize` are returned in **raw integer token units** (value × 10^decimals). The contract rejects any `price` that is not a whole multiple of `tickSize` (`InvalidPrice`, selector `0xaf608abb`) and any `quantity` that is not a whole multiple of `lotSize` (`InvalidQuantity`, `0x4f174b29`) or is below `minQuantity` (`QuantityBelowMinimum`, `0xeaa68ceb`). Do the arithmetic in integers - never round a float and hope. Snap **toward the book** (round a bid price down / an ask price up; floor the quantity) so you never exceed the user's intent:

```ts
// All values are native BigInt in raw on-chain units.
// price/quantity are the user's raw-unit intent; params from getPoolParams().
function quantize(price: bigint, quantity: bigint, tickSize: bigint, lotSize: bigint, minQuantity: bigint, isBid: boolean) {
  // Price: round to the nearest tick, biased toward the book.
  const qPrice = isBid
    ? (price / tickSize) * tickSize                       // bid: round down
    : ((price + tickSize - 1n) / tickSize) * tickSize;    // ask: round up

  // Quantity: floor to a whole lot, then enforce the minimum.
  const qQuantity = (quantity / lotSize) * lotSize;
  if (qQuantity < minQuantity) throw new Error(`below minQuantity: ${qQuantity} < ${minQuantity}`);
  if (qPrice === 0n) throw new Error("price rounds to zero - below one tick");

  return { price: qPrice, quantity: qQuantity };
}
```

To convert a human-readable decimal to raw units without float error, scale the string by `10^decimals` with integer math (e.g. `parseUnits` in viem/ethers), then quantize. The equivalent `invalid_price` / `invalid_amount` [HTTP API errors](../http-api/error-handling.md) have the same cause.

***

#### `getOrderBookParameters`

Returns the order book configuration parameters as a struct.

```solidity
function getOrderBookParameters() external view returns (OrderBookParameters memory);
```

See [`OrderBookParameters`](types.md#orderbookparameters-struct).

***

#### `getAllOpenOrdersOffChain`

Paginated iteration of all open orders on one side of the book. This function can only be called via `eth_call` (off-chain) — `msg.sender` must be `address(0)`.

```solidity
function getAllOpenOrdersOffChain(bool isBid, uint256 maxCount, uint64 startCursor) external view returns (Order[] memory orders, bool hasMoreOrders, uint64 nextCursor);
```

***

#### `convertToQuoteAtPriceCeil`

Converts a base token quantity to its equivalent quote token amount at a given price, rounding up. Useful for estimating the cost of a bid order.

```solidity
function convertToQuoteAtPriceCeil(uint256 baseQuantity, uint256 priceQuote) external view returns (uint256);
```

***

### Mark Price (EMA-Smoothed Midpoint)

The SpotPool emits [`MarkPriceUpdated`](events.md#markpriceupdated) whenever the order book midpoint advances. The emitted `markPrice` is an **EMA-smoothed** value over the raw midpoint `(bestBid + bestAsk) / 2`, advancing at most one step per `updateIntervalSec`. The raw midpoint is also exposed on the event for off-chain consumers (UIs, indexers) but **must not** be used as a trigger feed — the smoothing is the protection against single-block midpoint manipulation.

#### `getMidpointEmaParameters`

Returns the current EMA configuration.

```solidity
function getMidpointEmaParameters() external view returns (MidpointEmaParameters memory);
```

See [`MidpointEmaParameters`](types.md#midpointemaparameters-struct). The struct is `(uint256 updateIntervalSec, uint256 emaSmoothingAlpha)`, where `emaSmoothingAlpha` is scaled by `1e18` (higher = closer to the raw midpoint / less smoothing).

**Current mainnet values** (identical across all four pools): `updateIntervalSec = 1` and `emaSmoothingAlpha = 0.2` (`2e17`). So the mark price advances at most once per second, and each step moves 20% of the way from the previous EMA toward the raw midpoint - a step lag that stop triggers ([Stop Orders](../../trading/spot/stop-orders.md)) inherit. These are admin-tunable; read the live values from this call rather than assuming.

***

#### `getMidpointEmaState`

Returns the live EMA midpoint and the timestamp of the most recent advance.

```solidity
function getMidpointEmaState() external view returns (uint256 emaValue, uint64 lastUpdateNs);
```

`emaValue` is zero before the first book event triggers the bootstrap branch.

***

### Builder Codes

Builder codes let an order owner route a per-fill fee to a third-party integrator (a "builder") that submits the order on their behalf. Two parameters on [`placeOrder`](functions.md#placeorder) and [`placeOrderFor`](functions.md#placeorderfor) — `builder` and `builderFeeBpsTimes1k` — opt an order into this flow. The fee is paid in addition to the protocol maker/taker fee, in the same token (quote for bids, base for asks), and is settled per fill to the builder's vault balance.

> [!NOTE]
> **Availability.** Builder codes are gated by an admin-controlled protocol cap (`getMaxBuilderFeeBpsTimes1k()`). When the cap is `0`, any non-zero `builder` reverts with `BuilderCodesNotSupported`. Builder codes are **live on mainnet and testnet**: the cap is currently `100000` (100 BPS = 1%) on every pool on both networks. Always read the current cap at runtime.

#### `approveBuilder`

Approves (or revokes) a builder for the caller, granting the builder the right to charge a per-fill fee up to `maxFeeBpsTimes1k` on orders the caller submits with that builder code. Set `maxFeeBpsTimes1k` to `0` to revoke.

```solidity
function approveBuilder(address builder, uint256 maxFeeBpsTimes1k) external;
```

| Parameter          | Type      | Description                                                                                                      |
| ------------------ | --------- | ---------------------------------------------------------------------------------------------------------------- |
| `builder`          | `address` | The builder address to approve (cannot be `address(0)`)                                                          |
| `maxFeeBpsTimes1k` | `uint256` | The maximum per-order builder fee rate in BPS\_TIMES\_1K units. Must be `<=` the protocol-wide cap. `0` revokes. |

***

#### `getMaxBuilderFeeBpsTimes1k`

Returns the protocol-wide cap on per-user→builder approvals. A return value of `0` disables builder codes (every non-zero `builder` reverts with `BuilderCodesNotSupported`). Currently `100000` (100 BPS = 1%) on mainnet and `0` on testnet.

```solidity
function getMaxBuilderFeeBpsTimes1k() external view returns (uint256);
```

***

#### `getBuilderApproval`

Returns the raw maximum builder fee a user has approved for a given builder. The returned value can exceed the current protocol-wide cap if the cap was lowered after the approval was set — at order time the effective limit is clamped by the cap.

```solidity
function getBuilderApproval(address user, address builder) external view returns (uint256);
```

***

#### `getEffectiveBuilderApproval`

Returns the per-order builder fee actually enforceable at order time: `min(getBuilderApproval(user, builder), getMaxBuilderFeeBpsTimes1k())`. Use this from off-chain consumers (UIs, builder dashboards) to read the same ceiling the chain will charge.

```solidity
function getEffectiveBuilderApproval(address user, address builder) external view returns (uint256);
```

***

## Stop Orders (SpotStopOrderRegistry)

For the full stop-order mechanics, see [Stop Orders](../../trading/spot/stop-orders.md).

### User Functions

#### `createPendingOrder`

Creates a new pending stop order with a trigger condition. The order remains pending until the mark price crosses the trigger threshold, at which point it is automatically placed on the SpotPool as an IOC order. Requires an **exact** SOMI payment matching `somiPaymentPerOrder()` (both underpayment and overpayment revert with `InsufficientSomiPayment`).

```solidity
function createPendingOrder(PendingOrderWithTrigger calldata orderWithTrigger) external payable returns (OrderId pendingOrderId);
```

| Parameter          | Type                                                                 | Description                                                                          |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `orderWithTrigger` | [`PendingOrderWithTrigger`](types.md#pendingorderwithtrigger-struct) | Complete order specification with trigger conditions                                 |
| `msg.value`        | SOMI (native)                                                        | Must equal `somiPaymentPerOrder()` exactly. Refunded on cancel, consumed on trigger. |

**Validation:** Quantity must be >= the SpotPool's `minQuantity` and a multiple of `lotSize`. For LIMIT orders, `limitPrice` must be tick-aligned. For MARKET orders, `limitPrice` must be exactly `0` (slippage is applied to the mark price at trigger time). If `minStopDistanceBps` is non-zero, the trigger price must be at least that distance from the current EMA midpoint. The owner's vault balance must already cover the order's collateral lock at creation time. The registry must have an active subscription — calls revert with `NoActiveSubscription` while dormant.

**Builder codes:** The struct carries `builder` and `builderFeeBpsTimes1k`. When the resulting IOC order is placed on the SpotPool at trigger time it is validated against the SpotPool's protocol-wide cap and the owner's [`approveBuilder`](functions.md#approvebuilder) record — set both fields to `address(0)` / `0` unless the owner has already approved the builder. See [Builder Codes](functions.md#builder-codes).

> [!WARNING]
> The registry does **not** escrow tokens. The vault-balance check at creation time is a point-in-time snapshot; if the owner withdraws collateral before the order triggers, the triggered placement fails gracefully and the order is removed.

***

#### `cancelPendingOrder`

Cancels a pending stop order and refunds the SOMI paid at creation. If the refund transfer fails (e.g., the owner is a contract without a `receive`/`fallback`), the cancellation still succeeds and the refund is credited to the owner's unclaimed SOMI balance, withdrawable via [`claimSomi`](functions.md#claimsomi).

```solidity
function cancelPendingOrder(OrderId orderId) external;
```

***

#### `claimSomi`

Withdraws the caller's unclaimed SOMI balance. Reverts with `NothingToClaim` if there is no unclaimed balance.

```solidity
function claimSomi() external;
```

***

#### `cancelInertOrders`

Permissionless cleanup for pending orders left behind after the admin removes the registry's reactivity subscription. Only callable while the registry is dormant (no active subscription) — reverts with `SubscriptionStillActive` otherwise. Credits each order's `somiPaid` to the original owner's unclaimed SOMI balance.

```solidity
function cancelInertOrders(OrderId[] calldata orderIds) external;
```

***

### View Functions

#### `spotPool`

Returns the SpotPool this registry is associated with.

```solidity
function spotPool() external view returns (address);
```

***

#### `somiPaymentPerOrder`

Returns the SOMI payment required per stop-order creation (in wei). Read this immediately before calling `createPendingOrder` and forward the exact amount.

```solidity
function somiPaymentPerOrder() external view returns (uint256);
```

***

#### `slippageToleranceBps`

Returns the slippage tolerance (basis points) used when computing limit prices for MARKET-type stop orders at trigger time.

```solidity
function slippageToleranceBps() external view returns (uint256);
```

***

#### `minStopDistanceBps`

Returns the minimum required distance (basis points) between `triggerPrice` and the EMA midpoint at order creation time. Zero means the check is disabled.

```solidity
function minStopDistanceBps() external view returns (uint256);
```

***

#### `activeSubscriptionId`

Returns the ID of the active reactivity subscription, or `0` if the registry is dormant. `createPendingOrder` reverts when dormant.

```solidity
function activeSubscriptionId() external view returns (uint256);
```

***

#### `gasBuffer` / `gasBufferBps` / `subscriptionGasLimit`

Subscription-derived gas-cap state used by the trigger loop. `gasBuffer = subscriptionGasLimit × gasBufferBps / 10_000`. All three return `0` while the registry is dormant.

```solidity
function gasBuffer() external view returns (uint256);
function gasBufferBps() external view returns (uint256);
function subscriptionGasLimit() external view returns (uint64);
```

***

#### `reservedSomi`

Returns the total SOMI reserved for pending order refunds (sum of `somiPaid` across all active pending orders). Admin can only withdraw above this amount.

```solidity
function reservedSomi() external view returns (uint256);
```

***

#### `unclaimedSomi`

Returns the unclaimed SOMI balance for a given user. Accumulates when a cancel refund transfer fails; withdrawable via [`claimSomi`](functions.md#claimsomi).

```solidity
function unclaimedSomi(address user) external view returns (uint256);
```
