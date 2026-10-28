# Explorer: contract pages never show who created a contract or in which transaction. `/api/v2/addresses/<contract>` returns `null` creator fields for all 9 contracts we checked, and Etherscan `getcontractcreation` answers "Not available: the explorer cannot answer this request right now" for 7 of the 9, including 5 of the first 6 contracts on the explorer's own Verified contracts list.
Severity: normal
Area: explorer

> **Summary.** "Who deployed this contract, and when?" is one of the first checks a developer or a careful user makes,
> for example to tell an official deployment from a copy. The new explorer cannot answer it:
> - the address record (`GET /api/v2/addresses/<a>`) has `creator_address_hash: null` and
>   `creation_transaction_hash: null` for **every** contract we checked (9 of 9), including WSOMI, whose creation
>   transaction the same explorer's Etherscan endpoint returns. The address page has no creator or creation row.
> - Etherscan-style `GET /api?module=contract&action=getcontractcreation&contractaddresses=<a>` (listed in `llms.txt`)
>   works only for contracts deployed directly by a top-level transaction. For contracts deployed inside a call (the
>   CREATE2 deployer `0x4e59b448…956C`, used by 4 of the first 6 verified contracts; a Safe transaction; a vesting factory), it returns
>   `status 0`, "Not available: the explorer cannot answer this request right now". It does the same for the
>   AgentRequester contract (`0x5E5205CF…63E6`), which *was* deployed directly. That is perhaps the busy-account
>   limit in #54, since that contract has 19M transactions.
>
> explorer.somnia.network (Blockscout, same chain) returns the creator and the creation transaction for all 9 in both
> APIs. Every creation transaction exists on the RPC.

> **Checked 2026-10-28 at 10:44–10:45 and 10:48–10:49 UTC, Somnia mainnet (Global, chain 5031)**, by script and on the rendered
> address page, logged out. Same result each run. Evidence: `evidence/55/contract_creator_2026-10-28T1044Z.txt`,
> `evidence/55/contract_creator_2026-10-28T1048Z.txt`, `evidence/55/ui_permit2proxy_page_2026-10-28T1045Z.png`.

## Steps to reproduce
`python3 evidence/55/contract_creator_check.py` (read-only). It takes the first 6 contracts of the explorer's own
`/api/v2/smart-contracts` list, plus WSOMI, VestingSchedule8 and AgentRequester. For each one it prints both explorers'
creator fields and `getcontractcreation`, and looks up Blockscout's creation transaction on the RPC (a direct create
when `receipt.contractAddress` is the contract).

By hand:
```sh
P=0x6eB8CcbC42a2A8C5Eb0371f2ff2bc3626d96f35F     # Permit2Proxy, verified, first on the Verified contracts list
curl -s https://new.explorer.somnia.network/api/v2/addresses/$P | jq '{creator_address_hash, creation_transaction_hash}'
# {"creator_address_hash": null, "creation_transaction_hash": null}
curl -s "https://new.explorer.somnia.network/api?module=contract&action=getcontractcreation&contractaddresses=$P"
# {"message":"Not available: the explorer cannot answer this request right now","result":null,"status":"0"}
curl -s "https://explorer.somnia.network/api?module=contract&action=getcontractcreation&contractaddresses=$P" | jq -c .result
# [{"contractAddress":"0x6eb8…","contractCreator":"0xb05e63458a51731aad26bdcd6e12246330e6095f","txHash":"0x50f482b5…6de2", …}]
W=0x046EDe9564A72571df6F5e44d0405360c0f4dCab     # WSOMI, deployed directly
curl -s https://new.explorer.somnia.network/api/v2/addresses/$W | jq .creator_address_hash                     # null
curl -s "https://new.explorer.somnia.network/api?module=contract&action=getcontractcreation&contractaddresses=$W" | jq -c '.result[0] | {contractCreator, txHash}'
# {"contractCreator":"0x772d5fea12e2be351a9035847e1c77635531bcc4","txHash":"0x2e86454f…b15f"}
```
Then open https://new.explorer.somnia.network/address/0x6eB8CcbC42a2A8C5Eb0371f2ff2bc3626d96f35F. It shows Balance,
"Transactions sent 1", "Type Contract · 8,037 bytes of code" and "No transactions", with no creator and no creation
transaction.

