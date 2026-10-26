# Contracts + SDK: when one leg of a linked perp TP/SL pair fires and its IOC fills only part of the size, the registry still cancels the other leg (`LinkedFill`), so the rest of the position keeps no stop-loss, and the stop history reads like a normal full close
Severity: normal
Area: contracts

> **Summary.** A MARKET perp stop fires as an IOC priced at the mark ± `slippageToleranceBps` (500 = 5% on all 21
> perp registries). When the book inside that band is smaller than the stop, the IOC fills only part of it and the
> rest is discarded. If the stop is one leg of a linked TP/SL pair, the `PerpStopOrderRegistry` then cancels the other
> leg in the same transaction (`LinkedOrderCancelled`, indexer `cancelReason` `LinkedFill`), exactly as it does after a
> full fill. A leg that fills nothing keeps its partner armed (`PendingOrderUnlinked`). On SOL-PERP on 2026-10-23 a
> take-profit closed 1,044.81 of a 1,896.46 SOL short (55.09%), and the registry cancelled the stop-loss. The remaining
> 851.65 SOL short has had no stop-loss for more than 57 hours. Nothing in the stop rows shows it: `listPerpStopOrders`
> returns `TRIGGERED` and `CANCELLED` / `LinkedFill`, the same two rows as this owner's full-fill pair on 2026-10-20.

> **Checked 2026-10-26, 07:55–08:06 UTC.** All three cases below reproduce read-only. The SOL owner still holds −851.65
> SOL with no pending stop (`listPerpStopOrders` query, 08:00:56 UTC, indexer block 33495057). The registry
> implementation is the same at every fire block and at head. npm `latest` is still 0.32.1.

**Not the same as** three nearby behaviours. (1) The sibling's 0.15 STT being credited to `unclaimedSomi` instead of
refunded: that happens after any linked fill, and this report is not about the fee. (2) A plain IOC's partial fill
not being shown to the user who placed it: this report is about what the registry does to the other leg. (3) A
stop's IOC sized below the position because the owner has resting reduce orders (reducing capacity): in all three cases
the owner had no resting orders, and `effectiveReducingCapacity` equalled the full position.

## What happens

The SDK documents the pair rule in two halves, and neither covers a partial fill:

- `PlacePerpStopOrderParams.pair` (`dist/trade.d.ts` 1454–1455): "A second leg, armed atomically and LINKED to the
  first: when one fires and fills, the other is cancelled and its SOMI refunded."
- `PerpStopOrder.siblingOrderId` (`dist/perp/stops.d.ts` 105–106): "A leg that fires WITHOUT filling leaves its partner
  live and unlinked (back to null) — that is what lets the survivor be re-paired." `LinkPerpStopOrdersParams`
  (`dist/trade.d.ts` 1485–1486) says the same. The indexer type `StopOrder.siblingOrderId` (`dist/gql/graphql.d.ts`
  2423–2428) says "when one leg triggers AND FILLS the registry cancels the other".
- `PerpStopOrder.cancelReason` (`dist/perp/stops.d.ts` 136): "`"LinkedFill"` — the protocol retired it because its OCO
  sibling FILLED."
- The `NoFill` drop reason (`dist/perp/stops.js` 67–71) exists because "the pool decides an IOC's fate on a dry run,
  and the real run can fill less, including zero, when it pulls a maker the dry run had counted. Previously reported as
  a success, which concealed it."

So the SDK knows a triggered IOC can fill less than its size, but only the zero case is handled. A partial fill (23–55%
in the cases below) is treated as a full fill. The registry cancels the partner, `PendingOrderTriggered` says `success = true` with
`dropReason = 0`, and the fired leg's row says `TRIGGERED`. Nothing on the stop rows or the registry events gives the
filled size. It is only on the placed pool order (indexer `Order.filledQuantity`, joined through `placedOrderId`).

Read literally, "fires and fills" may include a partial fill, so cancelling may be the intended rule. Even then, the
effect is not stated anywhere: the rest of the position is left without the protection the trader armed. Keeping the
partner would cost nothing. It is reduce-only, so the docs say it "can only shrink a position, never open or flip
one". If the trader later closes the rest by hand, the leg simply drops with `ReduceOnlyNoPosition`, as two other
owners' legs do in the SOL receipt below. The website docs (perps "Orders" page) do not cover linked pairs or partial
fills of a triggered TP/SL at all. The perps margin page tells traders to "set a stop loss" to stay clear of
liquidation.

