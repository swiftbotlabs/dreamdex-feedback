# Maker yield: no maker on mainnet has been paid since 2026-10-13. The daily USDso yield now goes to a Safe (6,428 USDso so far), and the 404 USDso sent to the payout wallet since Oct 28 hasn't been paid out
Severity: major
Area: docs | indexer (mainnet payouts)

> **Summary.** The docs say the ~3.3% yield on USDso's backing "is paid to active market makers, not held by the protocol", "each period". On mainnet, the venue's own indexer table `YieldPayout` shows makers being paid every day up to 2026-10-13, and then nothing for 21 days. On chain, the daily USDso yield kept arriving. Before Oct 14 it was forwarded the same day to the payout wallet `0xf1da…10dA`, which paid it out in full to between 9 and 24 makers. Since Oct 14 it goes to a Safe-type proxy `0xDDc4…a280`, which has never placed an order. That Safe has received **6,428.49 USDso** and sent nothing. Since Oct 28, about 21% of each day's yield goes to the payout wallet again (**404.40 USDso** so far), but that wallet hasn't sent a transaction since Oct 13 (nonce 3313 then and now). Books are two-sided, and the biggest maker of early October is still filling quotes today.
>
> **Checked 2026-11-03, 10:40–10:48 UTC**, read-only. Evidence: `evidence/73/`.

## Steps to reproduce
```sh
python3 evidence/73/yield_flows.py        # indexer YieldPayout per day + the funder's USDso flows + outgoing transfers
node evidence/73/distributor_state.mjs    # payout wallet nonce/balance at its last payout and now; maker activity; books
```
The first script uses the dreamDEX mainnet indexer (`prd.smk.somnia.host`) and the Somnia mainnet explorer's public token-transfer API (`explorer.somnia.network/api/v2`). The second uses the mainnet RPC, the indexer and `api.dreamdex.io/v0/orderbooks`.

## Expected
- Trading → Overview: "The ~3.3% yield on USDso's backing is **paid to active market makers**, not held by the protocol. That is what makes the zero-fee model economically viable." and "USDso yield is redistributed to active makers each period".
- Fees: "**Payment**: Yield is paid out in USDso to the maker's wallet."
- Collateral Yield Algorithm: "Distribution is a batch job run over an explicit block range, paying scored makers via direct on-chain ERC-20 transfers."

## Actual
How the pipeline worked until Oct 13. Every day, USDso is minted to `0x44D650A2cE847098c26e6E874A308F280817D4ac` ("funder"), which splits it. 90% went to `0xF1DA6D99cF64C1Ccf810C04CdCC844878D2510dA` ("payout wallet"), and 10% to `0x76bf…C250`. The payout wallet sent exactly that amount out the same day, one transfer per maker. Those are the rows of the indexer's `YieldPayout` table: 3,290 rows from 2026-05-20, daily without a gap from Sep 9 to Oct 13.

What changed (USDso, per day, from the explorer):

| Days (UTC) | Minted to funder | To payout wallet | To Safe `0xDDc4…` | Paid to makers |
|---|---|---|---|---|
| Oct 1–13 | 302–368 per day | 90% (272–331) | 0 | everything received, 9–24 makers a day |
| Oct 14–27 | 311–356 per day (4,700.73) | **0** | **100%** (4,700.73; Oct 14–16 in one 1,016.73 transfer) | **0** |
| Oct 28–Nov 2 | 287–330 per day (1,887.78) | 21.4% (57–73 a day), **404.40** in total | 74.0% (1,396.61) | **0** |

