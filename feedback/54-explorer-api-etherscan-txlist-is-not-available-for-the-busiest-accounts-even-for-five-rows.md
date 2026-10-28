# Explorer API: Etherscan `txlist` answers "Not available: the explorer cannot answer this request right now" for every account with more than about 2.5M transactions, even for `page=1&offset=5`. This includes the chain's most-called contract. The explorer's REST list and Blockscout answer the same request.
Severity: normal
Area: explorer

> **Summary.** `GET /api?module=account&action=txlist&address=<a>&page=1&offset=5&sort=desc` asks for an account's 5
> newest transactions. The new explorer's `llms.txt` lists it among the Etherscan-compatible actions that "work here
> unchanged". For the five busiest accounts we tried, it returns HTTP 200 with `"status": "0"`, `"result": null` and
> `"message": "Not available: the explorer cannot answer this request right now"`, within about a second.
> They are the contract the explorer's Charts page calls AgentRequester (`0x5E5205CF…63E6`, 19.05M transactions on
> the explorer's own counter), two other contracts with 15.4M and 4.3M, and two EOAs with nonces of 2.64M and 61.6M. The same request
> succeeds for accounts with 0.96M, 1.58M and 2.46M transactions. So the limit is somewhere between 2.46M and 2.64M,
> and it does not depend on page size, since 5 rows fail as well. The answer was the same every time from 10:28 to 10:48 UTC (two
> script runs and a first sweep), so "right now" is misleading: for these accounts it reads as a permanent limit. For the same accounts, the explorer's own
> `/api/v2/addresses/<a>/transactions` returns 50 rows in about 2 s, and explorer.somnia.network (Blockscout) answers
> the `txlist` call with 5 rows. Adding `startblock` (the head minus 200,000 or 2,000,000 blocks) makes the call work,
> so the data is there. The plain call never gets to it.

> **Checked 2026-10-28 at 10:28–10:36 and 10:46–10:48 UTC, Somnia mainnet (Global, chain 5031)**, 8 accounts each run
> (5 busy and 3 controls), logged out. Same split both times. Evidence: `evidence/54/txlist_busy_2026-10-28T1034Z.txt`,
> `evidence/54/txlist_busy_2026-10-28T1046Z.txt`.

## Why it matters
`txlist` is the call that most wallets, tax tools, bots and indexers use to read "this address's transactions"
through an Etherscan-style API. The accounts it refuses are the ones people look up most: the most-called contract on
the chain (#45 shows it as an unverified proxy, so a developer is likely to look at it here), and the busiest bots and
market accounts. A client gets no rows and an error that suggests retrying later, although retrying did not help in 20 minutes of tries.

## Steps to reproduce
`python3 evidence/54/txlist_busy_accounts_check.py` (read-only). For each account it prints the RPC nonce, the new
explorer's `counters.transactions_count`, the `txlist` result on both explorers, and the new explorer's REST list. It
then repeats `txlist` for the first account with a `startblock`.

By hand:
```sh
A=0x5E5205CF39E766118C01636bED000A54D93163E6
curl -s "https://new.explorer.somnia.network/api?module=account&action=txlist&address=$A&page=1&offset=5&sort=desc"
# {"message":"Not available: the explorer cannot answer this request right now","result":null,"status":"0"}
curl -s "https://new.explorer.somnia.network/api/v2/addresses/$A/transactions" | jq '.items | length'       # 50
curl -s "https://explorer.somnia.network/api?module=account&action=txlist&address=$A&page=1&offset=5&sort=desc" | jq '.result | length'   # 5
curl -s "https://new.explorer.somnia.network/api/v2/addresses/$A/counters" | jq .transactions_count           # "19054152"
# control, 2.46M transactions:
curl -s "https://new.explorer.somnia.network/api?module=account&action=txlist&address=0x1a9Fa14e6Fb2825A1815e2E760F0F32e5003d073&page=1&offset=5&sort=desc" | jq .status   # "1"
```

## Expected
`txlist` returns the requested page for any address, as Blockscout does. A page of 5 rows should not depend on how
long the history is. If an account really is too large for an unbounded query, the response should say what to do
instead (for example "pass startblock/endblock") and should not say "right now". In the explorer's own terms, a 501
that says so.

## Actual
`evidence/54/txlist_busy_2026-10-28T1034Z.txt` (abridged; the 10:46 run gives the same split):

```
account                                      kind      tx count (explorer)   NEW txlist page=1&offset=5          NEW REST list   Blockscout txlist
0x5E5205CF39E766118C01636bED000A54D93163E6   contract  19,054,152            status 0 "Not available … now"     50 items        5 rows
0x59c53Ec71c94362a271d807518Be6877b0Ab6e33   contract  15,400,391            status 0 "Not available … now"     50 items        5 rows
0x4Df3481691589a02d081246aBE3658E52f265E0e   contract   4,300,833            status 0 "Not available … now"     50 items        5 rows
0x9F1fC6149C21aFdDD730a02264780AEc0eE4125D   EOA        2,644,229            status 0 "Not available … now"     50 items        5 rows
0x601b691a3C6372d6D7345df4f7E5D30d51535aCd   EOA        null (nonce 61.6M)   status 0 "Not available … now"     50 items        5 rows
0x1a9Fa14e6Fb2825A1815e2E760F0F32e5003d073   EOA        2,462,204            status 1 OK, 5 rows                 50 items        5 rows
0xa2842ED9149047AB152b2102553c4c45F76547cD   EOA          963,491            status 1 OK, 5 rows                 50 items        5 rows
0x046EDe9564A72571df6F5e44d0405360c0f4dCab   contract   1,578,362            status 1 OK, 5 rows                 50 items        5 rows
```

The failing calls return in 0.8–1.3 s, so they are refused rather than timed out. On the explorer's REST list, the
newest row of the five busy accounts is within about 100 blocks of the RPC head. For the two busy control EOAs, the REST list and `txlist`
were 4,700–13,800 blocks behind Blockscout's newest row, which is the history lag already reported in #40.

## Evidence
- `evidence/54/txlist_busy_2026-10-28T1034Z.txt`, `evidence/54/txlist_busy_2026-10-28T1046Z.txt`: two runs; the second
  also has the `startblock` variant (`status 1`, 5 rows).
- `evidence/54/earlier_check_sample_accounts_2026-10-28T1031Z.txt`: the first sweep over 13 accounts seen in recent
  transactions (5 refused). Its one "No transactions found" row is a contract created 2 minutes earlier, so that row
  shows the history lag of #40, not this issue.
- `evidence/54/txlist_busy_accounts_check.py`: the script.

## Suggested fix
Serve `txlist` from the same per-address path that already answers `/api/v2/addresses/<a>/transactions` for these
accounts, or apply a default block window and page backwards, as `startblock` already does by hand. Use the
documented 501, with a hint about `startblock`/`endblock`, only when a request truly cannot be answered. Do not use
"right now" for a limit that is permanent.

## Environment
- Explorer: https://new.explorer.somnia.network as served 2026-10-28 (`x-api-backend: native`)
- For comparison: https://explorer.somnia.network (Blockscout v10.2.6), same chain
- Somnia mainnet (Global), chain id 5031; RPC https://api.infra.mainnet.somnia.network/
- Python 3.14 (standard library only), curl 8.18.0; read-only