## Steps to reproduce
All steps are read-only (`eth_call`, receipts and indexer GraphQL; nothing signed). Run them with node and viem 2.57.7
from the folder that holds `evidence/29/`.

1. The SOL take-profit fire. Run `node evidence/29/fired_leg_case.mjs 0x7e128dfa20858595d8221c7b983e2894f900b42918fc5a977ea79ea6256cdff4 2102928824402888886116 > case_sol_tp.json`.
   It prints both legs from `getPendingOrder` at the parent block and the fire block, and the registry events in the
   receipt. It also prints the placed IOC (`OrderPlaced`) and the sum of its `OrderFilled` logs, the position before
   and after (`MarginBank.getPosition`), `unclaimedSomi` before and after, and the indexer `StopOrder` and `Order` rows.
2. Run `node evidence/29/fired_leg_context.mjs case_sol_tp.json`. It prints the registry beacon's implementation at the
   fire block and at head, and the owner's reducing capacity and resting orders at the parent block. It also prints
   the asks at or below the IOC limit before and after the fire, and the owner's position and stops now.
3. What an SDK caller sees: `node evidence/29/sdk_list_stops.mjs 0xB483ec1fb34996638677c20ab087b16F1896FA53 0x8D4a4E4484e0fC2C24dD4622dDa314D0538D5dF8 PENDING`,
   then the same without the last argument (all statuses). The script sends SDK 0.32.1's `PerpStopOrdersQuery`
   document, copied as text from `dist/perp/stops.js`, with the `where` that `listPerpStopOrders({ account, pool,
   status })` builds for a perp pool.
4. The same rule across fill sizes in one transaction:
   `node evidence/29/unlink_contrast.mjs 0x374537402dad63a77d0ef52a8a7a07089b397bc38117391341b4fe721efb3940`
   (BTC-PERP). It prints every `PendingOrderTriggered` in the receipt, the leg's partner at the parent block, the
   registry event that follows, whether the partner is still live after the block, and the placed order's fill
   percentage. The same script on the SOL tx of step 1 shows the `ReduceOnlyNoPosition` legs.
5. The other two cases: `node evidence/29/fired_leg_case.mjs 0x374537402dad63a77d0ef52a8a7a07089b397bc38117391341b4fe721efb3940 4722366482869645220938 > case_btc_sl.json`
   and `node evidence/29/fired_leg_case.mjs 0x352dc23d3b72cf6c712d03a55e7097de91432d89a73994c5a056843e72f7772e 553402322211286550578 > case_sol_sl.json`,
   each followed by `fired_leg_context.mjs` on its output.
6. How often it happens: `node evidence/29/partial_fill_stats.mjs 1000`. It takes the last 1,000 fired perp stops
   (indexer `TRIGGERED` / `TRIGGER_FAILED`, all 21 registries) and joins each placed order. For every partial fill it
   checks whether the leg was linked at the parent block and whether the receipt cancelled the partner.
7. The pair's creation: `node evidence/29/pair_created.mjs 0x34e6b719250dbea032933127ed9b809c6af1469d8c8a74aa96b572d117a8f1c9`.
   The position after the fire, sampled hourly: `node evidence/29/leftover_watch.mjs case_sol_tp.json case_btc_sl.json case_sol_sl.json`.

For a live check, arm a linked pair with `trader.placePerpStopOrder({ ..., pair })` on a thin perp market, with a
position larger than the book within 5% of the mark. When the take-profit fires, the position is only partly
closed, and `listPerpStopOrders` shows the stop-loss `CANCELLED` with `cancelReason` `"LinkedFill"`.

## Expected
When the fired leg's IOC leaves part of the position open, the other leg stays armed for what is left, as it does for
a fill of zero (`PendingOrderUnlinked`, partner live). If cancelling after any fill is the intended rule, it should be
documented as such: the SDK pair docs, `cancelReason` and the perps Orders page would say that a partly filled TP
or SL still cancels the other leg and leaves the rest of the position unprotected. The stop row or the trigger
event would also carry the filled size, so a client can tell this case from a full close.

## Actual

**1) SOL-PERP take-profit, stop-loss cancelled** (`evidence/29/case_sol_tp.json`, `evidence/29/ctx_case_sol_tp.json`).
Tx `0x7e128dfa20858595d8221c7b983e2894f900b42918fc5a977ea79ea6256cdff4`, block 31439526, 2026-10-23 22:53:45 UTC.
Registry `0x85a0879d19777c343eb317a890d5058ab92b8f5d`, pool `0xB483ec1fb34996638677c20ab087b16F1896FA53`, owner
`0x8D4a4E4484e0fC2C24dD4622dDa314D0538D5dF8`.

