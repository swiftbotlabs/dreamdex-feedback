# Gas Fees


Every transaction on Somnia pays a fee in SOMI (STT on testnet). Fees price the resources a transaction consumes, protect the network against spam, and reward the validators and delegators who secure it.

Somnia's gas model is built on Ethereum's, and most EVM operations cost exactly the same amount of gas as they do on Ethereum. The differences follow from Somnia's architecture:

* **State access is priced by its real latency.** Reading state that the network accessed recently is cheap. The rare read that has to go to disk costs 1,000,000 gas. For this reason, a transaction's gas limit should always account for the possibility of expensive disk reads.
* **State growth is priced higher.** New accounts, new storage slots, event logs, calldata and deployed bytecode cost more than on Ethereum, because every node has to keep them.
* **A few operations are repriced to match their real cost**, including `KECCAK256`, `ADDMOD`, `MULMOD`, `SELFBALANCE` and the precompiles.

The complete list is in [Somnia Gas Differences To Ethereum](/developer/deployment-and-production/somnia-gas-differences-to-ethereum).

## Pricing model

```
fee = gas used × effective gas price

effective gas price = base gas price × (1 − discount) + priority fee
```

| Term           | Meaning                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gas used       | Intrinsic gas plus the gas of every operation the transaction executes. See [Gas used](#gas-used).                                                     |
| Base gas price | A single network-wide price, never below 6 gwei. See [Base gas price](#base-gas-price).                                                               |
| Discount       | The sending account's sustained-use discount: 0% for most accounts, currently up to 90%. See [Sustained-use discounts](#sustained-use-discounts).     |
| Priority fee   | Zero for ordinary transactions. Set by the subscriber for Reactivity handler executions. See [Priority fees](#priority-fees).                         |

## Gas used

### Intrinsic gas

Intrinsic gas is charged before a transaction starts executing.

| Component                                                  |                                                         Gas |
| ---------------------------------------------------------- | ----------------------------------------------------------: |
| Standard transaction                                       |                                                      21,000 |
| Contract-creation transaction                              |                                                      53,000 |
| Calldata, per byte (zero and non-zero bytes cost the same) |                                                         160 |
| EIP-7702 authorization, per entry                          | 1,570,000 (400,000 is refunded if the account already exists) |

### Execution gas

Execution gas is the sum of the gas of every operation the transaction executes. Most opcodes cost the same as on Ethereum, but Somnia replaces Ethereum's cold and warm access pricing (EIP-2929) and its state-creation costs with these charges:

| Charge                                                                    |                                         Gas |
| ------------------------------------------------------------------------- | ------------------------------------------: |
| Reading a storage slot or account that is not in the recent-access cache |                                   1,000,000 |
| Reading a storage slot or account that is in the recent-access cache     |                             No extra charge |
| Looking up state that does not exist                                      | No charge, but 1,000,000 gas must remain    |
| Creating a storage slot (writing a non-zero value to an empty slot)       |                                     200,000 |
| Creating an account (for example, sending SOMI to a new address)          |                                     400,000 |
| Event log                                                                 | 3,200 + 5,120 per topic + 160 per data byte |
| Deployed contract bytecode, per byte                                      |                                       3,125 |

The recent-access cache holds the 128 million most recently accessed storage slots and the 32 million most recently accessed accounts across the whole network. Whether a read is cached depends on whether any transaction touched that value recently, so the same call can use different amounts of gas at different times.

Storage is always permanent, and its price does not depend on how long the data is kept. Writing zero to an empty slot creates nothing and costs nothing extra. Transient storage (`TSTORE` and `TLOAD`, EIP-1153), which is cleared at the end of every transaction, costs 100 gas per operation, as on Ethereum.

### Examples

At the 6 gwei base gas price, without a discount:

| Transaction                                             |   Gas used |           Fee |
| ------------------------------------------------------- | ---------: | ------------: |
| Send SOMI to an existing externally owned account (EOA) |     21,000 | 0.000126 SOMI |
| Send SOMI to a new account                              |    421,000 | 0.002526 SOMI |
| Each uncached state read                                | +1,000,000 |   +0.006 SOMI |
| Each new storage slot                                   |   +200,000 |  +0.0012 SOMI |

Sending SOMI to a contract also runs the contract's `receive` or `fallback` code, so it uses more gas.

> **Warning**
>
> **Don't reuse Ethereum gas limits.** A single uncached read costs 1,000,000 gas, and any lookup of state that may not exist needs 1,000,000 gas remaining. A transaction that runs out of gas still pays for its entire gas limit. Use `eth_estimateGas`, which already includes a safety margin on Somnia RPC nodes. Unused gas is always refunded.


## Gas price

### Base gas price

The network sets a single base gas price for everyone. It never falls below **6 gwei** (6 nanoSOMI, or 6 × 10⁻⁹ SOMI) per unit of gas, and it rises above that only through [congestion pricing](#congestion-pricing). `eth_gasPrice` and each block's `baseFeePerGas` report the current value.

### What you are charged

You are always charged the current effective gas price, never your bid. The `gasPrice` (legacy transactions) or `maxFeePerGas` (EIP-1559 transactions) you sign is only a ceiling:

* If the ceiling is below 6 gwei, the transaction is rejected.
* If the ceiling is at least 6 gwei but below the current base gas price, the transaction waits in the mempool until the price falls.
* While the transaction is pending, the sender's balance must cover `value + ceiling × gas limit`.
* When the transaction executes, the sender pays `gas used × effective gas price`, and the unused gas is refunded.

### Congestion pricing

Validators raise the base gas price when execution falls behind, as back-pressure against sustained overload:

* Every 10 seconds, each validator votes for `6 gwei × 2^k`. Here `k` is the longest time any of the validator's last 32 blocks took to get through execution, including time spent queued behind earlier blocks, divided by 1.5 seconds and rounded down. `k` is capped at 10, so the highest possible vote is 6,144 gwei.
* The network uses the stake-weighted median of the current committee's votes. A vote older than 30 minutes, or a missing vote, counts as 6 gwei, so the price only rises when validators holding a majority of the stake see the backlog.
* The chain applies a new price at most once every 10 seconds. When execution catches up, the votes return straight to 6 gwei. There is no gradual step-down.
* The base gas price can never exceed 100,000 gwei.

The voting interval, the 32-block sample and the 1.5-second step are validator node defaults. In normal operation every vote is 6 gwei, and the base gas price stays at the floor.

### Sustained-use discounts

Accounts that consistently use a lot of gas pay a lower base gas price. There is nothing to enable or claim.

* **Per sender, measured in gas.** Usage is tracked for the account that pays: the transaction's `from` address, or the subscription owner for Reactivity handler executions. It is measured in gas used, not in number of transactions, and the gas used by the contracts you call counts towards your usage.
* **Rolling window.** In every epoch (3,000 blocks, about 5 minutes), each account that used at least 10,000,000 gas in that epoch is recorded, up to the 1,000 heaviest accounts (100 on testnet). Your discount is based on your recorded gas over roughly the last 80 minutes (16 epochs).
* **Timing.** A newly earned discount applies from the start of the next epoch. It lasts until your usage ages out of the window.
* **Scope.** The discount applies to the base gas price only; priority fees are never discounted. It changes the price per unit of gas, never the amount of gas an operation uses.

The current mainnet tiers are:

| Gas used over the window | Discount | Base gas price at 6 gwei | Send SOMI to an existing EOA |
| ------------------------ | -------: | -----------------------: | ---------------------------: |
| Below 900,000,000        |       0% |                   6 gwei |                0.000126 SOMI |
| 900,000,000 or more      |      70% |                 1.8 gwei |               0.0000378 SOMI |
| 4,000,000,000 or more    |      90% |                 0.6 gwei |               0.0000126 SOMI |

Staying in the two tiers takes roughly 100 SOMI and 430 SOMI of gas per day, valued at the undiscounted price. On testnet, the tiers are 926,311,728 gas (70%) and 4,631,558,641 gas (90%).

**Submit transactions at the full, undiscounted price.** Mempool admission and the pending-balance check use the ceiling you signed. The discount is applied only when the transaction executes, and it appears in the receipt's `effectiveGasPrice`.

The tiers and recording limits are configured in the `GasDiscounts` contract and can change without a network upgrade. See [Sustained Use Gas Discounts](/developer/deployment-and-production/sustained-use-gas-discounts) for RPC behaviour and for how to read the live values.

## Priority fees

* **Ordinary transactions:** there is no tipping. `maxPriorityFeePerGas` is accepted but ignored: it is not charged, and it does not affect inclusion or ordering. `eth_maxPriorityFeePerGas` returns 0.
* **Reactivity subscriptions:** the `priorityFeePerGas` set on a subscription is paid on every handler execution, on top of the base gas price, and is never discounted. Queued handlers with a higher priority fee run first, and those with the lowest priority fee are dropped first if the queue is full. See [On-chain Reactivity](/developer/reactivity/reactivity-onchain).

## Fee distribution

All fees paid during an epoch are collected by the `NodeCommittee` contract. At the end of every epoch (about every 5 minutes):

1. A share of the fees is burned by sending it to the zero address. The burn share is currently **5% on mainnet** and 50% on testnet.
2. The rest is distributed to the validators in that epoch's committee, in proportion to each validator's total stake (its own stake plus delegated stake).
3. Each validator shares its portion with its delegators according to its delegation rate.

```
validator portion = epoch fees × (1 − burn share) × validator stake ÷ committee stake
delegator reward  = validator portion × delegation rate × delegator stake ÷ validator's delegated stake
```

Validators outside the committee earn no fees for that epoch. Rewards accumulate in the staking contract until they are claimed; see [Token Staking and Delegation](./token-staking-and-delegation).

The burn share is on-chain configuration. Mainnet reduced it from 50% to 5% on 2 July 2026. Burned SOMI is permanently removed from circulation.

## Network parameters

| Parameter                      | Mainnet                                 | Testnet                                        |
| ------------------------------ | --------------------------------------- | ---------------------------------------------- |
| Chain ID                       | 5031                                    | 50312                                          |
| Block time                     | \~100 ms                                | \~100 ms                                       |
| Epoch                          | 3,000 blocks (\~5 minutes)              | 3,000 blocks (\~5 minutes)                     |
| Minimum base gas price         | 6 gwei                                  | 6 gwei                                         |
| Maximum base gas price         | 100,000 gwei                            | 100,000 gwei                                   |
| Base gas price update interval | 10 seconds                              | 10 seconds                                     |
| Burn share                     | 5%                                      | 50%                                            |
| Discount tiers                 | 900M gas → 70%, 4B gas → 90%            | 926,311,728 gas → 70%, 4,631,558,641 gas → 90% |
| Discount recording             | ≥ 10M gas per epoch, top 1,000 accounts | ≥ 10M gas per epoch, top 100 accounts          |

The burn share and the discount settings can change. To read the live values with [Foundry](https://book.getfoundry.sh/)'s `cast`:

```bash
RPC=https://api.infra.mainnet.somnia.network
GAS_DISCOUNTS=0x8dc59a5A096F9a62f9032A1e7945FbC9a44C6606
# Testnet:
# RPC=https://api.infra.testnet.somnia.network
# GAS_DISCOUNTS=0x75AFcd5146633234c906Aaa6032117c7b54fCdEa

# Current base gas price, in wei
cast gas-price --rpc-url $RPC

# Burn share, in basis points (500 = 5%)
cast call 0x7b8b1bb68c6f0e29f3addcb45a6c0bb8e8e331c7 "burnFeePercentage()(uint256)" --rpc-url $RPC

# Discount tiers: (gas threshold, discount in basis points)
cast call $GAS_DISCOUNTS "getTiers()((uint256,uint256)[])" --rpc-url $RPC
```

---

Every page is also Markdown: append `.md` to its URL, or ask for `text/markdown`. Found something wrong, missing or confusing in these docs? Tell us: `POST /api/feedback` on this site with JSON `{"message": "…", "context": "what you were doing and what happened", "page": "…"}`, or a plain-text body. `GET /api/feedback` gives the JSON Schema. The team reads every one.
