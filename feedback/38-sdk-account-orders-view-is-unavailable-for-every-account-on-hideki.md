# SDK + docs: `client.accountOrders`, where the "follow an account" guide says pending perp TP/SL live, returns `status: "unavailable"` for every account on Hideki
Severity: normal
Area: SDK

> **Summary.** The SDK how-to `docs/how-to/follow-an-account.md` (line 190) says: "Resting perp orders are on
> `client.accountPositions`, in `data.orders`, and pending stops (TP/SL) are on `client.accountOrders`." On Hideki,
> `client.accountOrders.getSnapshot(account)` returns `{status: "unavailable", reason: "capabilityUnavailable",
> detail: "spot_unindexed_and_public_role_limits_unproved"}` for every account (tried lowercase and checksummed, on
> three busy accounts), while `client.accountPositions.getSnapshot(...)` returns `ready`. So a developer who follows
> the guide to read an account's pending TP/SL gets nothing back, on every account, with no error thrown. No doc says
> which networks support the account-order view.

> **Checked 2026-10-26, 13:21 UTC, Somnia Tokyo testnet (chain 50383), SDK 0.32.1.** Evidence:
> `evidence/38/account_orders_unavailable_2026-10-26T1321Z.txt`.

The cause is visible in the indexer: the `AccountCapability` row `50383:orders` has `readiness: UNAVAILABLE`.
`client.accountPositions` still works because it reads the chain, not the indexer account view, so the asymmetry is
not obvious to a reader of the guide: positions load, orders/stops do not.

## Steps to reproduce
1. Configure a `SomniaMarkets` client for Hideki with an absolute `indexerUrl`, as the guide requires. For any
   account with open perp activity, call both reads (`node evidence/38/acct1.mjs`, read-only):

```js
await client.accountOrders.getSnapshot(account);     // -> status "unavailable"
await client.accountPositions.getSnapshot(marginBank, account);  // -> status "ready"
```

2. Read the indexer capability rows directly (`node evidence/38/acct2.mjs` or the curl below):

```
curl -s https://hideki-dev.smk.somnia.host/v1/graphql -H 'content-type: application/json' \
  --data '{"query":"{ AccountCapability{ id readiness } AccountPositionCapability{ id readiness } }"}'
```

## Expected
Following the how-to, `client.accountOrders.getSnapshot(account)` returns a `ready` view whose `data` carries the
account's pending perp stops (TP/SL), or the guide and the reference say which networks the account-order view
supports and which read to use for pending perp stops on Hideki.

## Actual
Run 2026-10-26 13:21 UTC (`evidence/38/account_orders_unavailable_2026-10-26T1321Z.txt`):

```
orders  lower    0xa343fd  unavailable  capabilityUnavailable
positions lower  0xa343fd  ready  n=1
orders  checksum 0xa343fd  unavailable  capabilityUnavailable
positions checksum 0xa343fd ready  n=1
...(same for 0x5173f3… and 0x38f4d1…: orders unavailable, positions ready)...

accountOrders snapshot object:
{"chainId":50383,"account":"0x5173f339…","revision":1,"status":"unavailable",
 "reason":"capabilityUnavailable","detail":"spot_unindexed_and_public_role_limits_unproved"}

indexer capability rows:
{"AccountCapability":[{"id":"50383:orders","readiness":"UNAVAILABLE"}],
 "AccountPositionCapability":[{"id":"50383:positions","readiness":"UNAVAILABLE"}]}
```

Every account returns `unavailable`; not one `ready`. The read that actually returns pending perp stops on Hideki is
`client.getPerpStopOrders` / `client.listPerpStopOrders` (chain / indexer), which the guide does not mention.

## Evidence
- `evidence/38/account_orders_unavailable_2026-10-26T1321Z.txt`: the guide lines, the `getSnapshot` results for three
  accounts (lower + checksummed), the raw `unavailable` snapshot object, and the `UNAVAILABLE` capability readiness.
- `evidence/38/acct1.mjs`, `evidence/38/acct2.mjs`: the read-only scripts.
- SDK docs `docs/how-to/follow-an-account.md` lines 3, 10, 190.

## Suggested fix
Either make the account-order view available on Hideki (the `50383:orders` capability is `UNAVAILABLE`), or update
`follow-an-account.md` to say that the account-order view is unavailable on the perps testnet and that pending perp
stops are read with `client.getPerpStopOrders` / `client.listPerpStopOrders`, and have `getSnapshot` document the
`unavailable` status so callers do not read an empty account as "no stops".

## Environment
- `@somnia-chain/markets-sdk` 0.32.1 (npm `latest`), run against Hideki
- Indexer `https://hideki-dev.smk.somnia.host/v1/graphql`; Somnia Tokyo testnet, chain id 50383 ("Hideki")
- Date: 2026-10-26, 13:21 UTC
- Wallets: n/a (read-only); the accounts shown belong to other traders

**Distinct from** every other report we are aware of: no competitor repo mentions the SDK account-view
(`client.accountOrders` / `accountPositions`) or the `follow-an-account` how-to. This is separate from the stop
behaviour in our reports 28 and 29, which are about what the stop registry does on-chain, not about the read.
