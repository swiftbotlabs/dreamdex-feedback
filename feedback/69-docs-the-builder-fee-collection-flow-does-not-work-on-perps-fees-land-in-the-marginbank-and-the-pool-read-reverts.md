# Docs + indexer: the documented builder-fee flow does not apply to perps. The pool read reverts, the event is a different one, fees land in the MarginBank, and `BuilderApproval` and `BuilderFeeRecord` stay empty
Severity: normal
Area: docs | API

> **Summary.** Perp pools accept builder codes (cap 10,000, 10 bps), and `placeOrder` has the builder arguments, but nobody had used them on Tokyo: 0 rows in the indexer. We ran the flow with our own wallet. The fee is charged, and it goes somewhere the docs don't say. The Builder Fees page tells a builder to read
> `getWithdrawableBalance(builder, token)` on the pool, which **reverts** on a perp pool, and to call the pool's `withdraw`. The page's `BuilderFeeCharged(uint128,address,address,uint256)` is never emitted. On perps the fee is credited to the builder's **MarginBank** account, and a different event with the same name comes from the MarginBank. The indexer's
> `BuilderApproval` and `BuilderFeeRecord` tables stay empty; only `PerpFeeRecord` has it.
>
> **Checked 2026-11-01, 12:44–12:46 UTC** on Tokyo, real transactions from our test wallet. Evidence: `evidence/69/`.

## Steps to reproduce
On Tokyo with a funded key and any builder address, on the ETH-PERP pool `0xd6cb1dd58580b84d76068ac21594219ce03aeddf`:
```sh
PRIVATE_KEY=0x… node evidence/69/builder_perp.mjs <builder address> 10000 <limit above ask> <limit below bid> --go
node evidence/69/builder_claim.mjs <builder address>
```
This approves the builder at 10,000, opens and closes 0.004 ETH with the builder tagged, reads the pool's `getWithdrawableBalance(builder, USDso)`, then reads and simulates a MarginBank withdrawal from the builder's address.

## Expected
Docs, HTTP API → Builder Fees: "Each charged fee is credited to the **builder's own vault balance** on the pool it was earned on (see `BuilderFeeCharged`)", read it "with `getWithdrawableBalance(builder, token)` on the pool", and "Withdraw it to your wallet with `withdraw(token, amount)`". Or a perps section saying what differs.

## Actual
| Step | Transaction | Result |
|---|---|---|
| `approveBuilder(builder, 10000)` | `0xad35a14b…a5f4` | success |
| Open 0.004 ETH with builder | `0xf6cda334…3736` | success, fee 0.00903 USDso |
| Close 0.004 ETH with builder | `0x2a30f8ad…0dda` | success, fee 0.00903 USDso |

- `getWithdrawableBalance(builder, USDso)` on the pool **reverts**, before and after.
- `0xb603f983…` (`BuilderFeeCharged(uint128,address,address,uint256)`, the documented topic) doesn't appear in the receipts. The receipt has `0xe4f87a20`, `BuilderFeeCharged(address payer, address builder, address pool, uint256 amount)`, emitted by the MarginBank `0x4787…1394`.
- The builder's MarginBank withdrawable balance is 0.01805592 USDso, and `withdraw(0.018)` from the builder's address simulates fine, so the money is reachable, just not as documented.
- Indexer: `BuilderFeeRecord` 0 rows and `BuilderApproval` 0 rows, even after the approval above. `PerpFeeRecord` has both fees with `kind: BuilderFee`.
- The REST host doesn't serve Tokyo, so `GET /v0/markets/{symbol}/builder/approval` is no help there.

## Evidence
`evidence/69/builder_perp.mjs`, `builder_claim.mjs`, and outputs `builder_perp_2026-11-01T1245Z.txt`, `builder_claim_2026-11-01T1246Z.txt`, `open_tx_logs_2026-11-01T1246Z.txt`.

## Suggested fix
Add a perps section to Builder Fees: fees are credited to the builder's MarginBank account, read `PerpFeeRecord` (or the SDK's perp fee list) and withdraw from the MarginBank. Add the MarginBank event to the events page. Index perp `approveBuilder` calls into `BuilderApproval`.

## Environment
- Somnia Tokyo testnet (Hideki, chain 50383), indexer `https://hideki-dev.smk.somnia.host/v1/graphql`, wallet `0x2A11e7388D1D2F9690f2636846d44b478f61bF08`
- viem 2.57.7; SDK source 0.32.1 read for the event names
