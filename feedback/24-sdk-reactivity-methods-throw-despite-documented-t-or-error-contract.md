# SDK: the Reactivity page says upstream methods "resolve to `T | Error` instead of throwing", but `getSubscriptionInfo` rejects for an id that does not exist, and without a wallet no write "silently resolves to `null`" (`subscribe` and `scheduleSubscriptionAt*` throw, `unsubscribe` returns an Error)
Severity: normal
Area: SDK

> **Summary.** The SDK's Reactivity page and the `unwrap` docblock say every reactivity method resolves to `T | Error`
> rather than throwing. The page also says a write without a wallet client "silently resolves to `null`". In 0.32.1
> (with `@somnia-chain/reactivity` 0.2.1, npm `latest` and the version the peer range `^0.2.1` installs),
> `getSubscriptionInfo` **rejects** with viem's
> `ContractFunctionExecutionError` for an id that does not exist, even though its type is
> `Promise<SoliditySubscriptionInfo | Error>`. The cause is a `return` without `await` inside a `try`. Without a wallet,
> `subscribe`, `subscribeRaw` and the three `scheduleSubscriptionAt*` methods reject with "No address provided and no
> wallet account available". `unsubscribe` resolves to an `Error`. None of them resolves to `null`.

> **Checked 2026-10-26, 04:31–04:35 UTC.** npm `latest` is still 0.32.1, `canary` is 0.32.2-canary.38575926931, and
> `@somnia-chain/reactivity` `latest` is 0.2.1. Both markets-sdk tarballs and all three hosted copies of the page carry
> the same text. Evidence: `evidence/24/reactivity-errors_run_2026-10-26T0431Z.txt`,
> `evidence/24/reactivity-errors_cast_2026-10-26T0435Z.txt`, `evidence/24/reactivity-errors_hosted-docs_2026-10-26T0432Z.txt`.

The Reactivity page (`docs/REACTIVITY.md` in `@somnia-chain/markets-sdk` 0.32.1, hosted at
`https://prd.smk.somnia.host/docs/typescript/reactivity`) makes two promises about failures.

Under "Errors" (lines 238–247):

```
Upstream methods resolve to `T | Error` instead of throwing. Two ways to live
with that, both fine:

// 1. this SDK's contract — throw (recommended)
const hash = unwrap(await reactivity.subscribe({ ... }));

// 2. upstream's own idiom — check
const result = await reactivity.subscribe({ ... });
if (result instanceof Error) throw result;
```

After the subscription example (lines 208–209): "Note that writes need a **wallet client**: pass one to
`createReactivity`, or upstream's write silently resolves to `null`."

The `unwrap` docblock (`src/reactivity/index.ts:230`) says the same: "Every `@somnia-chain/reactivity` method resolves to
`T | Error` rather than throwing". Upstream's `.d.ts` types every method that way, for example
`getSubscriptionInfo(subscriptionId: bigint): Promise<SoliditySubscriptionInfo | Error>` (`dist/index.d.ts:211`) and
`subscribe(...): Promise<Hex | Error>` (line 183).

What 0.32.1 actually does, on Somnia Tokyo testnet with `createReactivity(exchange.client)`. This is the read and watch
construction the page's `{ wallet? }` row allows. Nothing was signed or sent.

1. **`getSubscriptionInfo` rejects for an id that does not exist.** This is a read and needs no wallet.
   `getSubscriptionInfo(10n ** 30n)` and `getSubscriptionInfo(2n ** 255n)` both throw
   `ContractFunctionExecutionError: The contract function "getSubscriptionInfo" reverted.` instead of resolving to that
   Error. The precompile reverts with empty data for an unknown id (`cast call 0x…0100 'getSubscriptionInfo(uint256)'
   1000000000000000000000000000000` → `execution reverted, data: "0x"`). Upstream's `getSubscriptionInfo` is
   `try { return this.viem.readContract(...) } catch (t) { return t instanceof Error ? t : new Error(String(t)) }` with no
   `await` (`dist/index.js:300–311`). The rejection settles after the `try` has exited, so the `catch` never runs for it.
   An existing id (`1n`) resolves normally.
