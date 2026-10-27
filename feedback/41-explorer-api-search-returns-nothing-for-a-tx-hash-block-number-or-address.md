# Explorer API: `GET /api/v2/search?q=` returns `{"items":[]}` for a transaction hash, a block number or an address; only name search works, although `llms.txt` lists it as Blockscout's search
Severity: normal
Area: explorer

> **Summary.** The explorer's `llms.txt` says "Each API is Blockscout's or Etherscan's, so tools and code written for those work here unchanged".
> It lists `/api/v2/search?q=<query>` among the endpoints, and the search page as taking an "address, hash,
> block, token or name". On new.explorer.somnia.network that endpoint returns `{"items":[],"next_page_params":null}` for
> a transaction hash, a block number and a contract address that all exist. Only text queries such as `USDso` return
> items. explorer.somnia.network (Blockscout v10.2.6, the same chain) returns one typed item for each of those queries
> (`transaction`, `block`, `token` + `address`). The explorer's own search box still works, because the
> `/search-results` page uses a different helper, `/api/v2/search/check-redirect`, which does resolve all three.
> A wallet, bot or agent that calls the documented search endpoint gets no result for a hash, block or address that exists.

> **Checked 2026-10-27 at 14:22, 14:40 and 15:00 UTC, Somnia mainnet (Global, chain 5031).** Same result each time.
> Evidence: `evidence/41/search_check_2026-10-27T1440Z.txt`, `evidence/41/search_check_2026-10-27T1500Z.txt`.

## Steps to reproduce
`bash evidence/41/search_check.sh` (read-only), or by hand:

```sh
for q in 0x376f59f12e294b1ebf596c80bb6f1c7d0e7e26f895d01e18ebf69ec231fa4510 449561818 \
         0x00000022dA000002656c64D9eA6011ea952D008A USDso; do
  for base in https://new.explorer.somnia.network https://explorer.somnia.network; do
    echo "$base $q -> $(curl -s "$base/api/v2/search?q=$q" | jq -c '[.items[].type]')"
  done
done
# the explorer's own helper, which the search page uses:
curl -s "https://new.explorer.somnia.network/api/v2/search/check-redirect?q=449561818"
```

The three non-text queries are a transaction of 2026-10-27 14:15:51 UTC, its block, and the USDso token contract.

## Expected
As on Blockscout and as `llms.txt` describes: a transaction hash returns a `transaction` item, a block number returns a
`block` item, and an address returns an `address` item (plus a `token` item for a token contract). An exact match gets the
same answer that `check-redirect` already computes.

## Actual
`evidence/41/search_check_2026-10-27T1440Z.txt` (14:40:42–14:40:57 UTC):

| query | new.explorer `/api/v2/search` (`x-api-backend: native`) | explorer.somnia.network (Blockscout) |
|---|---|---|
| tx `0x376f59f1…4510` | `items: 0` | 1 item, `transaction` |
| block `449561818` | `items: 0` | 1 item, `block` |
| address `0x00000022dA…008A` (USDso) | `items: 0` | 2 items, `token`, `address` |
| text `USDso` | 7 items, all `token` | 7 items, all `token` |

At the same time, the new explorer resolves all three through its other paths:

```
GET /api/v2/search/check-redirect?q=0x376f…4510 -> {"type":"transaction","parameter":"0x376f…4510","redirect":true}
GET /api/v2/search/check-redirect?q=449561818  -> {"type":"block","parameter":"449561818","redirect":true}
GET /api/v2/search/check-redirect?q=0x0000…008A -> {"type":"address","parameter":"0x0000…008A","redirect":true}
GET /search-results?q=<each>                    -> 307 to /tx/…, /block/449561818, /address/0x0000…008A
```

`/api/v2/search/quick?q=`, which Blockscout front-ends use for the search box drop-down, returns `[]` for all three on the
new explorer, while Blockscout returns `transaction`, `block` and `token` + `address` (first seen 14:22:41 UTC for the tx hash; recorded in
`evidence/41/search_check_2026-10-27T1500Z.txt`).

## Evidence
- `evidence/41/search_check_2026-10-27T1440Z.txt`, `evidence/41/search_check_2026-10-27T1500Z.txt`: two full runs, each with
  every query sent to both explorers, then `check-redirect` and the `/search-results` redirect (the second run also
  compares `/api/v2/search/quick`).
- `evidence/41/search_check.sh`: the script.

## Suggested fix
In the native `/api/v2/search` handler, run the same exact-match resolution that `check-redirect` already does
(66-character hex = transaction, then block hash; 42-character hex = address/token/contract; digits = block number),
and return the Blockscout item shapes (`type`, `transaction_hash` / `block_number` / `address_hash`, `url`) ahead of the
name matches. Do the same for `/api/v2/search/quick`.

## Environment
- Explorer: https://new.explorer.somnia.network as served 2026-10-27 (`x-api-backend: native`, backend version
  `somnia-explorer (blockscout-compatible)`); its `llms.txt` fetched 14:15 UTC
- For comparison: https://explorer.somnia.network (Blockscout v10.2.6), same chain
- Somnia mainnet (Global), chain id 5031
- curl 8.18.0; read-only GET requests

**Distinct from** every earlier report of ours (#01–#39 are about dreamDEX on testnet). This is the new explorer's
search API on mainnet.
