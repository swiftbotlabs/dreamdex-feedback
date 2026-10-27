# Explorer API: the burnt-fee fields contradict each other and the docs. A discounted transaction's `transaction_burnt_fee` is 100% of its fee, and a block's `burnt_fees` is `gas_used × 6 gwei`, 3–9× the fees its transactions paid. Somnia burns 5% of mainnet fees, once per epoch.
Severity: normal
Area: explorer

> **Summary.** Somnia's gas-fee docs say fees are collected by the `NodeCommittee` contract. At the end of each epoch,
> "the burn share is currently **5% on mainnet**", and the rest goes to validators. Accounts with sustained-use discounts
> pay 0.6 or 1.8 gwei a unit, while the blocks report `baseFeePerGas` = 6 gwei. The new explorer's Blockscout-compatible
> API gets the burn wrong in two ways that also contradict each other:
> - `transaction_burnt_fee` matches `min(fee, gas_used × 6 gwei)`, Ethereum's EIP-1559 burn, for all ten transactions we
>   checked. For those at 0.6, 1.8 or 6 gwei, that is the whole fee (100%); for one at 16 gwei it is 38% of the fee.
>   Somnia's rule is 5%.
> - every block's `burnt_fees` is `gas_used × base_fee_per_gas`, at the undiscounted 6 gwei. In block 449,561,818 that is
>   **0.018777 SOMI "burnt" against 0.002875 SOMI actually paid** by its three transactions (6.53×). In the four blocks we
>   checked it was 3.00×, 6.53×, 6.77× and 8.83× the fees paid. The sum of the same transactions' `transaction_burnt_fee`
>   is 0.002875 SOMI, so the block and its transactions disagree with each other.
>
> A burn tracker or analytics tool that reads these fields overstates SOMI burn by up to 20× on transactions
> (100% instead of 5%) and by 60–177× on blocks (3.00–8.83× the fees, instead of 5% of them).

> **Checked 2026-10-27 at 14:16–14:28, 14:43 and 15:02 UTC, Somnia mainnet (Global, chain 5031)**, against
> `eth_getTransactionReceipt` (`gasUsed × effectiveGasPrice`) and `eth_getBlockByNumber`. Evidence:
> `evidence/44/burnt_fees_2026-10-27T1443Z.txt`, `evidence/44/burnt_fees_2026-10-27T1502Z.txt`.

