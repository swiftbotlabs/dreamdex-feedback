# Explorer API: address lists page through fixed windows of time or blocks, not through items. `transactions?filter=to` returns 29 empty pages, each with a "next" cursor, before an account's first incoming transfer, and a contract's `/logs` returns empty first pages. Blockscout returns the same rows on page 1.
Severity: normal
Area: explorer

> **Summary.** In Blockscout's API, a page holds up to `items_count` items, and `next_page_params` is set only when the
> page is full. So a page with no items is the end of the list. The new explorer's `llms.txt` says "Each API is Blockscout's or
> Etherscan's, so tools and code written for those work here unchanged". Two of its address lists break that rule:
> - `GET /api/v2/addresses/<a>/transactions?filter=to` pages through **4-day windows**. The cursor
>   is a base64 JSON timestamp (`{"u": 1792837457}`), and each "next" moves it back 345,600 s. For an active trading
>   account whose only two incoming transfers are from June/July, pages 1 to 29 are `"items": []` with a non-null
>   `next_page_params`. Page 30 holds 1 item. Blockscout returns both incoming transfers on page 1.
> - `GET /api/v2/addresses/<contract>/logs` pages through **10,000-block windows** (about 17 minutes of Somnia
>   blocks). For the verified WSOMI contract, pages 1 and 2 were empty and page 3 held one log. Blockscout's page 1
>   holds 50 logs, from that same log back through about 215,000 blocks, which would be about 22 more requests here.
>
> A client written for Blockscout that stops at the first empty page (the usual "fetch until the page is empty" loop)
> reports "no incoming transactions" or "no logs". A client that follows cursors until `null` needs 30 requests for 1
> incoming transfer. Nothing in the response tells the two cases apart: an empty window looks the same as the end of
> the list, except that the cursor is not `null`.

> **Checked 2026-10-28 at 10:18–10:20, 10:24–10:27 and 10:44–10:47 UTC, Somnia mainnet (Global, chain 5031)**, logged out,
> following every cursor 1.5 s apart. `filter=to` gave the same 29 empty pages in both script runs; the WSOMI `/logs` first page was empty in every run. Evidence: `evidence/53/empty_pages_2026-10-28T1024Z.txt`,
> `evidence/53/empty_pages_2026-10-28T1044Z.txt`.

## Steps to reproduce
`python3 evidence/53/empty_pages_check.py --pages 40` (read-only). For each query it follows `next_page_params` until the
first page with items, decodes the cursor, then prints Blockscout's page 1 for the same query.

By hand:
```sh
A=0x601b691a3C6372d6D7345df4f7E5D30d51535aCd      # trades on the order-book pools; nonce ~61.6M
curl -s "https://new.explorer.somnia.network/api/v2/addresses/$A/transactions?filter=to" | jq -c '{n: (.items|length), next: .next_page_params}'
# {"n":0,"next":{"cursor":"eyJ1IjoxNzkyODM3NDU3fQ","items_count":50}}
echo eyJ1IjoxNzkyODM3NDU3fQ== | base64 -d      # {"u":1792837457}  = 2026-10-24 10:24 UTC, 4 days before "now"
curl -s "https://new.explorer.somnia.network/api/v2/addresses/$A/transactions?filter=to&cursor=eyJ1IjoxNzkyODM3NDU3fQ&items_count=50" \
  | jq -c '{n: (.items|length), next: .next_page_params}'
# {"n":0,"next":{"cursor":"eyJ1IjoxNzkyNDkxODU3fQ","items_count":50}}   ... and so on, 29 times
curl -s "https://explorer.somnia.network/api/v2/addresses/$A/transactions?filter=to" | jq -c '[.items[] | {block_number, timestamp, value}]'
# 2 items: block 348,577,162 (2026-07-02) and block 340,130,077 (2026-06-22)

W=0x046EDe9564A72571df6F5e44d0405360c0f4dCab      # WSOMI (verified WETH9)
curl -s "https://new.explorer.somnia.network/api/v2/addresses/$W/logs" | jq -c '{n: (.items|length), next: .next_page_params}'
# {"n":0,"next":{"block_number":450278047,"items_count":50}}
curl -s "https://explorer.somnia.network/api/v2/addresses/$W/logs" | jq '.items | length'      # 50
```

