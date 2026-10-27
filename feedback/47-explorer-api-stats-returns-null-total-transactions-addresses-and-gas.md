# Explorer API: `GET /api/v2/stats` answers 200 with `total_transactions`, `total_addresses` and `total_gas_used` set to `null`, so a Blockscout client gets no chain totals. Blockscout returns 1.9 billion transactions and 6.9 million addresses for the same chain.
Severity: normal
Area: explorer

> **Summary.** `/api/v2/stats` is the endpoint the Blockscout front-end reads for its headline chain totals.
> On new.explorer.somnia.network it returns `"total_transactions": null`, `"total_addresses": null` and
> `"total_gas_used": null`, with HTTP 200 and `x-api-backend: native`. The other fields are filled (`total_blocks`,
> `transactions_today`, `gas_used_today`, `average_block_time`). For the same chain, explorer.somnia.network (Blockscout
> v10.2.6) returns `"total_transactions": "1916432551"` and `"total_addresses": "6937910"`. The explorer's `llms.txt`
> says "What no source can answer is a 501 that says so, never made-up data". `null` inside a 200 is neither a value nor
> that 501, so a client cannot tell "not available" from a broken response.

> **Checked 2026-10-27 at 14:14, 14:15, 14:23, 14:46 and 15:03 UTC, Somnia mainnet (Global, chain 5031).** The three fields
> were `null` every time. Evidence: `evidence/47/stats_2026-10-27T1446Z.txt`, `evidence/47/stats_2026-10-27T1502Z.txt`.

## Steps to reproduce
`bash evidence/47/stats_check.sh` (read-only), or:

```sh
for base in https://new.explorer.somnia.network https://explorer.somnia.network; do
  curl -s $base/api/v2/stats | jq -c '{total_blocks, total_transactions, total_addresses, total_gas_used, transactions_today}'
done
```

## Expected
Either the three totals are filled, as on Blockscout (the explorer's Charts page already shows 90 days of per-day
transaction and active-address series), or the
endpoint does what `llms.txt` promises for data it cannot answer: a 501 with a message, or the fields left out of the
response.

## Actual
`evidence/47/stats_2026-10-27T1446Z.txt`:

```
== 2026-10-27T14:46:16Z GET https://new.explorer.somnia.network/api/v2/stats -> HTTP/2 200  (x-api-backend: native)
   total_blocks         '449580054'
   total_transactions   None
   total_addresses      None
   total_gas_used       None
   transactions_today   '870447'
   gas_used_today       '670067427535'
   average_block_time   100
== 2026-10-27T14:46:18Z GET https://explorer.somnia.network/api/v2/stats -> HTTP/2 200  (x-api-backend: none)
   total_blocks         '449576823'
   total_transactions   '1916432551'
   total_addresses      '6937910'
   total_gas_used       '0'
   transactions_today   '945477'
   gas_used_today       '747892240722'
   average_block_time   101.0
```

## Evidence
- `evidence/47/stats_2026-10-27T1446Z.txt`, `evidence/47/stats_2026-10-27T1502Z.txt`: two runs, both explorers.
- `evidence/47/earlier_checks_2026-10-27T1414-1423Z.txt`: the first three reads of the endpoint.
- `evidence/47/stats_check.sh`: the script.

## Suggested fix
Fill `total_transactions` and `total_addresses` from the warehouse (or from a periodic counter, as Blockscout does), and
`total_gas_used` the same way. Until they exist, leave them out of the response or follow the documented 501 rule, so
that clients can tell "not available" from a value.

## Environment
- Explorer: https://new.explorer.somnia.network as served 2026-10-27 (`x-api-backend: native`); `llms.txt` fetched 14:15 UTC
- For comparison: https://explorer.somnia.network (Blockscout v10.2.6), same chain
- Somnia mainnet (Global), chain id 5031
- curl 8.18.0; read-only
