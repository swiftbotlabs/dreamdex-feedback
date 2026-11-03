# App: Perps Arena stopped counting trades at 17:46 UTC on Nov 2, so quest progress (raffle tickets) and the week 4 leaderboard are frozen, while the chart above the board keeps updating
Severity: major
Area: app

> **Summary.** Perps Arena's activity feed has not moved since **2026-11-02 17:46:59 UTC**, about 3 hours and 47 minutes into week 4, the last week of the competition. Three things are stuck, and all three fit that cut-off:
> - **Quests.** We opened and fully closed a position on our own Arena account at 08:34–08:36 UTC on Nov 3. The hosted indexer had both trades by 08:46. The quest scorer has run at least four times since then (`scoredAt` 08:50:14, 08:56:17, 09:02:10 and, at our last read, 09:25:34), and it still shows no week 4 progress at all. "Close a position today" is not credited, and the all-time volume counter has not moved. Quest points are what buy raffle tickets.
> - **The week 4 leaderboard.** The table still says "Updated November 2, 17:00 UTC", and its trade and day counts stop at 17:46:59. The #1 trader shows 27 trades on 1 day; the indexer has 41 on 2 days.
> - **The qualification counters**, which are built from those counts ("This week: 0 of 10 closes, 0 of 3 days").
>
> The equity chart drawn above the same table still plots hourly ROI, and for the top three traders it matches the chain to the cent. The chart has #1 at +65.95% while the table shows +20.07%. The API also reports `activitySettling: false, activityPending: 0`, so neither the API nor the page warns that anything is missing. Week 4 carries $2,000 of weekly ROI prizes and a $1,250 raffle, and it closes the $2,000 season board. All of these pay real USDso.
>
> **Checked 2026-11-03, 07:57–09:30 UTC.** API responses were saved from the signed-in app. Our test trades were on our own Arena account through its linked bot key, with paper USDso only. Chain reads were on Tokyo (chain 50383). Evidence: `evidence/71/`.

## Steps to reproduce
1. Sign in at https://app.testnet.dreamdex.io/competition-hub with the default "Week 4 · Nov 2 → Nov 9" board. Next to the trader count the table says **Updated November 2, 17:00 UTC**, and the chart's x-axis runs to the current hour (`evidence/71/competition_hub_week4_2026-11-03T0904Z.png`).
2. In the browser's network tab, these three responses are loaded with the app's own bearer token:
   - `GET /api/leaderboard/campaigns/perps-arena?period=week-4` (the table) returns `equityThrough 1793638800000` (17:00:00 UTC), `activityThrough 1793641619000` (17:46:59 UTC), `activitySettling false`, `activityPending 0`. `?period=all` (the season board) carries the same two timestamps.
   - `GET /api/leaderboard/campaigns/perps-arena/equity?period=week-4` (the chart) returns `everyHours 1`, with points up to the current hour.
   - `GET /api/quests/me` returns `enrolments[0].scoredAt`, which moves every few minutes, and `progress[]`.
3. Make any perp trade on an enrolled account and fully close it. Wait for the hosted indexer to include the block (about 10 minutes behind the head today), then for the next quest scoring. Nothing appears under `2026-W45` or `2026-11-03`, and `perps-arena:onboard-first-trade`.observed.usd (all-time volume) does not change.
4. To compare the table with the chart and the chain, save the first two bodies as `board.json` and `chart.json`, then run (read-only, plain viem):
   ```sh
   npm install && node evidence/71/arena_board_vs_chain.mjs board.json chart.json
   ./evidence/71/activity_rows.sh 0x05e56d14dd82c695844d40e15ea4122f0b7683cf   # indexer rows split at activityThrough
   ```

## Expected
- The hub: "Track your leaderboard rank and complete quests to earn raffle tickets. Your trading progress updates automatically."
- The rules: "Complete quests during the campaign to earn raffle tickets for the weekly draw", "Every 50 points earns you one raffle ticket for that week's draw". Weekly ROI is computed from account equity, "balance plus unrealized PnL". The weekly board needs "at least 10 trades across at least 3 separate days".
- Daily quests run on the UTC day ("Fully close at least one perps position today (UTC)").
- So a trade should reach the quests and the board within minutes. In week 2 it did: our `daily-trade:2026-10-20` was completed at 13:43:15 for a trade at 13:43:08. If the feed falls behind, `activitySettling` / `activityPending` and the page should say so.

## Actual
**Quests: our own account, before and after** (`evidence/71/quests_diff_2026-11-03T0857Z.txt`, `test_orders_2026-11-03.txt`):

| UTC, Nov 3 | What we did (Wallet 1 `0x0e7E…3817`, ETH-PERP) | Transaction |
|---|---|---|
| 08:32:43 | quest scoring: no week 4 progress (we had not traded this week) | — |
| 08:34:49 | open 1.2897 ETH long, 1 fill | `0xa0cb99ac…aa46` |
| 08:36:13 | full close, 3 fills | `0x128e8f11…6512` |
| 08:46:09 | hosted indexer passes block 40,413,889 (the close) | — |
| 08:47:10 | open 4 ETH long, 3 fills | `0xec08af91…99e1` |
| 08:52:31 | full close, 2 fills | `0x0701b6a2…caa2` |
| 08:50:14, 08:56:17, 09:02:10 | quest scoring runs: still **0** week 4 progress rows, **0** completions, volume counter **33,851.41** (unchanged) | — |

