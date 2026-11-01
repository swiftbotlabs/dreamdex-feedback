# Docs: Event Contracts are documented as "15-minute and 1-hour windows", but 5-minute windows have traded on mainnet since 2026-09-01
Severity: normal
Area: docs

> **Summary.** The Event Contracts page says: "BTC and ETH on 15-minute and 1-hour windows at the time of writing". The mainnet app's ticket offers **5m, 15m and 1h**, and the indexer has live 300-second markets for both assets. Tokyo offers 5m and 10m. The first 5-minute market expired 2026-09-01 10:10 UTC, so the line has been out of date for two months.
>
> **Checked 2026-11-01, 12:48 UTC**, read-only. Evidence: `evidence/60/app_mainnet_ticket_settles_against_prophecy_2026-11-01T1150Z.png` shows the 5m, 15m and 1h tabs.

## Steps to reproduce
```sh
curl -s https://prd.smk.somnia.host/v1/graphql -H 'content-type: application/json' \
  -d '{"query":"{ Market(where:{marketType:{_eq:BINARY}}, limit:6, order_by:{expiry:desc}) { asset intervalSec expiry } }"}'
```
Open https://app.dreamdex.io/event-contracts/WBTC:USDso/5m.

## Expected
The page lists the series the venue offers, or points to where to read them.

## Actual
Six live series on mainnet: BTC and ETH at 300, 900 and 3600 seconds.

## Evidence
The screenshot named above, plus the query. Docs: `https://app.dreamdex.io/llms-full.txt`, Event Contracts, "Rolling Windows".

## Suggested fix
Add 5-minute windows, and say Tokyo's differ.

## Environment
Somnia mainnet (chain 5031), indexer `https://prd.smk.somnia.host/v1/graphql`; app logged out.
