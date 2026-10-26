# App: for e-mail logins, Portfolio "Deposits & withdrawals" and the wallet panel's Activity always show a load error ("Failed to load…", "Try again in a moment"), because the app never requests the history
Severity: normal
Area: app

> **Summary.** If you sign in with e-mail (Privy embedded wallet, no browser wallet), Portfolio → **Deposits &
> withdrawals** always shows "Failed to load deposits and withdrawals." The wallet panel's **Activity** tab always shows
> "Activity did not load / Your history could not be read just now. Try again in a moment." Retrying or waiting does not
> help, because the app never sends the history request. The shipped `useEoaAddress()` returns `null` when the only
> connected wallet is the embedded one. That disables the `/api/transfers` query and puts the LayerZero-history hook into
> its `unavailable` state (`isError: true`), which the table and the panel show as a load failure. The data exists: in
> the same session, the endpoint the table would call returns 200 with the account's movements. Even if deposit history
> is meant to need a connected external wallet, the app shows a retry error where it should prompt the user to connect
> one, and the table already has a "disconnected" state for that.

> **Checked 2026-10-26, 02:18–02:29 UTC and again 03:39–03:44 UTC.** Both runs used the same e-mail session, in a
> browser profile with no wallet extension (`window.ethereum` undefined). Privy's connection list holds one wallet, the
> embedded one. Both runs showed the same two error texts and made 0 requests to `/api/transfers` or `/api/lz-scan`. The
> app's chunks fetched at 03:39:56 UTC are byte-identical to the copies taken at 02:24 UTC, and the live `/portfolio`
> HTML still references `1j1mgf8g_71p9.js` and `2x_aetkz4tpfd.js` (re-checked 04:53 UTC, with the `useEoaAddress` and
> `unavailable` code quoted below still in them). Evidence:
> `evidence/21/history_email_login_2026-10-26.txt`, `evidence/21/dw_tab_2026-10-26T0342Z.png`,
> `evidence/21/activity_2026-10-26T0344Z.png`.

The docs present e-mail and social login as a full alternative to a browser wallet. "Making Your First Deposit" says:
"**What you'll need:** an EVM wallet (MetaMask, Brave, or Rabby — or just an email / social login)". No docs page says
that deposit and withdrawal history, or wallet Activity, needs a connected external wallet. For these users, both
history views are a dead end that looks like a temporary server problem.

What the app does, from the live bundle (`/_next/static/immutable/chunks/`):

- `2x_aetkz4tpfd.js`, `useEoaAddress`: returns the first connected wallet that is **not** the Privy embedded wallet, or
  `null`:
  `function(){let{wallets:t}=(0,h.useWallets)(),e=(0,h.getEmbeddedConnectedWallet)(t),a=t.find(t=>t.address!==e?.address);return a?(0,i.getAddress)(a.address):null}`
- `1j1mgf8g_71p9.js`, `useTransferHistory`: `l=(0,h.useEoaAddress)()`. The movements query is
  `enabled:!!e&&!!t` → ``/api/transfers/${e}?owner=${t}``, so it never runs when `l` is `null`. The LayerZero-history
  hook is called with the same `l`. With no address, once Privy has loaded, it returns
  `p.unavailable = {isPending:!1,isError:!0}`. Code: `if(!e){let e=g?"restoring":"unavailable";return{...f,...p[e]}}`.
  `useTransferHistory` then returns `isError:j.isError||T.isError`, which is `true`.
- `3yc-pcuziojk3.js`, the Deposits & withdrawals table: `failure:n.isError?{message:"Failed to load deposits and withdrawals."}`
  and `state:a||t?…n.isError&&0===s.length?"failed":"ready":"disconnected"`. Here `t` is the portfolio account address,
  which is set for e-mail users, so the table shows "failed" and never "disconnected". By this code the result does
  not depend on the account's history, so a new account should also get the error instead of the empty-state text "No
  deposits, withdrawals or swaps yet". We tested only an account that has history.
- `2b01iu9z_dsn4.js` / `3-3anv00s3xre.js`, the wallet panel: `t7=(0,L.useTransferHistory)(r.TransferFilter.All)` →
  `t7.isError?{activityState:"failed"}` → "Activity did not load".

## Steps to reproduce
1. Use a browser with no wallet extension. Open https://app.testnet.dreamdex.io, then **Connect** → **Log in with email
   or socials** → e-mail OTP. Do not connect a wallet.
2. Open **Portfolio** → **Deposits & withdrawals**. You see "Failed to load deposits and withdrawals." Reloading does
   not change it.
3. Click the account button (top right) → **Overview** → **Activity**. You see "Activity did not load / Your history
   could not be read just now. Try again in a moment." Waiting or reloading does not change it.
4. In DevTools → Network, reload and repeat steps 2–3. No request goes to `/api/transfers/…` or `/api/lz-scan/…`. The
   app sends `POST /api/session?eoa=none`, and opening the panel sends `GET /api/admin/whoami?eoa=none`.
5. (For comparison) Click the header **Deposit**: "Connect a wallet to deposit / Deposits are paid from your login
   wallet, and no wallet is connected in this session." That flow explains the requirement; the history views do not.
6. Positive control, in the same tab's console (use your account's address from the wallet panel):
   ```js
   const acct = '0x…';  // your Somnia Account
   const r = await fetch(`/api/transfers/${acct}?owner=${acct}`); console.log(r.status, await r.json());
   ```
   It returns 200 with the account's movements. We got the same 2 movements with `owner` set to the embedded wallet
   that Privy lists for the session, and with `owner` set to the login wallet the backend links to the session.