The 08:36 close was in the indexer from 08:46:09 and has not been credited, and neither has any of the 23,831 USDso of volume from the four filled orders. Today's daily quest is "Fully close at least one perps position today (UTC)". The Portfolio page of the same account does pick up the new trades from the indexer: its "Fees saved" figure went from $19.80 at 08:55 to $24.30 at 09:04 as the indexer took in our trades, while the quest counter above stayed at 33,851.41. We can only read our own quest state. What links it to everyone else's is the board's global `activityThrough`. Our enrolment shows `review: "pending"`, as it has since 2026-10-19, and it was scored normally in week 2, so the review status does not explain the gap.

**Leaderboard table vs the chart and the chain at 07:00 UTC** (`evidence/71/board_vs_chain_2026-11-03T0757Z.txt`):

| Table rank | Account | Table ROI | Chart ROI at 07:00 | Chain ROI at 07:00 |
|---|---|---|---|---|
| 1 | `0x05e5…83cf` | +20.07% | +65.95% | +65.95% |
| 2 | `0x21a2…dd44` | +16.38% | +53.95% | +53.95% |
| 3 | `0xd94a…17c3` | +14.46% | +46.93% | +46.93% |
| 4 | `0x43a3…476f` | +13.45% | −7.57% | multi-wallet account, not comparable |
| 5 | `0x0694…ce3e` | +13.34% | +17.39% | +17.39%, once the 1,000 USDso airdrop credited at 17:16:42 is added to `funded` |

The chain ROI is `(getAccountEquity + lockedCollateral − funded) / funded`, using the board's own `funded`. For #5 the script prints +60.16%, because it uses the table's `funded`. That figure is frozen too: it misses the week 4 airdrop credited at 17:16:42 UTC (MarginEvent `Credited`, 1,000). With it added, (4,396.73 − 3,745.29) / 3,745.29 = +17.39%, which is the chart's figure. The rules rank accounts "across all its wallets", so #4 can't be checked from one wallet. The table's #4 is below zero on its own chart, yet it still ranks above traders who are up.

**The activity columns stop exactly at `activityThrough`.** For `0x05e5…83cf`, the indexer has 41 position changes since week 4 opened, on 11-02 and 11-03. The table's `trades: 27, activeDays: 1` are exactly the 27 rows before 17:46:59 (`evidence/71/activity_rows_0x05e5_2026-11-03T0835Z.txt`).

**Week 3's final board has not settled either.** It closed at 14:00 UTC on Nov 2 and still says "Updated November 2, 14:00 UTC · 1 recent trader still being added" (`activityPending: 1`), at 07:50 and again at 09:31 UTC on Nov 3. That board decides the week 3 prizes (`evidence/71/week3_pending_2026-11-03T0931Z.txt`).

**The board's equity method is otherwise sound.** On week 3's final board (`equityThrough 2026-11-02 14:00:00`), 39 of the top 40 rows equal `getAccountEquity + lockedCollateral` at block 39,746,863 (14:00:00 UTC) to the cent. The 40th is a multi-wallet account (`evidence/71/week3_reconcile_2026-11-03T0840Z.txt`). So the fault is the stalled feed, not the formula.

## Evidence
- `evidence/71/quests_me_before_2026-11-03T0834Z.json`, `quests_me_after_2026-11-03T0857Z.json`, `quests_diff.py` and its output: our own quest state around the test.
- `evidence/71/test_orders.mjs`, output `test_orders_2026-11-03.txt`: the five test transactions, decoded from their receipts (fills per order). The 08:35:44 attempt `0xf0f99aa2…58bd` ran out of gas at a 3,000,000 limit and is not counted.
- `evidence/71/board_week-4_2026-11-03T0757Z.json`, `chart_week-4_2026-11-03T0757Z.json`, `arena_board_vs_chain.mjs` and its output. X handles and avatar URLs are blanked in the saved bodies.
- `evidence/71/activity_rows.sh` and its output; `evidence/71/board_week-3_final_2026-11-03T0750Z.json`, `week3_reconcile.mjs` and its output.
- `evidence/71/recheck_2026-11-03T0903Z.txt`, `recheck_2026-11-03T0930Z.txt`: the same endpoints fetched again. At 09:30 the table and the season board are still at 17:00 / 17:46:59. The quest scorer ran again at 09:25:34 and still shows 0 week 4 progress. The chart has moved on to 08:00. The screenshot named above.

## Suggested fix
Restart or unblock the activity ingest that feeds the quest scorer and the board, then backfill from 17:46:59 UTC on Nov 2 so that daily and weekly quests are credited to the day and week the trades happened. Drive `activitySettling` / `activityPending` from the real gap between `activityThrough` and the chain head, and show it on the page. Refresh the table and the qualification counters from the same hourly equity snapshot as the chart.

## Environment
- App https://app.testnet.dreamdex.io (deployment `dpl_822sE9mQ…`), signed in, Chrome. Our account Wallet 1 `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`, bot key `0x2A11e7388D1D2F9690f2636846d44b478f61bF08` (linked in the app, `placeOrderFor`).
- Tokyo testnet (chain 50383), RPC `https://api.hideki2.infra.testnet.somnia.network`, MarginBank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394`, ETH-PERP pool `0xd6cb1dd58580b84d76068ac21594219ce03aeddf`. Indexer `https://hideki-dev.smk.somnia.host/v1/graphql`. viem 2.57.7.