- **The last `YieldPayout` row isn't a maker payout.** At 2026-10-13 16:56:56 UTC, block 437,566,460, the payout wallet sent the whole Oct 13 pool, 331.14906 USDso, in one transfer to the Safe (tx `0xfd85133d3a7aa44707e05506f9fea399f897503fc8b16911eaebb86e31ab86e8`). The indexer records it as a payout to "maker" `0xddc4…a280`. All 28 other payees since Oct 9 have `Order` rows in the indexer. `0xDDc4…` has none (`payees_without_orders_2026-11-03T1050Z.txt`). It's a Safe-style proxy (explorer: master-copy proxy, not verified).
- **The payout wallet has been idle since then.** Its nonce was 3,312 just before that transfer and is 3,313 now. Its USDso balance went to 0 and is now 404.4034, exactly the six transfers it received from Oct 28 to Nov 2. Its only outgoing token transfer since Oct 13 is the one to the Safe.
- **The Safe hasn't paid anyone.** It holds 6,428.4851 USDso (the 331.149 plus 6,097.336 from the funder), and has 0 outgoing token transfers. It's a 2-of-4 Safe (v1.3.0), and its nonce has been 12 since Oct 13, so it hasn't executed a single transaction since then (`safe_state_2026-11-03T1128Z.txt`).
- **There are makers to pay.** All four mainnet spot books are two-sided now (15–22 bid and ask levels on SOMI, WETH and WBTC; 4/5 on USDC.e). `0xd86a…ed88` took 1,035 USDso of the Oct 9–12 payouts, and is still filling as a maker on 2026-11-03 (e.g. block 455,284,913, tx `0x87107cfd…7999`).
- **Payouts didn't move to another wallet either.** Since Oct 13, `0xd86a…`'s inbound token transfers come only from the SOMI:USDso and WETH:USDso pools (vault withdrawals) and from USDso/WETH mints. Nothing came from the payout wallet, the Safe or any other wallet (`maker_d86a_inbound_since_2026-10-13_T1052Z.txt`).

**Re-checked at 11:34 UTC, after today's split.** At 11:31:47 the funder split Nov 3's 285.875 USDso: 208.90 to the Safe, 64.43 to the payout wallet and 12.54 to `0xa989…`. The payout wallet now holds **468.83 USDso** and its nonce is still 3,313. The Safe holds **6,637.39 USDso**. `YieldPayout` still ends on Oct 13 (`yield_flows_2026-11-03T1134Z.txt`, `distributor_state_2026-11-03T1134Z.txt`).

## Evidence
- `evidence/73/yield_flows.py`, output `yield_flows_2026-11-03T1046Z.txt`: `YieldPayout` per day; the funder's flows per day since Oct 1, with totals since Oct 14; outgoing transfers of the payout wallet and the Safe since Oct 13
- `evidence/73/distributor_state.mjs`, output `distributor_state_2026-11-03T1047Z.txt`: payout wallet nonce and USDso balance at blocks 437,566,459, 437,566,460 and head; the Safe's balance; recent maker fills of `0xd86a…`; the four books
- `evidence/73/maker_d86a_inbound_since_2026-10-13_T1052Z.txt`: every inbound token transfer of the largest early-October payee since Oct 13
- `evidence/73/safe_state.mjs`, output `safe_state_2026-11-03T1128Z.txt`: the Safe's version, threshold, owner count and nonce at blocks 437,566,460, 450,000,000 and head
- `evidence/73/payees_without_orders.py`, output `payees_without_orders_2026-11-03T1050Z.txt`: the 29 payees since Oct 9, and whether each has ever placed an order

## Why it matters
Maker yield is how the docs explain zero fees ("The book pays its own makers; the protocol takes nothing"). Makers who quote tight because of that promise have earned nothing for three weeks, and the yield for those weeks sits in an address that isn't a maker. There's no app or API surface where a maker could see this. The only place is the indexer table, and its last row labels the sweep to the Safe as a maker payout. If the change is deliberate (a pause, a new budget, a treasury), the docs above are wrong today. If it isn't, the payout job has been down since Oct 13, and part of the yield is now going to the payout wallet again without being paid out. (The other cuts: 10% a day went to `0x76bf…C250` until Oct 13, and about 4.6% a day has gone to `0xa989…F8b6` since Oct 28. We don't know what either address is.)

## Suggested fix
Run the pending payout runs for Oct 14 onward, or state in the docs that maker yield is paused or reduced, and since when. Don't index transfers from the payout wallet to non-makers as `YieldPayout`. Publish the payout cadence and the payout wallet, so makers can check payouts themselves.

## Environment
Somnia mainnet (chain 5031), RPC `https://api.infra.mainnet.somnia.network`, indexer `https://prd.smk.somnia.host/v1/graphql`, explorer API `https://explorer.somnia.network/api/v2`, REST `https://api.dreamdex.io/v0`. Read-only; no transactions.
