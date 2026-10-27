# Explorer API: `/api/v2/transactions/<hash>/logs` returns `"decoded": null` for every log, even when the emitting contract is verified on the explorer (WSOMI `Withdrawal`, USDso `Transfer`), while the explorer's own Logs tab decodes the same log
Severity: normal
Area: explorer

> **Summary.** For each of the three transactions we checked, the new explorer's logs endpoint returns every log with
> `decoded: null`.
> This includes logs whose contract the same explorer lists as verified, with source and ABI
> (`/api/v2/smart-contracts/<addr>`). For a WSOMI unwrap, the endpoint gives `decoded: null` for the `Withdrawal` event.
> The same explorer decodes that transaction's *input* (`withdraw(uint256 wad)`), and its **Logs** tab shows the event
> as `Withdrawal(address src, uint256 wad)`. For a market transaction with 38 logs, 0 are decoded. explorer.somnia.network
> (Blockscout) decodes 12 of them, including the USDso `Transfer` events. So code that reads decoded logs through the
> Blockscout-compatible API, as the explorer's `llms.txt` invites ("tools and code written for those work here
> unchanged"), gets nothing it can use, although the explorer has the ABI.

> **Checked 2026-10-27 at 14:23–14:24, 14:41 and 15:00–15:01 UTC, Somnia mainnet (Global, chain 5031).** Same result each time.
> Evidence: `evidence/42/logs_decoded_2026-10-27T1441Z.txt`, `evidence/42/logs_decoded_2026-10-27T1500Z.txt`,
> `evidence/42/ui_logs_tab_decoded_2026-10-27T1442Z.png`.

## Steps to reproduce
`python3 evidence/42/logs_decoded_check.py <tx hash>...` (read-only), or by hand:

```sh
H=0xd25170f770052bd24b96d0c6459ed2f4b2c3b5a78c5f1a8573129666dd09d41b   # WSOMI withdraw, 2026-10-27 13:41:47 UTC
curl -s https://new.explorer.somnia.network/api/v2/transactions/$H/logs | jq '.items[] | {index, address: .address.hash, decoded}'
curl -s https://explorer.somnia.network/api/v2/transactions/$H/logs     | jq '.items[] | {index, decoded: .decoded.method_call}'
curl -s https://new.explorer.somnia.network/api/v2/smart-contracts/0x046EDe9564A72571df6F5e44d0405360c0f4dCab | jq '{name, verified_at}'
curl -s https://new.explorer.somnia.network/api/v2/transactions/$H | jq '.decoded_input.method_call'
```

Then open `https://new.explorer.somnia.network/tx/$H?tab=logs`.

The second transaction, `0x376f59f12e294b1ebf596c80bb6f1c7d0e7e26f895d01e18ebf69ec231fa4510` (38 logs: USDso transfers and
pool events), shows the same thing at a larger scale.

## Expected
For a log whose emitter (or, for a proxy, its implementation) is verified, `decoded` holds `method_call`, `method_id`
and `parameters`, as on Blockscout and as the explorer's own Logs tab already computes.

## Actual
`evidence/42/logs_decoded_2026-10-27T1441Z.txt`:

```
== 2026-10-27T14:41:25Z tx 0xd25170f770052bd24b96d0c6459ed2f4b2c3b5a78c5f1a8573129666dd09d41b
   new.explorer  /logs (x-api-backend: native): 1 logs, 0 with "decoded"
   explorer      /logs (Blockscout):          1 logs, 1 with "decoded"
   log #38 0x046EDe9564A72571df6F5e44d0405360c0f4dCab: new.explorer decoded=None   | Blockscout decoded='Withdrawal(address indexed src, uint256 wad)'
      new.explorer /api/v2/smart-contracts/0x046EDe95…: name='WETH9' verified_at='2026-10-12T13:43:42Z'; /addresses: is_verified=True implementations=[]
== 2026-10-27T14:41:34Z tx 0x376f59f12e294b1ebf596c80bb6f1c7d0e7e26f895d01e18ebf69ec231fa4510
   new.explorer  /logs (x-api-backend: native): 38 logs, 0 with "decoded"
   explorer      /logs (Blockscout):          38 logs, 12 with "decoded"
   log #1 0x00000022dA000002656c64D9eA6011ea952D008A: new.explorer decoded=None   | Blockscout decoded='Transfer(address indexed from, address indexed to, uint256 value)'
      new.explorer /api/v2/smart-contracts/0x00000022…: name='TransparentUpgradeableProxy' verified_at='2026-10-12T13:18:28Z'; /addresses: is_verified=True implementations=['0x155384be16fA171E6d97e4136643A9ac31678d04']
== 2026-10-27T14:41:47Z same tx, GET /api/v2/transactions/0xd25170f7…d41b (new.explorer): the INPUT is decoded with the same verified ABI
   method: withdraw  decoded_input.method_call: withdraw(uint256 wad)
```

In the browser (`evidence/42/ui_logs_tab_decoded_2026-10-27T1442Z.png`), the Logs tab of the first transaction shows
`#38 0x046ede…dcab UNWRAP 0.00034 WSOMI` / `event Withdrawal(address src, uint256 wad)` / `src 0x32ee…3517` /
`wad 339798000000000`. The explorer can decode the log; the API just does not return it.

## Evidence
- `evidence/42/logs_decoded_2026-10-27T1441Z.txt`, `evidence/42/logs_decoded_2026-10-27T1500Z.txt`: two runs, compared
  with Blockscout, plus the verification status of each emitter. The second run adds a fresh USDso transfer
  (`0xabe1173c…ad78`, 15:01 UTC): 38 logs, 0 decoded, against 12 on Blockscout.
- `evidence/42/ui_logs_tab_decoded_2026-10-27T1442Z.png`: the explorer's Logs tab with the decoded event.
- `evidence/42/logs_decoded_check.py`: the script.

## Suggested fix
Fill `decoded` in the native logs handler from the same ABI source that `decoded_input` and the Logs tab already use
(the contract's verified ABI, or the implementation's ABI for EIP-1967 proxies, as USDso is), in Blockscout's shape:
`{method_call, method_id, parameters: [{name, type, indexed, value}]}`.

## Environment
- Explorer: https://new.explorer.somnia.network as served 2026-10-27 (`x-api-backend: native`)
- For comparison: https://explorer.somnia.network (Blockscout v10.2.6), same chain
- Somnia mainnet (Global), chain id 5031; WSOMI `0x046EDe9564A72571df6F5e44d0405360c0f4dCab` (WETH9, verified),
  USDso `0x00000022dA000002656c64D9eA6011ea952D008A` (verified proxy, implementation `GeniusDollar`)
- curl 8.18.0, Python 3 standard library, Chrome 155 on Linux; read-only
