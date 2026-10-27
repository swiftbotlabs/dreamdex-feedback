# Explorer: unverified EIP-1967 and beacon proxies are not recognised, including the staking contract, the most-called contract of the day and the WETH/USDso and SOMI/USDso order-book pools. They show `proxy_type: null`, no implementation, and "NOT VERIFIED" bytecode.
Severity: normal
Area: explorer

> **Summary.** Of five EIP-1967 proxies we checked, the new explorer recognised only the one whose own source is verified
> (USDso). For the four without verified source, it returns `proxy_type: null` and `implementations: []`, although the
> implementation (or beacon) address sits in the standard EIP-1967 storage slot. The staking contract's Contract tab
> shows only "NOT VERIFIED · No verified source for this contract", above its 109-byte bytecode, which contains the slot
> constant. The four:
> - `0xBe367d41…1b8250`, the largest SOMI holder (152.86M SOMI), whose page lists `delegateStake` / `undelegateStake` /
>   `claimValidatorsRewards` calls;
> - `0x5E5205CF…3163E6`, which the explorer's own Charts page names "AgentRequester", the most-called contract of the last 24 h;
> - `0xa936da11…2bDE` (WETH/USDso) and `0x035De740…1379` (SOMI/USDso), two of the four Somnia Markets spot pools listed
>   on the explorer's Markets page. Both are beacon proxies of one implementation.
>
> explorer.somnia.network (Blockscout, same chain) identifies all four, as `eip1967` or `eip1967_beacon`, with the
> implementation the slot holds. Without the link, users cannot get from a pool or the staking contract to its logic
> contract, and the explorer has no proxy link through which to apply an implementation's ABI once that is verified.

> **Checked 2026-10-27 at 14:32, 14:43 and 15:02 UTC, Somnia mainnet (Global, chain 5031)**, with `eth_getStorageAt` on
> the EIP-1967 implementation and beacon slots. Evidence: `evidence/45/proxy_2026-10-27T1443Z.txt`,
> `evidence/45/proxy_2026-10-27T1502Z.txt`, `evidence/45/staking_contract_tab_2026-10-27T1444Z.txt`.

## Steps to reproduce
`python3 evidence/45/proxy_check.py <address>...` (read-only), or by hand:

```sh
A=0xBe367d410D96E1cAeF68C0632251072CDf1b8250
# implementation slot, bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1):
curl -s -H 'content-type: application/json' https://api.infra.mainnet.somnia.network/ -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getStorageAt\",\"params\":[\"$A\",\"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc\",\"latest\"]}"
curl -s https://new.explorer.somnia.network/api/v2/addresses/$A | jq '{is_verified, proxy_type, implementations}'
curl -s https://explorer.somnia.network/api/v2/addresses/$A     | jq '{is_verified, proxy_type, implementations}'
```

For the pools, read the beacon slot `0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50`, then call
`implementation()` (`0x5c60da1b`) on the beacon. In the browser, open
https://new.explorer.somnia.network/address/0xBe367d410D96E1cAeF68C0632251072CDf1b8250?tab=contract.

## Expected
Proxy detection reads the EIP-1967 implementation and beacon slots (and EIP-1167 / EIP-1822 patterns) whether or not the
proxy's own source is verified, as Blockscout does. The address API returns `proxy_type` and `implementations`, and the
Contract tab says "Proxy → implementation 0x…", with read/write via the implementation's ABI when that ABI is verified.

## Actual
`evidence/45/proxy_2026-10-27T1443Z.txt`:

| address | on chain (`eth_getStorageAt`) | new.explorer `proxy_type` / `implementations` | Blockscout |
|---|---|---|---|
| `0xBe367d…8250` (staking, 152.86M SOMI) | impl slot → `0x7ec3f6d2…f44e` | `null` / `[]` | `eip1967` / `0x7Ec3F6d2…F44E` |
| `0x5E5205…63E6` ("AgentRequester") | impl slot → `0x6db58181…6ee5` | `null` / `[]` | `eip1967` / `0x6Db58181…6ee5` |
| `0xa936da…2bDE` (WETH/USDso pool) | beacon slot → `0x55790554…5026`, `implementation()` → `0xaed4e84a…7e98` | `null` / `[]` | `eip1967_beacon` / `0xaeD4e84A…7E98` |
| `0x035De7…1379` (SOMI/USDso pool) | beacon slot → same beacon, same implementation | `null` / `[]` | `eip1967_beacon` / `0xaeD4e84A…7E98` |
| `0x00000022…008A` (USDso, *verified* proxy) | impl slot → `0x155384be…8d04` | `eip1967` / `0x155384be…8d04` | `eip1967` / same |

The last row is the control: in this sample, detection worked for the proxy whose source is verified and failed for the
four whose source is not.

Contract tab of the staking contract (14:44:47 and 14:44:53 UTC, `evidence/45/staking_contract_tab_2026-10-27T1444Z.txt`):
"Type · Contract · 109 bytes of code | Bytecode | NOT VERIFIED | No verified source for this contract. |
0x6080604052600a600c565b005b60186014601a565b6050565b565b5f604b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc54…".
The 32-byte constant in that bytecode is the EIP-1967 implementation slot. The page does not mention a proxy or an
implementation.

None of the four implementations is verified on either explorer yet. So today the visible loss is the missing
proxy-to-implementation link and the misleading "no source" page.

## Evidence
- `evidence/45/proxy_2026-10-27T1443Z.txt`, `evidence/45/proxy_2026-10-27T1502Z.txt`: two runs, slot reads plus both explorers.
- `evidence/45/staking_contract_tab_2026-10-27T1444Z.txt`: the rendered Contract and Read contract tabs of `0xBe367d…8250`.
- `evidence/45/proxy_check.py`: the script.

## Suggested fix
Run slot-based proxy detection for every contract address: EIP-1967 implementation slot, beacon slot plus
`implementation()`, EIP-1822 `proxiable` slot, EIP-1167 minimal-proxy bytecode. Fill `proxy_type` and `implementations`
from it, and show "Proxy of 0x…" on the Contract tab independently of source verification.

## Environment
- Explorer: https://new.explorer.somnia.network as served 2026-10-27 (`x-api-backend: native`)
- For comparison: https://explorer.somnia.network (Blockscout v10.2.6), same chain
- Somnia mainnet (Global), chain id 5031, RPC `https://api.infra.mainnet.somnia.network/`
- Python 3 standard library, Chrome 155 on Linux; read-only