From the docs (https://new.docs.somnia.network/concepts/tokenomics/gas-fees.md):

> effective gas price = base gas price × (1 − discount) + priority fee
> … `eth_gasPrice` and each block's `baseFeePerGas` report the current value.
> (Sustained-use discounts table: "4,000,000,000 or more · 90% · 0.6 gwei", "900,000,000 or more · 70% · 1.8 gwei".)
>
> ## Fee distribution
> All fees paid during an epoch are collected by the `NodeCommittee` contract. At the end of every epoch (about every 5 minutes):
> 1. A share of the fees is burned by sending it to the zero address. The burn share is currently **5% on mainnet** and 50% on testnet.

## Steps to reproduce
`python3 evidence/44/burnt_fees_check.py 449561818 449561865` (read-only), or by hand for one block:

```sh
N=449561818
curl -s https://new.explorer.somnia.network/api/v2/blocks/$N | jq '{gas_used, base_fee_per_gas, burnt_fees}'
curl -s https://new.explorer.somnia.network/api/v2/blocks/$N/transactions \
  | jq '.items[] | {hash, gas_used, gas_price, fee: .fee.value, transaction_burnt_fee}'
# receipts: fee actually paid = gasUsed × effectiveGasPrice
curl -s -H 'content-type: application/json' https://api.infra.mainnet.somnia.network/ \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["0x376f59f12e294b1ebf596c80bb6f1c7d0e7e26f895d01e18ebf69ec231fa4510"]}' \
  | jq '.result | {gasUsed, effectiveGasPrice}'
```

## Expected
- A block's `burnt_fees` is never more than the fees its transactions paid. Under the documented model it is 5% of
  them (or `null`/0 per block, with the burn shown on the epoch-end `NodeCommittee` transfer to the zero address).
- `transaction_burnt_fee` follows the same rule (5% of `fee`, or `null`), so that the block total equals the sum of its
  transactions.

## Actual
`evidence/44/burnt_fees_2026-10-27T1443Z.txt`:

```
== 2026-10-27T14:43:10Z block 449,561,818 (x-api-backend: native); RPC baseFeePerGas 6 gwei, gasUsed 3,129,435
   tx 0x376f59f12e29… gas_used 2,819,662  gas_price  0.6 gwei (receipt effectiveGasPrice 0.6)  fee 0.001691797 SOMI (receipt 0.001691797 SOMI)  transaction_burnt_fee 0.001691797 SOMI = 100% of fee
   tx 0x130170fff06e… gas_used   160,909  gas_price  1.8 gwei (receipt effectiveGasPrice 1.8)  fee 0.000289636 SOMI (receipt 0.000289636 SOMI)  transaction_burnt_fee 0.000289636 SOMI = 100% of fee
   tx 0xfdba2c5d9e5b… gas_used   148,864  gas_price    6 gwei (receipt effectiveGasPrice 6)  fee 0.000893184 SOMI (receipt 0.000893184 SOMI)  transaction_burnt_fee 0.000893184 SOMI = 100% of fee
   block burnt_fees 0.018776610 SOMI = gas_used 3,129,435 x base_fee_per_gas 6 gwei
   sum of tx fees 0.002874617 SOMI (receipts 0.002874617 SOMI); sum of tx transaction_burnt_fee 0.002874617 SOMI
   -> block burnt_fees is 6.53x the fees its transactions paid; documented burn (5% of fees) would be 0.000143731 SOMI
== 2026-10-27T14:43:14Z block 449,561,865 …
   -> block burnt_fees is 3.00x the fees its transactions paid; documented burn (5% of fees) would be 0.000079969 SOMI
```

A second run on two fresh blocks (`evidence/44/burnt_fees_2026-10-27T1502Z.txt`) also prints Blockscout's values:

```
== 2026-10-27T15:02:04Z block 449,589,472 (x-api-backend: native); RPC baseFeePerGas 6 gwei, gasUsed 14,404,329
   tx 0xc2b77f267dbb… gas_used 14,329,950  gas_price  0.6 gwei (receipt effectiveGasPrice 0.6)  fee 0.008597970 SOMI (receipt 0.008597970 SOMI)  transaction_burnt_fee 0.008597970 SOMI = 100% of fee
   tx 0xf4a1b57c98fe… gas_used    74,379  gas_price   16 gwei (receipt effectiveGasPrice 16)  fee 0.001190064 SOMI (receipt 0.001190064 SOMI)  transaction_burnt_fee 0.000446274 SOMI = 38% of fee
   block burnt_fees 0.086425974 SOMI = gas_used 14,404,329 x base_fee_per_gas 6 gwei
   sum of tx fees 0.009788034 SOMI (receipts 0.009788034 SOMI); sum of tx transaction_burnt_fee 0.009044244 SOMI
   -> block burnt_fees is 8.83x the fees its transactions paid; documented burn (5% of fees) would be 0.000489402 SOMI
   for comparison, explorer.somnia.network (Blockscout): block burnt_fees 0.086425974 SOMI (burnt_fees_percentage 882.9758253802551), tx 0xc2b77f267dbb… transaction_burnt_fee None
== 2026-10-27T15:02:12Z block 449,589,471 …
   -> block burnt_fees is 6.77x the fees its transactions paid; …
```

`fee` and `gas_price` match the receipts exactly. The burn fields alone are wrong. Neither field appears on the rendered
transaction or block pages, so this affects API consumers, not people reading the site.

## Evidence
- `evidence/44/burnt_fees_2026-10-27T1443Z.txt` and `evidence/44/burnt_fees_2026-10-27T1502Z.txt` (a later run on fresh blocks,
  with Blockscout's values for comparison).
- `evidence/44/docs_gas_fees_2026-10-27T1438Z.md`: the docs page as fetched.
- `evidence/44/burnt_fees_check.py`: the script.

## Suggested fix
Derive burn from the documented model, not from Ethereum's EIP-1559 formula. Either report 5% of the paid fee
(`fee × burn share`, read from the chain config, not hard-coded) on transactions and the sum on blocks, or set
`burnt_fees` / `transaction_burnt_fee` to `null` and expose the epoch burn where it happens (the `NodeCommittee` transfer
to the zero address). Never compute burn from `baseFeePerGas` when accounts pay a discounted `effectiveGasPrice`.

## Environment
- Explorer: https://new.explorer.somnia.network as served 2026-10-27 (`x-api-backend: native`)
- Docs: https://new.docs.somnia.network/concepts/tokenomics/gas-fees.md, fetched 14:38 UTC
- Somnia mainnet (Global), chain id 5031, RPC `https://api.infra.mainnet.somnia.network/`
- Python 3 standard library; read-only

Note: explorer.somnia.network (Blockscout) shows the same block-level `burnt_fees` (it reports `burnt_fees_percentage`
653% and a negative `priority_fee` for block 449,561,818). So the block-level error is not new. But the new explorer's
native API recomputes these fields and keeps that error, and it adds the per-transaction burn (100% of a discounted fee). Blockscout returns
`transaction_burnt_fee: null` for the same transactions (checked 14:53 UTC, and printed in the 15:02 run).