- The pair was armed on 2026-10-22 15:16:01 UTC (tx `0x34e6b719…f1c9`, block 30301440;
  `evidence/29/pair_created_sol_tp.json`). Two `PendingOrderCreated` events and
  `PendingOrdersLinked(gte 110680464442257311587, lte 2102928824402888886116)`. TP `2102928824402888886116`: buy
  1,896.46 SOL, MARKET, LTE 101.90. SL `110680464442257311587`: buy 1,896.46 SOL, MARKET, GTE 106.48.
- Parent block: mark 101.857, position −1,896.46 SOL. Reducing capacity: pending bid 0, pending ask 0, effective
  1,896.46. The owner had 0 resting orders. `slippageToleranceBps` = 500.
- The registry placed IOC `21822498239198407036405`: buy 1,896.46 at 106.94 (mark × 1.05 = 106.95). Seven
  `OrderFilled` logs (102.07–102.42) sum to 1,044.81 (55.09%), and 851.65 was left unfilled. The asks at or below 106.94
  were 1,044.81 in 7 orders before the fire and 0 after it (best ask 108), so the IOC took everything inside the band.
- Logs in the same receipt (252 from the pool, 253–254 from the registry):
  ```
  log 252  OrderPlaced          orderId 21822498239198407036405 full 1896.46 remaining 851.65
  log 253  PendingOrderTriggered pendingOrderId 2102928824402888886116 success true dropReason 0 placedOrderId 21822498239198407036405
  log 254  LinkedOrderCancelled cancelledOrderId 110680464442257311587 triggeredOrderId 2102928824402888886116 somiCredited 150000000000000000
  ```
- After the block, `getPendingOrder` shows both legs `live = false` with `siblingOrderId 0`. `unclaimedSomi` went from 0
  to 0.15. Position: −851.65 SOL.
- Indexer: the TP row is `TRIGGERED` with `quantity 1896460000000` and `placedOrderId 21822498239198407036405`. The SL
  row is `CANCELLED`, `cancelReason "LinkedFill"`. Only the `Order` row shows the shortfall:
  `fullQuantity 1896460000000`, `filledQuantity 1044810000000`, `status "Closed"`.
- Now (`evidence/29/sdk_list_stops_sol_owner_pending.json`, 2026-10-26 08:00:56 UTC, block 33495063): position
  −851.65, `listPerpStopOrders({ account, pool })` (default `PENDING`) returns `[]`, mark 100.51. The context read at
  07:58:35 UTC found no stop created by this owner on this registry since the fire. In hourly samples since the fire
  the position never changed and the mark never reached 106.48 (`evidence/29/leftover_watch.json`). The owner has not
  lost money from this yet, but nothing would close the position if the mark got there.
- The history read (`evidence/29/sdk_list_stops_sol_owner_history.json`) returns the same pair of rows for this partial
  fill as for the same owner's earlier pair, which closed fully:

  | pair | fired leg | other leg | placed `Order` (`evidence/29/order_rows_sol_owner.json`) |
  |---|---|---|---|
  | 2026-10-20 14:07:35 UTC | `1900014639592083817821` `TRIGGERED` | `2785458355130142295390` `CANCELLED` / `LinkedFill` | 383.68 of 383.68, `Filled` |
  | 2026-10-23 22:53:45 UTC | `2102928824402888886116` `TRIGGERED` | `110680464442257311587` `CANCELLED` / `LinkedFill` | 1,044.81 of 1,896.46, `Closed` |

  Fields on each row: `id, registry, orderIdRaw, owner, isBid, quantity, triggerPrice, triggerOperator, orderType,
  builder, builderFeeBpsTimes1k, status, placedOrderId, dropReason, siblingOrderId, intent, cancelReason, createdAt,
  updatedAt, txHash, market`. None of them is a filled quantity.

**2) BTC-PERP, one transaction, three outcomes** (`evidence/29/unlink_contrast_btc_sl_tx.json`).
Tx `0x374537402dad63a77d0ef52a8a7a07089b397bc38117391341b4fe721efb3940`, block 32162067, 2026-10-24 18:58:25 UTC,
registry `0x52e2ccebaec9332672c247e9a90aa3d61fb615ef`. At the parent block the mark was 80,504.0. Fifteen linked BTC
legs of different owners fired in this one transaction:

| legs | placed order filled | next registry event | partner after the block |
|---|---|---|---|
| 10 (logs 192–325) | 100% | `LinkedOrderCancelled` | gone |
| 1 (log 334, stop `4722366482869645220938`, owner `0x2b7B…89a5`) | **23.39%** | `LinkedOrderCancelled` | gone |
| 4 (logs 336–342) | nothing (`success false`, `dropReason 5` = `NoFill`) | `PendingOrderUnlinked` | live, `siblingOrderId 0` |

The leg at log 334 is a stop-loss: buy 0.17982 BTC, GTE 80,493.7 (`evidence/29/case_btc_sl.json`). Its IOC at 84,529.2
filled 0.04206 at 84,000. The asks inside the band were 3.14733 BTC at the parent block and 0 after the block; the
ten legs before it in this transaction had each filled 100%. Its take-profit `5939851591734475627595` (LTE 74,635.2)
was cancelled (`LinkedFill`, 0.15 credited). The owner had no resting orders. The remaining short of 0.13776 BTC was left with no take-profit. Its stop-loss is
gone too, because a fired leg is always deleted. This report is only about the partner.

In the SOL receipt of case 1, two other owners' linked legs dropped with `ReduceOnlyNoPosition` (logs 214 and 256).
Their partners `4242751136953196873577` and `1401952549601925924711` got `PendingOrderUnlinked` and stayed live
(`evidence/29/unlink_contrast_sol_tp_tx.json`).

**3) SOL-PERP stop-loss, take-profit cancelled** (`evidence/29/case_sol_sl.json`). Tx
`0x352dc23d3b72cf6c712d03a55e7097de91432d89a73994c5a056843e72f7772e`, block 31150465, 2026-10-23 14:51:50 UTC, owner
`0x657a4803B3Da3702B677EF45B5033d196125DF6a`. SL `553402322211286550578` (buy 2,678.91, GTE 104.8; mark 104.833). Its
IOC at 110.07 filled 1,293.10 (48.26%) in 14 fills and emptied the asks inside the band. TP `2195162544771436644403`
(LTE 98) was cancelled (`LinkedFill`). The owner had no resting orders. The remaining short of 1,385.81 SOL was left
with no stops.

**How often** (`evidence/29/partial_fill_stats.json`, run 08:01 UTC). The last 1,000 fired perp stops span 2026-10-22
16:45:55 to 2026-10-26 06:27:00 UTC. 910 of them placed an order: 904 filled fully, 6 filled partly (23.39%, 30.1%,
48.26%, 55.09%, 70.61% and 76.55%), and 0 placed an order that filled nothing. Three of the six partial fills were
linked legs (cases 1–3), and all three had their partner cancelled. The other three were unlinked. All 21 registries
return `slippageToleranceBps` = 500.

**Not changed since** (`evidence/29/ctx_case_*.json`): beacon `0x06683223b403374cb58c135b87b0f81ef0fd18f0` returns
implementation `0x8d7FcDfC6D043B0296Ccf84D82f9dbe2c701096E` at blocks 31150465, 31439526 and 32162067 and at head
(blocks 33493654–33493997, 07:58–07:59 UTC).

**Docs** (`evidence/29/docs_grep.txt`, `llms-full.txt` fetched 08:03:38 UTC). The perps Orders page section "Take
profit and stop loss" says only: "A **take profit (TP)** closes a position when the price reaches your target, and a
**stop loss (SL)** closes it when the price moves against you. Both are reduce-only." These terms have 0 matches:
`LinkedFill`, `LinkedOrderCancelled`, `PendingOrdersLinked`, `PendingOrderUnlinked`, `createLinkedPendingOrders`,
`linkPerpStopOrders`, `siblingOrderId`, `placePerpStopOrder` and `listPerpStopOrders`. Each line that mentions a partial
fill is about the WebSocket feed, plain market orders or order types, not stops. The spot stop FAQ, which explains
the discarded IOC remainder, says "Perps are not covered here."

## Evidence
All files are in `evidence/29/`:
- `fired_leg_case.mjs` → `case_sol_tp.json`, `case_btc_sl.json`, `case_sol_sl.json`: legs before and after, every log of
  the receipt (decoded where the ABI is known), fill sums, positions, `unclaimedSomi` and the indexer rows. ABIs are
  copied as text from SDK 0.32.1, and addresses are from the perps-testnet developer page.
