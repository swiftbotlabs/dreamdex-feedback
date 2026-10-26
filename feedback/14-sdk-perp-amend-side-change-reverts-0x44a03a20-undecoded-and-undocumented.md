# SDK + docs: since the 2026-10-21 PerpPool upgrade, a perp `amendOrder` / `amendOrders` that changes the order's side reverts with `0x44a03a20`, which the SDK's error table cannot decode and no docs page lists or explains
Severity: normal
Area: SDK

> **Summary.** Since the PerpPool upgrade at block 29,293,077 (2026-10-21 11:14:16 UTC), an amend whose `newOrder.isBid`
> differs from the resting order's side reverts with `0x44a03a20` followed by the old order id. This happens on all 21 perp
> pools, for both `amendOrder` and `amendOrders`. The selector is not in the SDK's `contractErrorsAbi` (0.32.1 or the
> canary), so `ContractRevertError.errorName` is `undefined`. The docs never say an amend must keep its side, and the
> Errors page's own decoding recipe (`cast 4byte`, `cast decode-error`) finds no name for it.

> **Checked 2026-10-26, 03:33–03:41 UTC, and again at 04:50–04:57 UTC.** The two pinned `eth_call`s of step 1 still
> return the same results. Step 2 on ETH-PERP at block 33384629 (04:56:49 UTC): all 8 side changes on a live bid and a
> live ask revert `0x44a03a20` with the old order id, and all 4 same-side controls succeed. npm `latest` is still 0.32.1.

**Distinct from report 06:** 06 is the Errors page missing the perp, MarginBank and voucher errors that existed before
(fix: a perps table on that page). This report is about one new PerpPool error that arrived with the 2026-10-21 upgrade.
It is missing from the SDK's decode table (fix: regenerate `src/contractErrorsAbi.ts`), and the amend reference does not
state the rule behind it (fix: the amend docs). The missing Errors-page row for this selector follows from that.
This report covers only the side-change revert and its missing error entry, not any other change the same upgrade made
to amends.

On block 29,293,077 the perp pool beacon `0xb787f7d2f87d32c1505c110c4457ed36a3f6b002` was upgraded from
`0x772e9B720C8140FaAA4D561a15269ED60E01521D` to `0x81F9EB88C95a52B4D3eA47A73ac394b8A547d443` (`Upgraded` event, tx
`0x71cb30b3bb2d3816b5ce4a1fbf429f0261d3b155589808c8e9167107993fb6c3`). Since then, an amend that asks for the other side
reverts with `0x44a03a20 || oldOrderId`, sent from the order's real owner. The price and size can stay the same or move far
from the book, and the order can be GTC or PostOnly. A same-side amend from the same owner at the same block succeeds.
Before the upgrade, at block 29,292,900, the same side changes succeeded and returned a new order id.

The selector equals `keccak256("AmendSideMismatch(uint128)")[0:4]`. No contract source is published, so we found this name
by hashing candidate signatures. Its one argument is always the old order id (168 of 168 cases). The selector occurs once
in the new implementation's bytecode and nowhere in the old one.

Refusing a side change may be intended for a pool that now amends in place. The defect is that a developer cannot find
this rule or read the error:

1. **SDK.** The selector is not among the 546 errors in 0.32.1 `src/contractErrorsAbi.ts` (547 in
   `0.32.2-canary.38575926931.ge4550933d36d`). That file says it holds "Every custom error the protocol contracts declare
   [...] so a failed call reports its Solidity error name". `decodeRevert` (`src/revert.ts` 229–255) therefore takes the
   "Selector isn't in our table" branch, and `Trader.amendOrder` / `amendOrders` throw a `ContractRevertError` whose
   `errorName` is `undefined`. The `amendOrder` JSDoc (`src/trade.ts` 2915) says "`errorName` carries the protocol's
   error". The only `Amend*` errors in the table are `AmendOldOrderGone` and `AmendReplacementRejected`.
