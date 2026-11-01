# Event Contracts: the "Settles against" link and the documented oracle audit open "question not found" for every market since 2026-10-01 07:05 UTC (25,446 mainnet markets and counting)
Severity: major
Area: app | docs

> **Summary.** The docs and the support FAQ send every trader who disputes a settlement to the oracle explorer: "If a result ever
> looks wrong, that page is the receipt". The order ticket links to it from its **Settles against: Prophecy Oracle** row. Since the
> window that expired 2026-10-01 07:05 UTC, no market has a question there. A market's `oracleQuestionId` is now a 77-digit hash, and
> the explorer answers **"question not found"**. The explorer's own index has none of them: 0 of 400 sampled, against 141 of 141
> for the older numeric ids. The source values, the median and the receipts that the docs promise cannot be seen for 25,446 mainnet
> markets, which is every market of the last 31 days.
>
> **Checked 2026-11-01, 11:20–11:51 UTC**, logged out, on Somnia mainnet (chain 5031). Evidence: `evidence/60/`.

## Steps to reproduce
1. Open https://app.dreamdex.io/event-contracts/WBTC:USDso/15m, logged out. Press **+$5** and open **ORDER PREVIEW**. The last row reads
   **Settles against: Prophecy Oracle**.
2. Click it. It opens `https://prd.oracle.somnia.host/questions/<77-digit id>?view=graph`.
3. The page says "question not found. It might not be indexed yet, or the indexer isn't running." The indexer is running: it keeps
   adding other questions (question 77289 resolved at 2026-11-01 11:25 UTC).
4. Positive control: https://prd.oracle.somnia.host/questions/71125?view=graph, the ETH price question of a market from 2026-10-01, shows
   the full page the docs describe: sources, median 2714.46, the Graph tab.
5. Check every market at once, read-only, Python 3 standard library:
   ```sh
   python3 evidence/60/question_links.py
   ```
   It finds the switch in the market list and asks the explorer's own GraphQL (`https://prd.oracle.somnia.host/v1/graphql`) for a
   sample on each side of it.

## Expected
As the docs state, for every market:

- Developers, Market Structure, "Auditing a resolution": "A market row carries an `oracleQuestionId`, and that id is the question's number
  on the oracle explorer, so you can deep-link any market straight to its own resolution".
- Settlement & Voids: "Every market's settlement question is public on the oracle explorer. Open a question and switch to the **Graph** tab
  to see the whole pipeline for that specific market".
- FAQ, "My Event Contract settled against me": "**Every settlement is published and you can check it yourself.**" and "**If a result looks
  wrong, that page is the receipt.**"
- Ticket tooltip: "The oracle publishes the result at expiry — open the question to see the sources behind it."

## Actual
```
mainnet Up/Down markets: 58582
last numeric id:  market 008170 expiry 2026-10-01 07:00 UTC oracleQuestionId 71133
first hash id:    market 008175 expiry 2026-10-01 07:05 UTC oracleQuestionId 7105068297815576695377939687912806770397710353...
markets with hash ids: 25446
200 numeric ids before the switch: 141 distinct, found on the explorer: 141
200 hash ids just after the switch: 200 distinct, found on the explorer: 0
200 newest hash ids: 200 distinct, found on the explorer: 0
newest price question on the explorer: id 71132, "What is the price of BTC in USDC at unix time 1790838000 UTC?"
```

- The explorer stops at the same moment: its newest price question resolves at 1790838000, 2026-10-01 07:00 UTC, and it still takes
  other questions (77,300 in all, the newest resolved today).
- Answers did not stop. The market indexer's `OracleAnswer` rows and the chain carry the results, but nothing a trader can open shows
  the sources, the median or the receipts behind them.
- The settled value now tracks an on-chain price feed. On 1,150 of 1,150 expiries with a feed row from 2026-10-30 to 11-01, the oracle
  value equals the feed's `spot` at expiry, floored to 2 decimals (`price-feed.prd.oracle.somnia.host`, whose `Feed.description` reads
  "PriceFeedScheduler: spot index + EMA mark"; see `evidence/57/ec_settlement_rule_2026-10-30_to_11-01.txt`). The docs say nothing about that
  feed. They still describe "a multi-source price reference", a median across sources, and how many sources had to agree, and the ticket
  still names Prophecy Oracle. We can't tell from outside how many sources feed it now.

The practical result: a trader who follows the FAQ to dispute any market from the last month gets an error page that looks like an outage,
and support's own procedure ("We will pull the settlement question and walk through the sources with you") has no public page to point at.

## Evidence
- `evidence/60/question_links.py`, output `evidence/60/question_links_2026-11-01T1150Z.txt`.
- `evidence/60/app_mainnet_ticket_settles_against_prophecy_2026-11-01T1150Z.png`: the ticket's Settles against row, logged out.
- `evidence/60/oracle_explorer_ticket_link_question_not_found_2026-11-01T1140Z.png`: where that link goes.
- `evidence/60/oracle_explorer_old_numeric_question_71125_works_2026-11-01T1140Z.png`: positive control, a numeric question.
- The app's code builds the link from `oracleQuestionId` directly: `/questions/${encodeURIComponent(e)}?view=graph` on the mainnet explorer origin
  (build `dpl_APn5RXN7wVXb85FPw8qN3WgNmVMw`).

## Suggested fix
1. Publish the settlement pipeline for the new questions: index the hash ids on the explorer, or point **Settles against** at a page that shows the
   feed row used, its timestamp and its sources.
2. Until then, hide the link, or change the label, so the ticket doesn't promise a page that doesn't exist.
3. Update Market Structure, Settlement & Voids, the FAQ and the tooltip to describe the feed, including how many sources it takes and which instant
   the settlement reads.

## Environment
- Somnia mainnet (chain 5031), indexer https://prd.smk.somnia.host/v1/graphql, oracle explorer https://prd.oracle.somnia.host
- App https://app.dreamdex.io, build `dpl_APn5RXN7wVXb85FPw8qN3WgNmVMw`, Chrome on Linux, 1600×786, logged out
- Docs: https://app.dreamdex.io/llms-full.txt as served 2026-11-01 (byte-identical to 2026-10-30)
- Python 3 (standard library only); read-only, no transactions sent