- `fired_leg_context.mjs` → `ctx_case_sol_tp.json`, `ctx_case_btc_sl.json`, `ctx_case_sol_sl.json`: the implementation
  at the fire block and head, reducing capacity, resting orders, the book inside the IOC limit before and after, and
  the position and stops now.
- `unlink_contrast.mjs` → `unlink_contrast_btc_sl_tx.json`, `unlink_contrast_sol_tp_tx.json`,
  `unlink_contrast_sol_sl_tx.json`: every triggered leg in each receipt, with its fill and the partner's fate.
- `sdk_list_stops.mjs` → `sdk_list_stops_sol_owner_pending.json`, `sdk_list_stops_sol_owner_history.json`; and
  `order_rows_sol_owner.json` (the indexer `Order` rows of both of the owner's fires).
- `partial_fill_stats.mjs` → `partial_fill_stats.json`; `leftover_watch.mjs` → `leftover_watch.json` (hourly samples
  after each fire); `pair_created.mjs` → `pair_created_sol_tp.json`.
- `sdk_quotes.txt`: the quoted SDK 0.32.1 lines with line numbers (`dist/trade.d.ts`, `dist/perp/stops.d.ts`,
  `dist/perp/stops.js`, `dist/gql/graphql.d.ts`) and the `PerpStopOrdersQuery` selection. `npm_check.txt`: npm
  dist-tags, plus the tarball sha512, which matches `dist.integrity`. The canary
  `0.32.2-canary.38575926931.ge4550933d36d` has the same text.
- `docs_grep.txt`, with copies of the live pages (`llms-full_live.txt.gz`, `perps-testnet_page.html.gz`).

## Suggested fix
1. **Registry.** When the triggered leg's IOC fills less than its size and the owner still holds a position on that
   market, handle the partner as the zero-fill path does: emit `PendingOrderUnlinked` and keep it live, instead of
   `LinkedOrderCancelled`. It is reduce-only, so at worst it later drops with `ReduceOnlyNoPosition`.
2. **Events and indexer.** Put the filled quantity on `PendingOrderTriggered` (or a `filledQuantity` column on
   `StopOrder` / `PerpStopOrder`). Then a client can tell a partial close from a full one without joining `Order`. If a
   partner is still cancelled after a partial fill, give it a `cancelReason` other than `LinkedFill`.
3. **Docs.** If cancelling after any fill is the intended rule, state it on `PlacePerpStopOrderParams.pair`,
   `LinkPerpStopOrdersParams`, `PerpStopOrder.siblingOrderId` / `cancelReason` and the perps Orders page. Say that a
   MARKET TP/SL fires as an IOC at the mark ± `slippageToleranceBps` and can close only part of the position. Say also
   that if that happens to one leg of a pair, the other leg is still cancelled and the trader must re-arm a TP/SL for
   what is left.

## Environment
- Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and SDK), RPC `https://api.hideki2.infra.testnet.somnia.network`;
  indexer `https://hideki-dev.smk.somnia.host/v1/graphql`
- MarginBank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394`; PerpPoolFactory `0xE631fAEE547baeE07353E290f0562ea67d856560`
  (21 pools, registries from `getStopOrderRegistry`); SOL-PERP pool `0xB483ec1fb34996638677c20ab087b16F1896FA53`,
  registry `0x85a0879d19777c343eb317a890d5058ab92b8f5d`; BTC-PERP pool `0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0`,
  registry `0x52e2ccebaec9332672c247e9a90aa3d61fb615ef`; registry beacon `0x06683223b403374cb58c135b87b0f81ef0fd18f0` →
  `0x8d7FcDfC6D043B0296Ccf84D82f9dbe2c701096E`
- `@somnia-chain/markets-sdk` 0.32.1 (npm `latest`; source read as text from the tarball, nothing executed); viem
  2.57.7 for our own read-only scripts
- Docs: `https://app.dreamdex.io/llms-full.txt` and `/docs/developers/perps-testnet`, fetched 2026-10-26 08:03:38 UTC
- Date: 2026-10-26, 07:55–08:06 UTC; historical reads at blocks 30301440, 31150465, 31439526 and 32162067 (2026-10-22
  to 2026-10-24)
- Wallet: none of ours (read-only). The positions and stops shown belong to other accounts.