2. **Docs.** The Functions page says `amendOrder` "Atomically **cancels `oldOrderId` and places a replacement**", and
   `AmendOrderRequest.newOrder` is a full `PlaceOrderRequest`, `isBid` included ("The replacement order to place").
   Neither the live docs nor the SDK docs say the replacement must stay on the same side. The Errors page's "Batch and
   amend" table lists only `EmptyBatch`, `AmendReplacementRejected` and `AmendOldOrderGone`. Its "Decoding a revert"
   recipe fails for this selector: `cast 4byte 0x44a03a20` returns "No matching function signatures found", and the
   openchain signature database has no entry for it.

So a bot that turns a resting quote into one on the other side by amending gets back only a 4-byte selector, with no name
and no documented cause. This worked until 2026-10-21. The SDK forwards `newOrder.isBid` as given, with no client-side
check (`src/orders.ts` 2375–2394).

## Steps to reproduce
All steps are read-only: plain `eth_call` from the order's real owner, with nothing signed and no state overrides.

1. Pinned raw call, ETH-PERP pool `0xD6Cb1DD58580B84D76068aC21594219ce03aeddf`, block 33335454 (2026-10-26
   03:34:49 UTC). Resting bid `3412647653636276618395`, owner `0x47537E3A3ea6e9391F3B26Ea45618db6828c8bfF`, price
   `2304350000000000000000`, quantity `433800000000000000`. Amend it to an ask at the same price and size:
   ```
   curl -s -H 'content-type: application/json' --data @evidence/14/req_flip_to_ask.json https://api.hideki2.infra.testnet.somnia.network
   ```
   Control, the same amend but staying a bid, 10 ticks lower:
   ```
   curl -s -H 'content-type: application/json' --data @evidence/14/req_same_side_control.json https://api.hideki2.infra.testnet.somnia.network
   ```
   (`node evidence/14/pinned_call.mjs <pool> <owner> <orderId> <price> <qty> <isBid> <block>` builds these bodies.
   The calldata is `amendOrder` `0x91f22b4d` with `alwaysPlace = false`, GTC, and expiry = block time + 2 h.)
2. All pools at the chain head: one live bid and one live ask per pool. For each order, run four side-change cases
   (`amendOrder` at the same price, `amendOrder` at a far non-crossing price as GTC and as PostOnly, and `amendOrders([flip])`)
   and two same-side controls (`amendOrder` and `amendOrders`). Decode each revert against the SDK's table, parsed as
   text from the 0.32.1 tarball:
   ```
   SDK_ERRORS_ABI=<markets-sdk-0.32.1>/package/src/contractErrorsAbi.ts node evidence/14/amend_side_flip.mjs latest all
   ```
3. The same script before the upgrade: `node evidence/14/amend_side_flip.mjs 29292900 ETH,BTC,SOL`. Then
   `node evidence/14/impl_bracket.mjs` for the implementation at blocks 29292900, 29293076 and 29293077, plus the `Upgraded` log.
