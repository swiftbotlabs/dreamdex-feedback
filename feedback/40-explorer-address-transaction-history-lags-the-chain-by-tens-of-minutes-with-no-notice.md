# Explorer: an address's transaction history (Transactions tab, `/api/v2/addresses/<a>/transactions`, Etherscan `txlist`) lags the chain by up to half an hour and moves forward in jumps, with nothing on the page saying so
Severity: normal
Area: explorer

> **Summary.** On new.explorer.somnia.network, the history of an active account is not current. For two accounts that
> send a transaction every second or two, the newest row of `GET /api/v2/addresses/<a>/transactions` and of the
> Etherscan-style `txlist` stood still, then jumped forward by about 9,000 blocks (15 minutes of chain) at a time. Over
> 54 minutes of polling it was up to **16,472 blocks (27 min) behind the RPC head**. The rendered Transactions tab showed the
> newest row as "18 min ago" at 14:46 and "37 min ago" at 15:05 UTC. At the same time, the page's own "Transactions
> sent" figure kept rising, the header showed the live head block, the newer transactions opened by hash, and the CSV
> export of the same address listed them (its newest row within about 50 blocks of the head). The page shows no "indexed
> up to block N" or "delayed" notice, so a user who has just sent a transaction cannot find it in their own history and is
> not told why. The two list endpoints and the page also disagree with each other, by up to 30 minutes.

> **Checked 2026-10-27, 14:20–15:15 UTC, Somnia mainnet (Global, chain 5031)**, by polling the explorer API every ~2–5
> minutes against the RPC head, plus the rendered address page. Evidence: `evidence/40/history_lag_monitor_2026-10-27T1421-1515Z.txt`,
> `evidence/40/history_check_2026-10-27T1449Z.txt`, `evidence/40/history_check_2026-10-27T1510Z.txt`,
> `evidence/40/address_page_0xa2842ED9_2026-10-27T1446Z.png`, `evidence/40/address_page_text_2026-10-27T1505-1506Z.txt`.

