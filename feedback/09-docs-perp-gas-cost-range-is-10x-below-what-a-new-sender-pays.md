# Docs: "transactions to perp pools … cost between 0.0003 and 0.003 STT each" is the sustained-use-discount price (0.6–1.8 gwei); a new bot pays the full 6 gwei, ~10× more (a minimal resting order: 0.0141 STT)
Severity: normal
Area: docs

> **Summary.** The perps developer page's gas-cost figure is what heavy senders pay after Somnia's 70–90 % sustained-use
> discount. A new bot key pays the undiscounted 6 gwei, so it under-budgets gas by ~10× if it trusts the page.

The developer page "Perps on Testnet for Developers" (`/docs/developers/perps-testnet`, **Get test funds**)
says:

> Gas is billed on what a transaction uses, not on its gas limit: transactions to perp pools measured on
> testnet cost between 0.0003 and 0.003 STT each.

That range matches what the existing high-volume senders on the perp pools pay. They are priced at **0.6
gwei** or **1.8 gwei**, in blocks whose header says `baseFeePerGas` = 6 gwei. That is Somnia's documented
[sustained-use discount](https://docs.somnia.network/concepts/tokenomics/gas-fees): "effective gas price = base gas price ×
(1 − discount)", with tiers of 70 % (1.8 gwei) and 90 % (0.6 gwei), "0% for most accounts". On testnet the tiers start at
926,311,728 gas (70 %) and 4,631,558,641 gas (90 %) used over a rolling ~80-minute window. A new bot key is in the 0 %
tier, so it cannot get the price the page quotes. The public RPC rejects anything below 6 gwei with
`gas price below base fee`, `eth_gasPrice` returns 6 gwei, and the SDK's own `DEFAULT_FEES` doc says it pays
"the observed Somnia base fee of 6 gwei" (`maxFeePerGas` 60 gwei, tip 0, `src/config.ts`). So every
transaction costs ~10× the documented figure. Our first, minimal resting order on ETH-PERP used
2,352,847 gas = **0.0141 STT**, 4.7× the documented maximum. The app's "Send it 5 STT for gas" therefore
covers roughly 350–500 such orders, not the 1,700–16,000 the page implies. A bot budgeting from the page will
run out of gas an order of magnitude early.

## Steps to reproduce
1. Fund a fresh EOA with a little STT on Hideki (we used the app's Link a bot "Send it 5 STT for gas").
2. Send a 0-value self-transfer at 0.6 gwei (legacy, then EIP-1559 `maxFeePerGas` 0.6 gwei) and one at
   `maxFeePerGas` 12 gwei / tip 0: `PRIVATE_KEY=0x… node scripts/fee_floor_test.mjs`.
3. Place one minimal perp order the way the developer page describes (own account, MarginBank margin):
   ETH-PERP `placeOrder(true, 0, mark×0.9, minQuantity 0.004e18, now+7d, PostOnly, 0, 0x0, 0)`
   (`node scripts/encode_order.mjs perpbid <pool> 10` prints the calldata), then cancel it. Read
   `gasUsed × effectiveGasPrice` from the receipts.
4. Sample what other senders paid for orders on the same pools:
   `node scripts/perp_gas_sample.mjs <ETH-PERP> <BTC-PERP> <SOL-PERP>` (OrderPlaced logs over the last
   ~6,000 blocks → receipts).

## Expected
The documented per-transaction cost is what a developer following the page (SDK defaults or any wallet
that uses `eth_gasPrice`) actually pays, or the page states the gas price it assumes.

## Actual
- Step 2 (2026-10-19 15:12–15:13 UTC, `evidence/fee_floor_test_2026-10-19.txt`): `eth_gasPrice` = 6 gwei,
  header `baseFeePerGas` = 6 gwei; both 0.6 gwei transactions are rejected by the RPC with
  `gas price below base fee`. The 12 gwei-ceiling one is mined at an effective 6 gwei (tx
  `0x4f488257fd9147945d981419da0025e8c8aa5b72fa1320b1a840eae900395c36`, 21,000 gas = 0.000126 STT).
- Step 3, our transactions (all at an effective 6 gwei, `evidence/onchain_txs_2026-10-19.txt`):

  | tx | what | gas used | cost |
  |---|---|---|---|
  | `0x39ca9dd7b0f749ad37703072ddbce9ef4e798ed37080d91c47bd5486a8390aac` | ETH-PERP PostOnly bid, min size (orderId `10367070169424774406286`) | 2,352,847 | **0.014117 STT** |
  | `0x87f105cccaa5560b975c04b586321838b9de2d22c1790221a608201542ae403d` | cancel of that order | 156,664 | 0.000940 STT |
  | `0x80b708fddec290ab840ea090e291ade43a3417a64e3c2cbcf1b364e653093078` | BTC-PERP placeOrder that reverts (wrong-scale test) | 387,386 | 0.002324 STT |
  | `0x50811a18373415fd960f73c2dbce1d12c247a61fc4f2b1275fbd427cf46fec82` | MarginBank `deposit` | 521,297 | 0.003128 STT |

- Step 4 (2026-10-19 15:20 UTC, `evidence/perp_gas_sample_2026-10-19.txt`), 80 order transactions on the
  same pools, 4 senders, **none** at 6 gwei:

  | sender | tx type | gas price | gas used | paid | same gas at 6 gwei |
  |---|---|---|---|---|---|
  | `0x954a389f…7d68` (67 txs, `placeOrderFor`) | legacy | 0.6 gwei | 378,347–1,761,971 | 0.00023–0.00106 STT | 0.0023–0.0106 STT |
  | `0x6c2986a5…1ce4` (4 txs, batch) | EIP-1559 | 0.6 gwei | 1,523,704–2,447,971 | 0.00091–0.00147 STT | 0.0091–0.0147 STT |
  | `0x48ab6e0c…afca` (2 txs) | EIP-1559 | 1.8 gwei | 1,490,129–1,502,354 | 0.00268–0.00270 STT | 0.0089–0.0090 STT |
  | `0x24b00d46…58da` (7 txs, batch) | legacy | 0.6 gwei | 5,371,498–22,561,710 | 0.0032–0.0135 STT | 0.032–0.135 STT |

  The single-order transactions they send cost 0.00023–0.00270 STT, i.e. the documented "0.0003 to 0.003".
  The same gas at the 6 gwei a new sender must pay is 0.0023–0.0106 STT for those single-order
  transactions. Example: legacy tx
  `0xf113f4b0e0f71cb38ce16e5cb1b6cc497a408ed15cd4f5d5939def11c8174698` (gasPrice 0.6 gwei) is in block
  27707518, whose `baseFeePerGas` is 6 gwei.
- The app's own relayer (`0xC4ab4435…cCBe`) also pays 1.8 gwei on Hideki (Safe executions in report 08),
  while the app's key `0x2277…49c6` pays 6 gwei: its Link a bot operator-grant transaction used 14,880,792 gas
  = 0.089 STT.

These senders pay less because of the sustained-use discount above. A new developer's key does not have it, and
reaching the first tier takes 926,311,728 gas inside ~80 minutes: about 394 minimal resting orders (2,352,847 gas each),
or 5.56 STT at 6 gwei. The app's default "Send it 5 STT for gas" (833,333,333 gas at 6 gwei) is not enough to reach that
tier. The page doesn't mention the discount at all.

## Evidence
- `evidence/fee_floor_test_2026-10-19.txt` (RPC rejections and the 6 gwei control tx).
- `evidence/onchain_txs_2026-10-19.txt` (our transactions with gas, effective gas price and fee).
- `evidence/perp_gas_sample_2026-10-19.txt` (third-party order transactions on ETH/BTC/SOL-PERP, by sender).
- SDK 0.32.1 `src/config.ts`: `DEFAULT_FEES = { maxFeePerGas: 60_000_000_000n, maxPriorityFeePerGas: 0n }`, doc
  comment "60 gwei ceiling (~10× the observed Somnia base fee of 6 gwei)". `DEFAULT_GAS = 10_000_000n`
  ("Somnia's gas schedule is far dearer than mainnet's").

## Suggested fix
Quote the cost at the undiscounted price a new sender pays, and link Somnia's sustained-use discount for heavy senders. At 6 gwei the transactions above are ~0.001 STT for a cancel,
~0.01–0.015 STT for placing a resting order, and more for batches. Or state that the
0.0003–0.003 figure assumes the 70–90 % discount tiers and how a sender reaches them. Size the "Send it 5 STT for gas" default and the
"low, top up soon" warning on the same basis.

## Environment
- Somnia Hideki testnet ("Tokyo"), chain id 50383, RPC `https://api.hideki2.infra.testnet.somnia.network`
- Pools: ETH-PERP `0xD6Cb1DD58580B84D76068aC21594219ce03aeddf`, BTC-PERP `0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0`,
  SOL-PERP `0xB483ec1fb34996638677c20ab087b16F1896FA53`
- `@somnia-chain/markets-sdk` 0.32.1 (fee defaults read from source; not executed); viem 2.57.7 for our transactions
- Date: 2026-10-19, 14:36–15:20 UTC
- Wallet: `0x2A11e7388D1D2F9690f2636846d44b478f61bF08` (throwaway testnet bot key)

## Corrections
- **Corrected 2026-10-20.** Severity minor → normal: "minor" is not on the bounty's scale (critical | major | normal).
  Replaced "We don't know why these senders pay less" with the cause, Somnia's documented sustained-use discount, and
  reframed the title: the page quotes the discounted price, and a new bot pays ~10× that until it qualifies. Area is now
  `docs` only (the SDK's 6 gwei default is correct). Added the summary. The measurements are unchanged.