## Expected
Each contract's address record and page give the creator and the creation transaction, as on Blockscout, whether the
contract was deployed by a top-level transaction or inside one (a factory, a CREATE2 deployer, a Safe).
`getcontractcreation` returns them for any contract. If a contract was created at genesis, it should say so instead of
"not available right now".

## Actual
`evidence/55/contract_creator_2026-10-28T1044Z.txt` (summary of 9 contracts):

```
contract                                       how it was created (RPC)                    NEW v2 creator   NEW getcontractcreation          Blockscout (v2 and getcontractcreation)
0x6eB8…f35F Permit2Proxy (verified)            inside a call (tx 0x50f482b5…)              null             "Not available … right now"      creator + tx
0xcefA…2b13 RemoteHopV201 (verified)           inside a call (CREATE2 deployer 0x4e59…)    null             "Not available … right now"      creator + tx
0x7eA2…FF55 EIP712Lib (verified)               inside a call (CREATE2 deployer)            null             "Not available … right now"      creator + tx
0x3612…93f0 RateLimiterLib (verified)          inside a call (CREATE2 deployer)            null             "Not available … right now"      creator + tx
0x1539…ae8e EIP3009Lib (verified)              inside a call (CREATE2 deployer)            null             "Not available … right now"      creator + tx
0xD398…FD41 WFRAXTokenOFTUpgradeable (verif.)  direct create (tx 0x302cf74d…)              null             OK 0x54f9…17bc / 0x302cf74d…     creator + tx
0x046E…dCab WETH9 / WSOMI (verified)           direct create (tx 0x2e86454f…)              null             OK 0x772d…Bcc4 / 0x2e86454f…     creator + tx
0x5ebF…44Cf4 VestingSchedule8                  inside a call (Safe tx 0x8e9a4bf9…)         null             "Not available … right now"      creator + tx
0x5E52…63E6 AgentRequester                     direct create (tx 0x36596e18…)              null             "Not available … right now"      creator + tx
```

The contract page also reads "Transactions sent 1" for every contract we opened (Permit2Proxy, WSOMI). That is the
account nonce, which starts at 1 for a contract. A contract cannot send a transaction, so the label should be "Nonce",
or the row should be hidden for contracts.

## Evidence
- `evidence/55/contract_creator_2026-10-28T1044Z.txt`, `evidence/55/contract_creator_2026-10-28T1048Z.txt`: two runs, with the RPC check of each creation transaction.
- `evidence/55/ui_permit2proxy_page_2026-10-28T1045Z.png`, `evidence/55/ui_permit2proxy_page_text_2026-10-28T1045Z.txt`: the
  address page of a verified contract, with no creator row.
- `evidence/55/contract_creator_check.py`: the script.

## Suggested fix
Record the creator and creation transaction for every contract from the traces the explorer already indexes, using
internal `create`/`create2` rows (`created_contract`) as well as top-level creates. Fill `creator_address_hash` and
`creation_transaction_hash` in the v2 record, show them on the page, and serve `getcontractcreation` from the same
table. Label the nonce row on contract pages as "Nonce", or hide it.

## Environment
- Explorer: https://new.explorer.somnia.network as served 2026-10-28 (`x-api-backend: native`)
- For comparison: https://explorer.somnia.network (Blockscout v10.2.6), same chain
- Somnia mainnet (Global), chain id 5031; RPC https://api.infra.mainnet.somnia.network/
- Python 3.14 (standard library only), curl 8.18.0, Chrome 155 on Linux (logged out, no wallet); read-only
