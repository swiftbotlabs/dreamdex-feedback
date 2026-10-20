# SDK docs: the Perps guide's trading-gain recipe throws on kind `CreditReclaimed`, and without it `getMarginEvents` 0.32.1 silently ignores the recipe's `sinceBlock`/`toBlock`
Severity: normal
Area: docs

> **Summary.** The scoring recipe in the SDK's Perps guide passes options `getMarginEvents` 0.32.1 does not have. As written
> it throws (`CreditReclaimed`); with that kind removed, `sinceBlock`/`toBlock` are ignored and pre-window deposits count.

The Somnia Markets SDK docs page `/markets/somnia-markets/typescript/perps` ("Account equity for
scoring is one read", also in `llms-full.txt`) gives a competition-scoring recipe that reads flows
between two equity snapshots with

```ts
client.getMarginEvents(account, {
  kinds: ["Deposit", "Credited", "Withdraw", "CreditReclaimed"],
  sinceBlock: start.asOfBlock + 1n, toBlock: end.asOfBlock,
  limit, offset,
})
```

and a table that lists `CreditReclaimed (voucher sweep)` as an `out` flow. In the published SDK
(0.32.1, the version the developer page says the app runs, and also the 0.32.2 canary):

- `GetMarginEventsOptions` has only `kinds`, `limit`, `offset` (src/perp/history.ts:90–104); the
  implementation builds `where` from `account` and `kinds` only (history.ts:657–669). `sinceBlock` /
  `toBlock` are not read, so a JavaScript caller that pastes the recipe gets the account's **whole**
  history, newest first, and `flows` includes deposits made before `start` — the trading gain comes
  out wrong with no error.
- `MarginEventKind` is the closed union `"Deposit" | "Withdraw" | "Locked" | "Unlocked" | "Credited"`
  (history.ts:83, runtime copy at :675). `"CreditReclaimed"` throws
  `InvalidInputError("Margin event kinds must contain only Deposit, Withdraw, Locked, Unlocked, Credited; got CreditReclaimed")`
  (history.ts:697–700), so the recipe as written does not run at all in TypeScript or JavaScript.

## Steps to reproduce
1. `npm pack @somnia-chain/markets-sdk@0.32.1` and open `package/src/perp/history.ts`.
2. Read `GetMarginEventsOptions` (lines 90–104), `getMarginEvents` (657–669), `MarginEventKind` (83)
   and `marginEventKindList` (691–704).
3. Compare with the recipe on the docs page (search for `CreditReclaimed` and `sinceBlock` under
   "Account equity for scoring is one read").
4. `grep -rn "sinceBlock" package/src/perp/history.ts` -> no matches (the only `sinceBlock` support in
   the SDK is for orders, `src/orders.ts:255`).

## Expected
The documented options exist, or the docs document the options the shipped SDK has.

## Actual
`CreditReclaimed` is rejected before the request, so the recipe as written throws (in TypeScript the `"CreditReclaimed"`
literal is also a type error). With that kind removed, `sinceBlock`/`toBlock` are ignored by `getMarginEvents` and the
account's whole history comes back with no error.

### Concrete case on a real account (added 2026-10-19 15:20 UTC)
Our account `0x2A11e7388D1D2F9690f2636846d44b478f61bF08` deposited 3.3948 USDso at block **27699377**
(tx `0x50811a18373415fd960f73c2dbce1d12c247a61fc4f2b1275fbd427cf46fec82`) and placed and cancelled an order
at blocks 27703910 / 27705997. A scoring window `sinceBlock: 27700000n` must leave the deposit out of
`flows`. `getMarginEvents` builds `where` from `account` and `kinds` only, and that `where` (sent as-is to the
indexer, `kinds: ["Deposit","Credited","Withdraw"]`) returns the pre-window `Deposit` row. `MarginEvent` rows
still have no block field to filter on (`field 'blockNumber' not found in type: 'MarginEvent'`; that indexer gap is
report 12). So the recipe would subtract a deposit made before the window from the trading gain.

## Evidence
- Source lines quoted above (0.32.1 tarball, sha from npm; same in
  `0.32.2-canary.38575926931.ge4550933d36d`).
- `PerpPoolFactory.perpPoolCount()` = 21 at block 27491272 (`scripts/survey.mjs`).

## Suggested fix
Either ship `sinceBlock`/`toBlock` on `getMarginEvents` (this needs the indexer column in report 12)
and add `CreditReclaimed` to `MarginEventKind`, or rewrite the recipe with the options and kinds 0.32.1 has.

Footnote, same page: it opens with "Perps are live on testnet: `BTC/USDSO:USDSO` and `ETH/USDSO:USDSO`", while 21 perp
markets are live (`PerpPoolFactory.perpPoolCount()` = 21 at block 27491272, `scripts/survey.mjs`).

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 and 0.32.2-canary (source read; not executed)
- Docs: `https://somnia-platform-docs.vercel.app/markets/somnia-markets/typescript/perps` and
  `https://somnia-platform-explorer.vercel.app/markets/llms-full.txt`, read 2026-10-19 ~09:45 UTC
- Somnia Hideki testnet, chain id 50383
- Wallet: n/a

## Corrections
- **Corrected 2026-10-20.** The old title said the recipe "silently over-counts", but the body shows the recipe as written
  throws on `CreditReclaimed`. The title and Actual now say both, in order. Area is now `docs` only (the fix is the docs
  page, or the SDK ships what the docs describe). The missing indexer block field is now its own report (12), and the
  "BTC and ETH only" sentence is a footnote. Added the summary.