new.explorer.somnia.network covers Somnia mainnet. In its chain picker, the testnets (including dreamDEX's Tokyo testnet,
50383) link out to explorer.testnet.somnia.network, so this report and #41–#47 are about mainnet, the chain the new explorer
shows. (A Tokyo testnet transaction hash opened on the new explorer gets a correct "Not on Global · This transaction is on
Tokyo testnet · Open on Tokyo testnet" page.) The explorer's `llms.txt` describes the address page as "with its
transactions, token transfers and balances", and says "Each API is Blockscout's or Etherscan's, so tools and code written
for those work here unchanged".

## Steps to reproduce
1. Pick an account that sends transactions all the time, e.g. `0xa2842ED9149047AB152b2102553c4c45F76547cD` or
   `0x1DCE9E1F3843572020ADdEF2c5A7B1F1b0A56c0c`.
2. Run the read-only check, `python3 evidence/40/history_check.py <address>`. It prints the RPC head and nonce, then the
   newest row from each of these:
   ```sh
   A=0xa2842ED9149047AB152b2102553c4c45F76547cD
   curl -s https://new.explorer.somnia.network/api/v2/addresses/$A/transactions | jq '.items[0] | {block_number, timestamp, nonce}'
   curl -s "https://new.explorer.somnia.network/api?module=account&action=txlist&address=$A&page=1&offset=1&sort=desc" | jq '.result[0] | {blockNumber, timeStamp, nonce}'
   curl -s "https://new.explorer.somnia.network/api/v2/addresses/$A/transactions/csv?from_period=$(date -u +%F)&to_period=$(date -u +%F)" | sed -n 2p
   curl -s -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' https://api.infra.mainnet.somnia.network/
   ```
3. Repeat every few minutes. `python3 evidence/40/lag_monitor.py 14 285` does this for about 70 minutes.
4. Open https://new.explorer.somnia.network/address/0xa2842ED9149047AB152b2102553c4c45F76547cD and compare the AGE of
   the newest row with the head block in the header and with "Transactions sent".

## Expected
The Transactions tab, `/api/v2/addresses/<a>/transactions` and `txlist` include the address's transactions up to the head
block (within seconds), as explorer.somnia.network (Blockscout) does. The new explorer already serves these live: the head
block, the block and transaction pages, the token page's transfers and the CSV export. If the history comes from a batch
index that is allowed to lag, the tab should say "indexed up to block N (X min ago)", and the API should expose that block.

## Actual
From `evidence/40/history_lag_monitor_2026-10-27T1421-1515Z.txt`, the newest row of each list against the RPC head:

| UTC | RPC head | `0xa2842ED9…` `/transactions` newest | behind | `0xa2842ED9…` `txlist` newest | `0x1DCE9E1F…` `/transactions` newest | behind |
|---|---|---|---|---|---|---|
| 14:21:37 | 449,565,274 | 449,560,182 | 5,092 | 449,560,182 | 449,560,179 | 5,095 |
| 14:23:42 | 449,566,523 | 449,560,182 | 6,341 | 449,560,182 | 449,560,179 | 6,344 |
| 14:25:52 | 449,567,823 | 449,560,182 | 7,641 | 449,560,182 | 449,560,179 | 7,644 |
| 14:28:00 | 449,569,099 | 449,560,182 | 8,917 | 449,560,182 | 449,560,179 | 8,920 |
| 14:30:10 | 449,570,405 | 449,560,182 | 10,223 | 449,560,182 | 449,560,179 | 10,226 |
| 14:31:59 | 449,571,489 | 449,560,182 | 11,307 | 449,560,182 | timeout | – |
| 14:32:20 | 449,571,699 | 449,560,182 | 11,517 | 449,560,182 | 449,560,179 | 11,520 |
| 14:37:40 | 449,574,897 | 449,560,182 | 14,715 | 449,560,182 | 449,560,179 | 14,718 |
| 14:43:16 | 449,578,256 | 449,569,192 | 9,064 | 449,569,192 | 449,569,196 | 9,060 |
| 14:48:32 | 449,581,419 | 449,569,192 | 12,227 | 449,569,192 | 449,578,103 | 3,316 |
| 14:53:41 | 449,584,503 | 449,578,147 | 6,356 | 449,578,147 | 449,578,103 | 6,400 |
| 14:59:04 | 449,587,733 | 449,578,147 | 9,586 | 449,578,147 | 449,578,103 | 9,630 |
| 15:04:09 | 449,590,790 | 449,578,147 | 12,643 | 449,578,147 | 449,578,103 | 12,687 |
| 15:09:45 | 449,594,141 | 449,587,140 | 7,001 | 449,587,140 | 449,587,140 | 7,001 |
| 15:14:54 | 449,597,230 | 449,587,140 | 10,090 | 449,587,140 | 449,587,140 | 10,090 |

So the lists stand still and then jump about 9,000 blocks at a time (449,560,182 → 449,569,192 → 449,578,147 →
449,587,140 …). Meanwhile the account's RPC nonce went from 920,664 (14:18:42)
to 922,565 (15:06:14, "Transactions sent" on the page). That is about 1,900 transactions, and each was missing from the
history for up to half an hour or more after it was sent. The other paths were current at the same moments:

- **CSV export** of the same address and day, `evidence/40/history_check_2026-10-27T1449Z.txt`: at 14:49:20 its newest row was
  block 449,581,902, 44 blocks *ahead* of the head our RPC call had returned seconds earlier, while `/transactions` was at
  449,569,192 (12,666 blocks behind). At 15:10:16 (`…T1510Z.txt`): CSV 449,594,461, `/transactions` 449,587,140.
- **A transaction from the gap opens by hash.** `0xfdba2c5d9e5b8808415222751ba52f5558cf35404515c6495fa7c4045a0d9a6a`
  (from `0x1DCE9E1F…`, block 449,561,818, 14:15:51 UTC) is returned by `/api/v2/transactions/<hash>` and `/tx/<hash>`. It
  was not in that address's list from 14:21 to 14:37 UTC, when the list's newest row was block 449,560,179. It is in
  `txlist` for that block now (checked 14:50:15, `history_check_2026-10-27T1449Z.txt`).
- **The address page**, screenshot `evidence/40/address_page_0xa2842ED9_2026-10-27T1446Z.png` (14:46:53 UTC): the header
  reads "Global · #449,580,420". The newest row is block 449,569,192, "18 min ago". "Transactions sent" reads 921,725.
  There is no notice that the list is behind.
- **The page, the v2 list and `txlist` disagree** (`evidence/40/address_page_text_2026-10-27T1505-1506Z.txt`, the monitor
  log and `history_check_2026-10-27T1510Z.txt`). For `0xa2842ED9…`, `/transactions` returned 449,578,147 at 15:04:09 and
  449,587,140 at 15:04:54. The page then showed 449,569,192, "37 min ago", at 15:05:33, and 449,587,140, "8 min ago", on
  reload at 15:06:14. For `0x1DCE9E1F…` at 15:10:28, `/transactions` was at 449,587,140 (14:58:04) while `txlist` was at
  449,578,103 (14:43:00), 16,472 blocks behind the head.
- **Token transfers lag too.** The per-address token-transfer list of `0x12cc1960eF5d0927cFF8Cfbbe831620e58FaAbF0` stayed at
  block 449,562,703 from 14:20 to at least 14:30 UTC (monitor log), while the USDso token page listed transfers seconds old.

Not every address is affected. During the same watch, the list for `0x601b691a3C6372d6D7345df4f7E5D30d51535aCd`
(61.5 million transactions sent) stayed current, within about 120 blocks of the head on every poll. But in that list
`nonce` and `gas_used` are `null` on every row (`evidence/40/address_0x601b_rows_2026-10-27T1440Z.json`). For that address,
`txlist` answers `{"message":"Not available: the explorer cannot answer this request right now","result":null,"status":"0"}`
and `/counters` returns `transactions_count: null`. So the API serves a current list for some addresses and a lagging one
for others, and the response does not say which.

## Evidence
- `evidence/40/history_lag_monitor_2026-10-27T1421-1515Z.txt`: every poll, with the RPC head, each list's newest block and the gap.
- `evidence/40/history_check_2026-10-27T1449Z.txt`, `evidence/40/history_check_2026-10-27T1510Z.txt`: the per-address
  check, covering `/transactions`, `txlist`, `/counters`, CSV and the RPC nonce, plus the gap transaction by hash.
- `evidence/40/address_page_0xa2842ED9_2026-10-27T1446Z.png` ("18 min ago") and
  `evidence/40/address_page_0xa2842ED9_2026-10-27T1506Z.png` ("8 min ago", after the 15:05 "37 min ago" read):
  the address page under a live head.
- `evidence/40/address_page_text_2026-10-27T1505-1506Z.txt`: the rendered text of three address pages, 15:05–15:06 UTC.
- `evidence/40/address_0x601b_rows_2026-10-27T1440Z.json`: the current list for `0x601b…`, where `nonce` and `gas_used` are null.
- `evidence/40/history_check.py`, `evidence/40/lag_monitor.py`: the read-only scripts.

## Suggested fix
- Keep the address-history index within a few blocks of the head, or fill the gap between the index and the head from the
  live path that the CSV export already uses.
- Until then, show "indexed up to block N · X min ago" on the Transactions and Token transfers tabs, and return that block
  in the API response (for example a header such as `x-indexed-block`).
- Serve one snapshot per address to the page, `/transactions` and `txlist`, and return the same fields from both paths
  (`nonce` and `gas_used` are null on the live rows).

## Environment
- Explorer: https://new.explorer.somnia.network as served 2026-10-27, 14:20–15:15 UTC (`x-api-backend: native`,
  `/api/v2/config/backend-version` = `somnia-explorer (blockscout-compatible)`)
- For comparison: https://explorer.somnia.network (Blockscout v10.2.6), same chain
- Somnia mainnet (Global), chain id 5031, RPC `https://api.infra.mainnet.somnia.network/`
- curl 8.18.0, Python 3 (standard library only), Chrome 155 on Linux for the rendered page
- Read-only: GET requests and `eth_*` reads, at most about 1 request per second

**Distinct from** our #33 (dreamDEX app links that point at the wrong explorer network) and #11 (archived). Those are
about links from the dreamDEX app to the old testnet explorer. This report is about the new explorer's own address
history on mainnet.