## Expected
For an e-mail or social login, both history views load. The client already has the account address and the embedded
wallet, and the endpoint serves the history for them. If deposit history really does need a connected external wallet,
the table shows its existing "disconnected" view, and the panel says "Connect a wallet to see your activity", the way
the header Deposit dialog does. Neither should show a load failure that asks the user to try again.

## Actual
Account `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817` (Wallet 1), e-mail login. `privy:connections` holds one entry:
`connectorType "embedded"`, `walletClientType "privy"`, `0x2277Eb46b5116da71e15a0085A640c1E29C149c6`.

- **Deposits & withdrawals.** 03:41:21 UTC reload, 03:41:42 tab click, 03:42:02 text "Failed to load deposits and
  withdrawals." (`evidence/21/dw_tab_2026-10-26T0342Z.png`). The capture holds 377 requests: 0 to `/api/transfers`, 0 to
  `/api/lz-scan`, and `POST /api/session?eoa=none` → 204. The table's chunk `3yc-pcuziojk3.js` loaded on the click, and
  no history request followed it. The earlier run (02:18:41 reload, 02:19:06 click) gave the same text, with 411
  requests and 0 history requests.
- **Wallet panel Activity.** 03:44:04 UTC "Activity did not load / Your history could not be read just now. Try again
  in a moment." (`evidence/21/activity_2026-10-26T0344Z.png`). The earlier run showed the same text at 02:23:36, still
  there at 02:28:27, with 103 requests and 0 history requests. `GET /api/admin/whoami?eoa=none` → 403 "This action
  requires a staff wallet".
- **Header Deposit.** 02:28:40 UTC "Connect a wallet to deposit / Deposits are paid from your login wallet, and no
  wallet is connected in this session. Connect one to see your tokens and chains."
  (`evidence/21/deposit_dialog_2026-10-26T0228Z.png`).
- **Positive control.** 03:43:15–03:43:37 UTC, same tab, same-origin GET:
  `GET /api/transfers/0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817?owner=<login wallet>` → 200 in 1,747 ms,
  `"truncated":false`, 2 movements:
  - 49.25 STT `outflow-native`, tx `0x32aea480016d80b0b75496ff07b4100be00ba8ea145245dc4aa0cbae19e30d0e`, block 518460995;
  - 0.1 STT, tx `0x08e4949d78ad0b161b1138844159a7fcd30221890306913f2917163c34b742bd`, block 518460981.

  `owner=0x2277Eb46…49c6` (the embedded wallet) → 200, the same 2 movements. `owner=0x0e7E…3817` → 200, the same 2
  movements. `GET /api/lz-scan/wallet/<login wallet>?limit=100` → 200 `{"data":[]}`. The table would show these rows if
  it sent the request.

## Evidence
- `evidence/21/history_email_login_2026-10-26.txt`: session state, the list of app `/api/*` requests with times and
  statuses, the positive-control responses, the bundle excerpts with chunk sha256, and the docs quotes (live
  `https://app.testnet.dreamdex.io/llms-full.txt`, fetched 03:40:10 UTC).
- Screenshots: `evidence/21/dw_tab_2026-10-26T0342Z.png` (Deposits & withdrawals), `evidence/21/activity_2026-10-26T0344Z.png`
  (wallet panel Activity), `evidence/21/deposit_dialog_2026-10-26T0228Z.png` (header Deposit).
- Chunks (public, immutable): `https://app.testnet.dreamdex.io/_next/static/immutable/chunks/2x_aetkz4tpfd.js`,
  `…/1j1mgf8g_71p9.js`, `…/3yc-pcuziojk3.js`, `…/2b01iu9z_dsn4.js`, `…/3-3anv00s3xre.js`.

## Suggested fix
- In `useTransferHistory`, use the embedded wallet as the owner when there is no external wallet (it is already
  available from `getEmbeddedConnectedWallet`), so the `/api/transfers` query runs for e-mail and social logins. The
  endpoint returned the account's movements for that owner.
- In the LayerZero-history hook, treat "no EOA" as an empty result (`f`), not as `unavailable` with `isError: true`.
  Otherwise one missing bridge lookup turns the whole table into a failure.
- If an external wallet is required by design, return `state: "disconnected"`, or a "Connect a wallet to see deposit
  history" note like the Deposit dialog's, instead of `"failed"`. In the wallet panel, replace "Try again in a moment"
  with the same prompt.

## Environment
- App: app.testnet.dreamdex.io as served 2026-10-26, 02:18–02:29 and 03:39–03:44 UTC (Chrome 155, Linux, no wallet
  extension); chunks `2x_aetkz4tpfd.js`, `1j1mgf8g_71p9.js`, `3yc-pcuziojk3.js`, `2b01iu9z_dsn4.js`, `3-3anv00s3xre.js`
- Network: Somnia Tokyo testnet (chain id 50383, "Hideki" in the docs)
- Login: e-mail via Privy OTP. Somnia Account "Wallet 1" `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`; embedded wallet
  `0x2277Eb46b5116da71e15a0085A640c1E29C149c6`
- We tested only e-mail login. The code path depends only on there being no non-embedded wallet, so social logins
  without a linked wallet should behave the same, but we did not run them.
- `@somnia-chain/markets-sdk` 0.32.1 (not involved); no transactions sent
