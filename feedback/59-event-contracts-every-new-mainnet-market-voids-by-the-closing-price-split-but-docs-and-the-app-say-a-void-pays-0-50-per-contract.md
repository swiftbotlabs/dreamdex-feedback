# Event Contracts: since 2026-09-16 every mainnet market is created with the closing-price-split void policy (`voidPolicy` 2: 35,176 markets; a void paid 0.9295 / 0.0705), but the docs say "every dreamDEX market" pays 0.50 per contract on a void and the app's trade history values every voided position at 0.50
Severity: major
Area: contracts | app | docs

> **Summary.** Settlement & Voids (trader docs) says: "**On a void, each contract on either side redeems for 0.50 USDso**,
> so a matched pair returns the 1 USDso that backed it. That is the protocol's default void policy, and **every dreamDEX
> market uses it.** The protocol also supports a policy that splits the payout by the market's closing price instead".
> Its note adds: "On a void, Positions, the redeem confirmation and your trade history all value the position at 0.50 per
> contract, which matches what dreamDEX markets pay today." The FAQ "My Event Contract settled against me" repeats the
> 0.50 rule and works through a table of what a voided position is worth.
>
> On **Somnia mainnet** that has not been true since 2026-09-16. The last mainnet market created with the uniform policy
> dates from 2026-09-16 16:30 UTC. Every market since 16:35 UTC that day carries `voidPolicy() == 2`, the closing-price
> split: **35,176 of 56,434** Up/Down markets, including all **816** created in the last 24 hours. Two
> mainnet markets have already voided under it and paid **Up 0.9295 / Down 0.0705** and **Up 0.746 / Down 0.254**, read on
> chain from `payoutNumerators()`. The mainnet app's trade-history code values a voided position at half its contracts
> (`case"voided":{let e=t/2n;return{pnl:e-r,proceeds:e}}`), whatever the market's policy or stored payout.
>
> On Tokyo testnet every market is still `voidPolicy` 0, uniform 0.5 / 0.5, which matches the docs. So anyone who checks the
> docs against the testnet sees them agree, and the difference only shows on mainnet, with real USDso.
>
> **Checked 2026-10-29, 20:38–20:41 UTC**, read-only: indexer counts on both networks (two runs), on-chain reads of five
> mainnet markets, and the app chunks as served. Evidence: `evidence/59/`.

## Steps to reproduce
1. Count the void policies and list every voided market whose payout is not 0.5 / 0.5 (GraphQL reads, Python standard
   library):
   ```sh
   python3 evidence/59/void_policy_check.py mainnet
   python3 evidence/59/void_policy_check.py tokyo
   ```
2. Read the policy and the stored payouts on chain:
   ```sh
   npm install   # viem 2.57.7, pinned
   node evidence/59/void_policy_onchain.mjs https://api.infra.mainnet.somnia.network \
     0xe2a2af7471e474811ca0ad5c182c6f656c966a1e 0x65ddc21e287e53e30f5e8692d39019371e4845a4 \
     0xa93c742af800ccbb4ac516b84100f676510a5065 0x8a4818bc0f2d80fd036c683acb554c57c928f55a
   ```
   The first two are the voided snapshot-policy markets. The last two were created at 20:35 UTC; use any market the
   first script lists under "newest markets".
3. Read Settlement & Voids (`/docs/trading/event-contracts/settlement-and-voids`) and the FAQ
   (`/docs/support/faq/event-contract-settlement`).
4. In the mainnet app bundle, chunk `/_next/static/immutable/chunks/1dxc5k_3ay3bf.js` (loaded by `/portfolio`; the
   same code is also in `1-z__41v4esp7.js`), search for `case"voided"`.

## Expected
Either new mainnet markets use the uniform policy that the docs promise for "every dreamDEX market", or the docs, the FAQ
table and the app follow the market's own policy:
- say that mainnet markets void by the closing-price split, and what that split is;
- value a voided position from the stored `payoutNumerators` / `payoutDenominator`. The developer page already tells
  integrators "Read the payout from `payoutNumerators` / `payoutDenominator` rather than assuming a half."