4. What a viem caller (the SDK's transport) gets with the SDK's table: `node evidence/14/viem_message.mjs`.
5. The Errors page's decoding recipe: `cast 4byte 0x44a03a20` and
   `cast decode-error 0x44a03a200000000000000000000000000000000000000000000000b9000000000092049b`.
6. Search the live docs (`https://app.dreamdex.io/llms-full.txt`, `/docs/developers/contracts/functions.md`,
   `errors.md` and `events.md`) and the SDK tarballs for `AmendSideMismatch`, `44a03a20` and any wording about an amend
   keeping its side.

## Expected
One of these two:
- the amend accepts a replacement on the other side, as the docs describe it (cancel, then place a full
  `PlaceOrderRequest`) and as the pools did until 2026-10-21; or
- if an amend must keep its side, the rule is stated on `amendOrder`, `amendOrders` and `AmendOrderRequest`, the error is
  listed on the Errors page with its selector, and the SDK decodes it, so `ContractRevertError.errorName` names it.

## Actual
Step 1, run 2026-10-26 03:39:56 UTC (`evidence/14/out_pinned_curl.txt`):
```
flip to ask:        {"jsonrpc":"2.0","id":1,"error":{"code":3,"message":"execution reverted","data":"0x44a03a200000000000000000000000000000000000000000000000b9000000000092049b"}}
same-side control:  {"jsonrpc":"2.0","id":1,"result":"0x0000000000000000000000000000000000000000000000b9000000000092049b"}
```
`0xb9000000000092049b` = `3412647653636276618395`, the old order id.

Step 2, block 33335844 (2026-10-26 03:35:28 UTC; `evidence/14/out_head_all_pools.txt`):

| | result |
|---|---|
| pools | 21 of 21, all on beacon `0xb787…b002` → impl `0x81F9EB88C95a52B4D3eA47A73ac394b8A547d443` |
| orders | 42 (one bid and one ask per pool, three different owners) |
| side-change cases | 168 of 168 revert `0x44a03a20`, argument == `oldOrderId` in all 168 |
| `amendOrders([flip])` | 42 of 42 revert the whole call with `0x44a03a20` (not `AmendReplacementRejected`, not a `0n` id) |
| same-side controls | 84 of 84 succeed |
| SDK 0.32.1 table | "NO match for selector 0x44a03a20 (AbiErrorSignatureNotFoundError)" in all 168 |

Example line (ETH-PERP, block 33335454, `evidence/14/out_head_ETH_BTC_SOL.txt`):
```
BID orderId 3412647653636276618395 owner 0x47537E3A3ea6e9391F3B26Ea45618db6828c8bfF price 2304350000000000000000 qty 433800000000000000
  amendOrder  control: same side, 10 ticks away, GTC     OK returns 3412647653636276618395
  amendOrder  flip side, same price/size, GTC            REVERT raw=0x44a03a200000000000000000000000000000000000000000000000b9000000000092049b ... | SDK table has NO match for selector 0x44a03a20
```

Step 3, block 29292900 (2026-10-21 11:13:59 UTC, impl `0x772e9B72…`; `evidence/14/out_pre_upgrade_29292900.txt`): the same side
changes succeed and return a new id. Examples: ETH bid `16380708737454089203896` → `16380708737454089203921`, ETH ask
`12949614339744112603321` → `12949614339744112603345`, SOL bid `7968993439842533272931` → `7968993439842533272938`. The SOL
ask and BTC ask flips succeed the same way. The one exception is the BTC bid flip, which reverts with
`InsufficientMarginForOrder()` (`0x7ea61260`), a margin reason the SDK decodes. Upgrade bracket (`evidence/14/out_impl_bracket.txt`):
```
block 29293076 2026-10-21T11:14:16.000Z impl 0x772e9B720C8140FaAA4D561a15269ED60E01521D
block 29293077 2026-10-21T11:14:16.000Z impl 0x81F9EB88C95a52B4D3eA47A73ac394b8A547d443
Upgraded -> 0x81F9EB88C95a52B4D3eA47A73ac394b8A547d443 block 29293077 tx 0x71cb30b3bb2d3816b5ce4a1fbf429f0261d3b155589808c8e9167107993fb6c3
```

Step 4 (`evidence/14/out_viem_message.txt`, block 33337478):
```
viem error: ContractFunctionExecutionError | revert errorName: undefined | signature: 0x44a03a20 | reason: undefined
shortMessage: "The contract function \"amendOrder\" reverted with the following signature:\n0x44a03a20"
```

Step 5, Foundry `cast` 1.8.5, 2026-10-26 03:40:15 UTC (`evidence/14/out_cast_lookup.txt`):
```
Error: No matching function signatures found for selector `0x44a03a20`
Error: No matching error signature found for selector `44a03a20`
```
Openchain lookup: `{"ok":true,"result":{"function":{"0x44a03a20":null},"event":{}}}` (`evidence/14/openchain_0x44a03a20.json`).

Step 6 (`evidence/14/docs_grep.txt`, `evidence/14/sdk_grep.txt`): 0 matches for `AmendSideMismatch` / `44a03a20` in
`llms-full.txt` (438,288 bytes), `functions.md`, `errors.md` and `events.md` (fetched 2026-10-26 03:33 UTC). There are also
0 matches in every file of the 0.32.1 and canary tarballs. Neither the docs nor the SDK has same-side wording for amends.
The nearest SDK text is a fill-detection note (`docs/how-to/detect-fills.md` line 88): "The maker's identity - `isBid`,
`owner`, `userData`, `expireTimestampNs` - cannot change under a given id". It says nothing about amends and names no
error.

## Evidence
All files are in `evidence/14/`:
- `out_pinned_curl.txt`, with `req_flip_to_ask.json` and `req_same_side_control.json`: the pinned raw calls of step 1.
- `amend_side_flip.mjs`, with `out_head_ETH_BTC_SOL.txt` (block 33335454), `out_head_all_pools.txt` (block 33335844, 21
  pools) and `out_pre_upgrade_29292900.txt`.
- `impl_bracket.mjs` → `out_impl_bracket.txt`: the beacon implementation before and after, and the `Upgraded` log.
- `code_check.mjs` → `out_code_check.txt`: `eth_getCode` shows `44a03a20` once in `0x81F9EB88…` (90,808 bytes) and 0 times
  in `0x772e9B72…` (76,972 bytes).
- `viem_message.mjs` → `out_viem_message.txt`; `out_cast_lookup.txt`; `openchain_0x44a03a20.json`.
- `sdk_grep.txt`: the error counts, the `Amend*` entries, the `contractErrorsAbi.ts` header, `revert.ts` 229–255,
  `errors.ts` 662 and `trade.ts` 2915. `npm_check.txt`: npm `latest` = 0.32.1 (published 2026-10-13), and the canary is from
  2026-10-14, both before the upgrade. The tarball sha512 values match `dist.integrity`.
- `docs_grep.txt`, with copies of the fetched pages (`docs_contracts_*.md`, `docs_app.dreamdex.io_llms-full.txt.gz`): the
  0-match counts and the quoted `amendOrder`, `amendOrders`, `AmendOrderRequest` and "Batch and amend" text.

## Suggested fix
- Add the error, under its real name and signature (`0x44a03a20`, one `uint128` argument), to the perps source that
  `contractErrorsAbi.ts` is generated from. Then run `pnpm errors:gen` and publish. The header says "Regenerate after any
  contract change", and the latest published table predates the 2026-10-21 PerpPool upgrade.
- If keeping the side is the intended rule, state it on `amendOrder`, `amendOrders`, `amendOrderFor`, `amendOrdersFor` and
  `AmendOrderRequest`: `newOrder.isBid` must equal the resting order's side, and changing side needs a cancel plus a new
  order. Add the error to the Errors page's "Batch and amend" table, and say the same in the SDK's `AmendOrderParams` /
  `AmendOrdersParams` docs.
- Optional: register the signature with the openchain database, so the Errors page's `cast 4byte` / `cast decode-error`
  recipe works for it.

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 and 0.32.2-canary.38575926931.ge4550933d36d (source read as text from the npm
  tarballs; nothing executed); viem 2.57.7 for our own read-only scripts; Foundry `cast` 1.8.5
- Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and SDK), RPC `https://api.hideki2.infra.testnet.somnia.network`
- PerpPoolFactory `0xE631fAEE547baeE07353E290f0562ea67d856560` (21 pools); ETH-PERP `0xD6Cb1DD58580B84D76068aC21594219ce03aeddf`,
  BTC-PERP `0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0`, SOL-PERP `0xB483ec1fb34996638677c20ab087b16F1896FA53`
- Date: 2026-10-26, 03:33–03:41 UTC (chain head runs); historical reads at blocks 29292900, 29293076 and 29293077 (2026-10-21)
- Wallet: none of ours. Every `eth_call` is sent `from` the order's own owner, with nothing signed and no state overrides.
