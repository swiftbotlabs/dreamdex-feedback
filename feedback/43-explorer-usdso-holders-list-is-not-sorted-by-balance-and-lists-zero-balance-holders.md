# Explorer: the USDso Holders tab (and `/api/v2/tokens/<USDso>/holders`) is not sorted by the balance it shows, and at times lists zero-balance addresses among the top 50
Severity: normal
Area: explorer

> **Summary.** USDso is the quote currency of every Somnia Markets spot pair on the explorer's Markets page (Somnia
> Markets is the order-book protocol behind dreamDEX). On its
> token page, the Holders tab and `GET /api/v2/tokens/0x00000022dA000002656c64D9eA6011ea952D008A/holders` show each
> holder's *current* balance: the values match `balanceOf()` at the head block, except one or two rows per capture that
> changed between the two reads. But the rows are ranked by
> something else. In five captures over 50 minutes, page 1 (50 holders) had 6–10 places where a holder ranks above
> one with a larger balance (at 15:09, #14 held 228.79 USDso and #15 held 2,200.60). In four of the captures, addresses
> holding **0 USDso** were listed: 5 to 9 of the 50 rows, at ranks as high as 17 and 18, above holders with 400–1,000 USDso. The ranks and "Share" column on the page are therefore wrong for the middle
> of the list. A Blockscout-compatible client that pages through holders expecting descending balances will mis-rank or
> stop too early. explorer.somnia.network (Blockscout) returns the same token's page 1 in strict descending order.

> **Checked 2026-10-27, 14:19–15:09 UTC, Somnia mainnet (Global, chain 5031).** Each capture reads the API page, then
> `balanceOf()` for every listed holder in one JSON-RPC batch. Evidence: `evidence/43/earlier_runs_2026-10-27T1419-1438Z.txt`,
> `evidence/43/holders_run_2026-10-27T1442Z.txt`, `…T1504Z.txt`, `…T1509Z.txt`, and the raw pages
> `evidence/43/holders_page1_2026-10-27T1419Z.json`, `evidence/43/holders_page1_2026-10-27T1438Z.json`.

## Steps to reproduce
`python3 evidence/43/holders_check.py` (read-only; default token USDso), or by hand:

```sh
T=0x00000022dA000002656c64D9eA6011ea952D008A
curl -s https://new.explorer.somnia.network/api/v2/tokens/$T/holders \
  | jq -r '.items | to_entries[] | "\(.key+1) \(.value.address.hash) \(.value.value)"'
# check any row against the chain (balanceOf):
A=0x12cc1960eF5d0927cFF8Cfbbe831620e58FaAbF0
curl -s -H 'content-type: application/json' https://api.infra.mainnet.somnia.network/ \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"$T\",\"data\":\"0x70a08231000000000000000000000000${A:2}\"},\"latest\"]}"
```

In the browser: https://new.explorer.somnia.network/token/0x00000022dA000002656c64D9eA6011ea952D008A?tab=holders

## Expected
Holders are sorted by balance, descending, and holders with a zero balance are not listed, as on Blockscout. Rank *n*
always holds at least as much as rank *n + 1*.

## Actual
| capture (UTC) | zero-balance holders on page 1 (rank) | places where the next rank holds more |
|---|---|---|
| 14:19:02 | 17, 18, 30, 32, 48, 49, 50 | 6 (e.g. #18 0 → #19 996.07) |
| 14:38:43 | 17, 32, 48, 49, 50 (all five read 0 from `balanceOf` too) | 8 (e.g. #24 850 → #25 1,022.53) |
| 14:42:20 | none | 7 (e.g. #31 332.57 → #32 543.39) |
| 15:04:02 | 17, 18, 35, 40, 41, 42, 44, 49, 50 (all nine read 0 from `balanceOf` too) | 8 (e.g. #24 228.79 → #25 850) |
| 15:09:36 | 31, 33, 35, 36, 37, 47 (all six read 0 from `balanceOf` too) | 10 (e.g. #14 228.79 → #15 2,200.60) |

From the 14:38:43 capture (`evidence/43/earlier_runs_2026-10-27T1419-1438Z.txt`), the zero rows are
`0x12cc1960…FaAbF0` (#17), `0x20890028…556386` (#32), `0x20166B16…AA87a1` (#48), `0x427F71DB…A82eDE` (#49) and
`0xCE183238…A49434` (#50). `balanceOf` returned 0 for each at block 449,575,554. These addresses move USDso in and out
all the time: the explorer's own transfer list for `0x12cc1960…` shows 98.8, 160.38 and 218.04 USDso going to
`0x427F71DB…` and coming back every 20 seconds between 14:13 and 14:17 UTC. Our reading, not verified: the rank comes from
a balance taken at an earlier moment, and the value shown is refreshed later.

The rendered tab shows the same thing (desktop, 14:38:36 UTC): `16 … 1,390.994138 USDso` / `17 0xff681d…E6D4 1,009.655 USDso` /
`18 0xb569Fb…1227 1,032.92 USDso` / `19 … 996.071675 USDso` / `20 0x8ea764…d404 890.095 USDso` / `21 0x84C5DF…31B8 983.67791 USDso`.

Blockscout, same token, same minute (14:42:22): 50 holders, strictly descending, no zero rows (its values were behind
`balanceOf` for 11 of the 50, but its order was consistent).

## Evidence
- `evidence/43/holders_run_2026-10-27T1442Z.txt`, `evidence/43/holders_run_2026-10-27T1504Z.txt` and
  `evidence/43/holders_run_2026-10-27T1509Z.txt`: full output of the third to fifth captures, both explorers.
- `evidence/43/token_transfers_0x12cc_usdso_2026-10-27T1420Z.json`: the explorer's USDso transfer list for `0x12cc1960…`.
- `evidence/43/earlier_runs_2026-10-27T1419-1438Z.txt`, with the raw API pages `holders_page1_2026-10-27T1419Z.json`
  and `holders_page1_2026-10-27T1438Z.json`.
- `evidence/43/holders_check.py`: the script.

## Suggested fix
Rank the holders by the same balance that is shown (or refresh the ranking whenever balances are refreshed), drop
zero-balance rows from the holder list and from `holders_count`, and keep the cursor ordered by
`(value DESC, address)` so that paging stays consistent.

## Environment
- Explorer: https://new.explorer.somnia.network as served 2026-10-27 (`x-api-backend: native`; the tab says "Indexed by Somnia data warehouse")
- For comparison: https://explorer.somnia.network (Blockscout v10.2.6), same chain
- Somnia mainnet (Global), chain id 5031, RPC `https://api.infra.mainnet.somnia.network/`; USDso `0x00000022dA000002656c64D9eA6011ea952D008A`
- Python 3 standard library, Chrome 155 on Linux; read-only