2. **No write resolves to `null` without a wallet.** `subscribe`, `subscribeRaw`, `scheduleSubscriptionAtTimestamp`,
   `scheduleSubscriptionAtBlock` and `scheduleSubscriptionAtEpoch` all reject with
   `Error: No address provided and no wallet account available`. `subscribeRaw` runs
   `if (await this.viem.getBalance() < parseEther("32"))` at line 159, before its `try` at line 161. `getBalance` throws
   that message when there is no wallet account (lines 54–58). `unsubscribe(1n)` resolves to an `Error` ("Failed to
   broadcast TX to cancel on-chain subscription"), not `null`. The internal `writeContract` does return `null`
   (lines 21–22), but `unsubscribe` turns that into an Error (lines 218–222), and the subscribe paths never reach it. The
   same throw happens when a wallet client **is** passed but has no hoisted `account`.

The documented `T | Error` path does exist, but only for failures upstream checks before the balance read. On the same
no-wallet client, `gasLimit: 0n`, a past timestamp and a past block all resolve to an Error. With a wallet that has an
account but 0 STT, `subscribe` and `scheduleSubscriptionAtTimestamp` resolve to an Error ("Owner balance must be at
least 32 SOMI to create a subscription").

Who this affects: the `await` idioms on the page still surface the failure as a throw. But it comes from the `await`,
not from the `instanceof` check. Code that relies on the documented contract breaks:

- A bot that checks a stored subscription id with `const info = await r.getSubscriptionInfo(id); if (info instanceof Error) { /* resubscribe */ }`
  gets an exception instead of the Error branch.
- A loop that logs a returned Error and carries on also gets an exception.
- A `.then()` chain with no `.catch()` gets an unhandled rejection.
- A `result === null` check for "no wallet", which the page's sentence suggests, never matches.

TypeScript gives no warning either, because every method is typed `Promise<T | Error>`.

## Steps to reproduce
1. In an empty folder, `npm i @somnia-chain/markets-sdk@0.32.1 @somnia-chain/reactivity@0.2.1 viem@2.57.7 ws@8.21.0`
   (the versions in `evidence/24/reactivity-errors_package.json`).
2. Minimal check, read-only:
   ```ts
   import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
   import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
   import { createReactivity } from "@somnia-chain/markets-sdk/reactivity";

   const ex = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql",
                                  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES });
   const r = createReactivity(ex.client);
   const info = await r.getSubscriptionInfo(10n ** 30n);   // rejects: ContractFunctionExecutionError
   if (info instanceof Error) console.log("no such subscription"); // never reached
   ```
3. Full run: put `evidence/24/reactivity-errors_repro.mjs` in a subfolder of that folder (it reads package versions from
   `../node_modules`) and run `node <subfolder>/reactivity-errors_repro.mjs`. It calls every method listed above with no
   wallet, then runs the validation controls (B1–B3), both documented idioms written literally (C1–C3), and a wallet
   client without an account (D1). `evidence/24/reactivity-errors_control-account.mjs` repeats `subscribe` and
   `scheduleSubscriptionAtTimestamp` with a random, never-funded in-memory account. The balance check stops it before
   any write.
4. Without the SDK:
   `cast call 0x0000000000000000000000000000000000000100 'getSubscriptionInfo(uint256)' 1000000000000000000000000000000 --rpc-url https://api.hideki2.infra.testnet.somnia.network`
   → `execution reverted, data: "0x"`. With id `1` it returns data.
5. Source: `npm pack @somnia-chain/reactivity@0.2.1` and read `package/dist/index.js` lines 20–23, 54–59, 157–172,
   210–224 and 300–311.

## Expected
Every method resolves to `T | Error` as documented and typed. `getSubscriptionInfo` resolves to the revert Error for an
unknown id. A write without a wallet resolves to an Error, or to `null` as the page says. Or, if the methods are meant
to throw in these cases, the page and the docblock say which cases throw.

## Actual
2026-10-26 04:31:45–04:31:48Z, chain id 50383, head block 33369611
(`evidence/24/reactivity-errors_run_2026-10-26T0431Z.txt`):

```
A1 subscribe(): REJECTED (threw) -> Error: No address provided and no wallet account available
A2 subscribeRaw(): REJECTED (threw) -> Error: No address provided and no wallet account available
A3 scheduleSubscriptionAtTimestamp(now+60s): REJECTED (threw) -> Error: No address provided and no wallet account available
A4 scheduleSubscriptionAtBlock(head+100): REJECTED (threw) -> Error: No address provided and no wallet account available
A5 scheduleSubscriptionAtEpoch(7n): REJECTED (threw) -> Error: No address provided and no wallet account available
A6 unsubscribe(1n): RESOLVED -> Error object (Error): Failed to broadcast TX to cancel on-chain subscription
A7 getSubscriptionInfo(10n**30n) (unknown id): REJECTED (threw) -> ContractFunctionExecutionError: The contract function "getSubscriptionInfo" reverted.
A8 getSubscriptionInfo(2n**255n) (unknown id): REJECTED (threw) -> ContractFunctionExecutionError: The contract function "getSubscriptionInfo" reverted.
A9 getSubscriptionInfo(1n) (control: existing id?): RESOLVED -> [{"eventTopics":["0x6a53252e…
B1 subscribe() gasLimit 0n: RESOLVED -> Error object (Error): Gas limit must be greater than zero
B2 scheduleSubscriptionAtTimestamp(now-1s): RESOLVED -> Error object (Error): Invalid timestamp - not in the future
B3 scheduleSubscriptionAtBlock(head-1): RESOLVED -> Error object (Error): Block number must be in the future
C1 idiom: the await itself THREW before 'if (result instanceof Error)' ran -> Error: No address provided and no wallet account available
C2 unwrap idiom: threw (from the await, not from unwrap) -> Error: No address provided and no wallet account available
C3 'no wallet -> null' check on unsubscribe: res === null is false; res instanceof Error is true
D1 subscribe() wallet without account: REJECTED (threw) -> Error: No address provided and no wallet account available
```

Control with an account, 04:31:48–04:31:50Z (`evidence/24/reactivity-errors_control-account_2026-10-26T0431Z.txt`):
`subscribe()` and `scheduleSubscriptionAtTimestamp()` → `RESOLVED -> Error object: Owner balance must be at least 32
SOMI to create a subscription`.

Earlier runs the same day gave the same results: 03:18 UTC, from a separate install, and 04:27 UTC.

## Evidence
- `evidence/24/reactivity-errors_run_2026-10-26T0431Z.txt`, `evidence/24/reactivity-errors_control-account_2026-10-26T0431Z.txt`:
  output of the two scripts, with timestamps, chain id and head block.
- `evidence/24/reactivity-errors_repro.mjs`, `evidence/24/reactivity-errors_control-account.mjs`,
  `evidence/24/reactivity-errors_package.json`: the scripts as run (viem 2.57.7, node v22.22.1; read-only).
- `evidence/24/reactivity-errors_cast_2026-10-26T0435Z.txt`: the `cast` checks from step 4 (cast 1.8.5, chain 50383, block
  33371800).
- `evidence/24/reactivity-errors_sdk-source.txt`: the docs and source lines quoted above, with line numbers, from
  markets-sdk 0.32.1 (`docs/REACTIVITY.md`, `src/reactivity/index.ts`), the 0.32.2 canary (same text) and reactivity
  0.2.1 (`dist/index.js`, `dist/index.d.ts`). Every tarball's sha512 matches npm `dist.integrity`. The tarballs were
  read as text.
- `evidence/24/reactivity-errors_hosted-docs_2026-10-26T0432Z.txt` and `evidence/24/reactivity-errors_page_2026-10-26T0432Z.html`:
  `https://prd.smk.somnia.host/docs/typescript/reactivity` (HTTP 200, 04:32:10Z),
  `https://somnia-platform-docs.vercel.app/markets/somnia-markets/typescript/reactivity` (HTTP 200, 04:33:20Z) and
  `https://somnia-platform-explorer.vercel.app/markets/llms-full.txt` (HTTP 200, 04:33:21Z, lines 6548, 6577, 6586). All
  three carry both sentences and the `instanceof Error` idiom.

## Suggested fix
- In the reactivity client: `return await this.viem.readContract(...)` in `getSubscriptionInfo`. In `subscribeRaw`,
  return an Error such as "No wallet client" when `this.client.wallet?.account` is missing, before the balance read, or
  move the balance check inside the `try`. Then every method keeps its `Promise<T | Error>` type.
- If the client is not changed, `createReactivity` could wrap the instance so that rejections come back as Errors. Or
  the page could document the real behaviour:
  - `getSubscriptionInfo` rejects for an unknown id.
  - Without a wallet account, `subscribe`, `subscribeRaw` and `scheduleSubscriptionAt*` reject, and `unsubscribe`
    resolves to an Error.
  - Callers need `try/catch` as well as the `instanceof` check.
- Either way, replace "upstream's write silently resolves to `null`" with what happens. The same applies to the
  "resolves to `T | Error` rather than throwing" line in the `unwrap` docblock.

Not part of this report: the page's link to the upstream repository, `https://github.com/somnia-chain/reactivity`
(`docs/REACTIVITY.md:10`), returned HTTP 404 at 04:32 UTC. That is a separate docs item.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (npm `latest`) with `@somnia-chain/reactivity` 0.2.1 (npm `latest`, the peer range
  `^0.2.1`), viem 2.57.7, node v22.22.1. Docs text also checked in 0.32.2-canary.38575926931.ge4550933d36d.
- Docs: `https://prd.smk.somnia.host/docs/typescript/reactivity`,
  `https://somnia-platform-docs.vercel.app/markets/somnia-markets/typescript/reactivity`,
  `https://somnia-platform-explorer.vercel.app/markets/llms-full.txt`, read 2026-10-26 04:32–04:33 UTC
- Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and SDK), RPC `https://api.hideki2.infra.testnet.somnia.network`,
  indexer `https://hideki-dev.smk.somnia.host/v1/graphql`, reactivity precompile `0x0000000000000000000000000000000000000100`
- Date: 2026-10-26, 04:31–04:35 UTC (reads and eth_call only, blocks 33369611–33371800; no transactions sent)
- Wallet: none. The control used a random in-memory account that was never funded.