## Actual
`evidence/59/void_policy_check_mainnet_2026-10-29T2040Z.txt`:
```
binary markets by voidPolicy: 0 (UNIFORM) = 21258  2 (CLOB_SNAPSHOT) = 35176
last market created with voidPolicy 0: 2026-09-16 16:30 | first with voidPolicy 2: 2026-09-16 16:35
created in the last 24 h: voidPolicy 0 = 0  voidPolicy 2 = 816
newest markets:
  2026-10-29 20:35 voidPolicy 2 0xa93c742af800ccbb4ac516b84100f676510a5065 "Will BTC/USDC's price be at or above 79899.75 at unix time 1793306400?"
  2026-10-29 20:35 voidPolicy 2 0x8a4818bc0f2d80fd036c683acb554c57c928f55a "Will ETH/USDC's price be at or above 2294.48 at unix time 1793306400?"
  … (all six newest: voidPolicy 2)
voided markets: 25; with a payout other than 0.5/0.5:
  2026-10-02 22:00 voidPolicy 2 payout Up 0.746 / Down 0.254 … 0xe2a2af7471e474811ca0ad5c182c6f656c966a1e
      redeemed outcome 0: 312.5 -> 233.125 USDso … redeemed outcome 1: 312.5 -> 79.375 USDso
  2026-10-02 22:00 voidPolicy 2 payout Up 0.9295 / Down 0.0705 … 0x65ddc21e287e53e30f5e8692d39019371e4845a4
      redeemed outcome 0: 312.5 -> 290.46875 USDso … redeemed outcome 1: 312.5 -> 22.03125 USDso
```
`evidence/59/void_policy_onchain_2026-10-29T2038Z.txt` (chain 5031, block 451,518,810):
```
0xe2a2…6a1e voidPolicy 2 status 5 isVoided true payoutNumerators [7460000,2540000]
0x65dd…45a4 voidPolicy 2 status 5 isVoided true payoutNumerators [9295000,705000]
0xa93c…5065 voidPolicy 2 status 1 (Trading)
0x8a48…f55a voidPolicy 2 status 1 (Trading)
0xd1da…e1b2 voidPolicy 2 status 4 (Resolved)
```
Tokyo (`void_policy_check_tokyo_2026-10-29T2040Z.txt`): `voidPolicy` 0 on all 23,898 markets, including the 864 created
in the last 24 hours. All 109 voided markets paid 0.5 / 0.5.

`evidence/59/app_void_valuation_code_2026-10-29T2039Z.txt`: in both mainnet chunks the trade-history builder maps a
voided position to `proceeds = t / 2n` (`t` = the position's contracts at 1 USDso each), next to the "Closed early"
label, without reading the policy or the payout vector.

So far the two voided snapshot-policy markets held only the seeding wallet's complete sets (`0xd251…615e` redeemed both
sides). That is luck of timing: on any future void of a traded mainnet market, a holder of the cheap side is shown 0.50 per
contract in the app and in the docs' worked table, and is paid the snapshot split, which can be 0.07. The holder of the
other side is paid more than the app says.

## Evidence
- `evidence/59/void_policy_check.py` + outputs `void_policy_check_mainnet_2026-10-29T2040Z.txt`,
  `void_policy_check_tokyo_2026-10-29T2040Z.txt` (an earlier run at 20:38 UTC gave the same picture: 35,174 policy-2
  markets, the six newest all policy 2)
- `evidence/59/void_policy_onchain.mjs` + output `void_policy_onchain_2026-10-29T2038Z.txt`
- `evidence/59/app_void_valuation_code_2026-10-29T2039Z.txt`: the two app chunk URLs, their hashes and the quoted code
- Docs: `https://app.dreamdex.io/llms-full.txt` (unchanged since 2026-10-29 04:48 UTC), sections
  `/docs/trading/event-contracts/settlement-and-voids`, `/docs/support/faq/event-contract-settlement` and
  `/docs/developers/event-contracts/market-structure` ("Voided (5) … 0.5 per side under the default `UNIFORM` policy")

## Suggested fix
Decide which policy mainnet markets should use. If the closing-price split is intended (it is what the market factory
creates now), update Settlement & Voids, the FAQ table and the market-structure page to say so, and make Positions, the
redeem confirmation and the trade history value a voided position at `payoutNumerators[outcome] / payoutDenominator`. The
trade-history case above is one line: `proceeds = t * payout[outcome] / denominator` instead of `t / 2n`. If uniform is
intended, fix the market factory's default for new mainnet markets.

## Environment
- Somnia mainnet (chain 5031, RPC https://api.infra.mainnet.somnia.network, indexer https://prd.smk.somnia.host/v1/graphql);
  Somnia Tokyo testnet (Hideki, chain 50383, indexer https://hideki-dev.smk.somnia.host/v1/graphql)
- App https://app.dreamdex.io as served 2026-10-29 20:39 UTC (chunks named above)
- Node 22.22 with viem 2.57.7; Python 3 (standard library only); read-only, no transactions