## Expected
A page holds up to `items_count` matching items, however far back they are. `next_page_params` is `null` when there
are no more. The two incoming transfers and the WSOMI logs come back on page 1, as on Blockscout. If a scan has to
be bounded, the response should say so, for example with a `scanned_to` field or a 501 as `llms.txt` describes. It
should not send an empty page with a "next" cursor that looks like an ordinary page.

## Actual
`evidence/53/empty_pages_2026-10-28T1024Z.txt` (abridged). In the 10:44 run, `filter=to` again gave 29 empty pages. The WSOMI logs gave 1 empty page and then a page of 3, because WSOMI had new activity at block 450,289,363; Blockscout's page 1 again held 50:

```
### incoming transactions of an active trading account
    /api/v2/addresses/0x601b691a3C6372d6D7345df4f7E5D30d51535aCd/transactions  {'filter': 'to'}
  2026-10-28T10:24:20Z NEW page  1: HTTP 200 [native] items  0  next_page_params {'cursor': 'eyJ1IjoxNzkyODM3NDU3fQ', 'items_count': 50} cursor decodes to {'u': 1792837457, 'u_as_time': '2026-10-24 10:24Z'}
  2026-10-28T10:24:24Z NEW page  2: HTTP 200 [native] items  0  next_page_params {'cursor': 'eyJ1IjoxNzkyNDkxODU3fQ', 'items_count': 50} cursor decodes to {'u': 1792491857, 'u_as_time': '2026-10-20 10:24Z'}
  …
  2026-10-28T10:26:29Z NEW page 29: HTTP 200 [native] items  0  next_page_params {'cursor': 'eyJ1IjoxNzgzMTYwNjU3fQ', 'items_count': 50} cursor decodes to {'u': 1783160657, 'u_as_time': '2026-07-04 10:24Z'}
  2026-10-28T10:26:32Z NEW page 30: HTTP 200 [native] items  1  next_page_params {'cursor': 'eyJiIjozNDg1NzcxNjIsImkiOjAsInUiOjE3ODI5ODc4NTd9', 'items_count': 50} …  first item (348577162, '0xa9070a5aec', '2026-07-02T11:15:26.000000Z')
  -> 29 empty page(s) with a cursor before the first item
  2026-10-28T10:26:34Z Blockscout page 1: HTTP 200 items 2  first (348577162, '0xa9070a5aec', '2026-07-02T11:15:26.000000Z')  last (340130077, '0x8e4e385614', '2026-06-22T15:07:58.000000Z')

### event logs of the WSOMI contract (verified, WETH9)
  2026-10-28T10:26:37Z NEW page  1: HTTP 200 [native] items  0  next_page_params {'block_number': 450278047, 'items_count': 50}
  2026-10-28T10:26:40Z NEW page  2: HTTP 200 [native] items  0  next_page_params {'block_number': 450268047, 'items_count': 50}
  2026-10-28T10:26:42Z NEW page  3: HTTP 200 [native] items  1  next_page_params {'block_number': 450258047, 'items_count': 50}  first item (450262730, '0xe03461337e', '')
  -> 2 empty page(s) with a cursor before the first item
  2026-10-28T10:26:46Z Blockscout page 1: HTTP 200 items 50  first (450262730, '0xe03461337e', '')  last (450047679, '0xdb876715f1', '')
```

The unfiltered `/transactions` list and `filter=from` return full pages for the same account, because it sends a
transaction every few seconds. Only the sparse lists show the problem.

## Evidence
- `evidence/53/empty_pages_2026-10-28T1024Z.txt`, `evidence/53/empty_pages_2026-10-28T1044Z.txt`: two runs, every page logged.
- `evidence/53/empty_pages_check.py`: the script.

## Suggested fix
Keep scanning windows on the server until the page holds `items_count` items or the account's first activity is
reached, and only then return (or keep a per-address index of incoming transactions and logs, as Blockscout does). Return `next_page_params: null` when nothing older exists. If a request must stop
early for cost reasons, say so in the response rather than returning an empty page that looks like a normal page.

## Environment
- Explorer: https://new.explorer.somnia.network as served 2026-10-28 (`x-api-backend: native`)
- For comparison: https://explorer.somnia.network (Blockscout v10.2.6), same chain
- Somnia mainnet (Global), chain id 5031
- Python 3.14 (standard library only), curl 8.18.0; read-only
