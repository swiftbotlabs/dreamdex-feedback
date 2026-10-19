# App: every perps trading route, including the Perps Arena's "Start trading" and "Start Trading Now" buttons, redirects to the STT-USDso spot market, so the perps trading view cannot be opened
Severity: normal
Area: app

Why normal: nobody can open the perps trading view in the app, logged in or not, from any entry point, while the
Perps Arena is running. The perps markets themselves still work on chain and through the SDK and bot kit, so there
is a workaround for developers (not for ordinary Arena traders).

Every entry point in the app that should open a perps market goes to `/trade/perps/tokyo/<MARKET>-PERP`: the
top-nav **Trade** link, the logo, the Perps Arena hero button **Start trading** (`/competition`), the competition
hub's **Start Trading Now** (`/competition-hub`) and the perp rows of the market selector. That route answers with a
server-side `307` to `/trade`, which redirects (`307`) to `/trade/spot/tokyo/STT:USDso`. The user lands on the
STT-USDso spot market with no message. In the market selector, clicking a perp row closes the selector and nothing
else changes. We first saw this on 2026-10-19 between about 19:10 and 19:20 UTC while trading in the Arena, and
reproduced it again between 19:27 and 19:41 UTC.

## Steps to reproduce
1. Open https://app.testnet.dreamdex.io/trade/perps/tokyo/BTC-PERP (any perp market, e.g. `ETH-PERP`, `SOL-PERP`),
   logged out or logged in. Check the address bar or `location.href` after the page loads.
2. Logged in, open https://app.testnet.dreamdex.io/competition and click **Start trading**, or open
   https://app.testnet.dreamdex.io/competition-hub and click **Start Trading Now**. Both are
   `<a href="/trade/perps/tokyo/BTC-PERP">`.
3. On any spot page, open the market selector (**STT - USDso**) and click the **BTC 20x** row (or any perp row).
4. Optional, without a browser: `curl -sI https://app.testnet.dreamdex.io/trade/perps/tokyo/BTC-PERP`, then
   `curl -sI https://app.testnet.dreamdex.io/trade`.

## Expected
The BTC-PERP perps trading view (perp chart, order form with leverage, positions) at
`/trade/perps/tokyo/BTC-PERP`, as every perps link in the app and the Arena's call to action assume.

## Actual
- Step 1: `GET /trade/perps/tokyo/BTC-PERP` → `307 location: /trade` → `GET /trade` → `307 location:
  /trade/spot/tokyo/STT:USDso` → `200`. Final `location.href` =
  `https://app.testnet.dreamdex.io/trade/spot/tokyo/STT:USDso`, title `0.1866 | STT-USDso | dreamDEX`. The same
  happens logged out (fresh browser context, 19:31:51 UTC, screenshot `evidence/perps-redirect-direct-url-logged-out.png`)
  and logged in (`ETH-PERP`, 19:31:51 UTC).
- Step 2: the click makes the Next.js router fetch `/trade/perps/tokyo/BTC-PERP?_rsc=…`, which gets the same
  `307` → `/trade` → `307` → `/trade/spot/tokyo/STT:USDso`, and the page ends on the STT-USDso spot market
  ("Start trading" clicked 19:39:22 UTC; "Start Trading Now" clicked 19:31:27 UTC, screenshot
  `evidence/perps-redirect-start-trading-now.png`).
- Step 3: the selector closes, the router requests `/trade/perps/tokyo/BTC-PERP?_rsc=…`, gets the same two
  redirects, and the URL stays `https://app.testnet.dreamdex.io/trade/spot/tokyo/STT:USDso` (19:40 UTC).
- Step 4 (19:39:52 UTC): `/trade/perps/tokyo/BTC-PERP`, `/ETH-PERP` and `/SOL-PERP` → `307 location: /trade`;
  `/trade` → `307 location: /trade/spot/tokyo/STT:USDso`; `/perps` → `307 location: /trade/perps/tokyo/BTC-PERP`
  (so it ends on spot too); `/trade/perps` → `307 location: /trade/spot/perps`.
- Not regional: the same `307` from India (Vercel edge `bom1`) and from check-host.net nodes in France, Iran,
  Japan, Austria, Indonesia and the UK (reports linked in the evidence file).

## Evidence
- `evidence/perps_redirect_2026-10-19.txt`: curl response headers, the check-host results, and the Chrome DevTools
  network log (document requests, redirect responses with their `location` header, RSC fetches,
  `location.href` after load) for each entry point above.
- `evidence/perps-redirect-direct-url-logged-out.png`: what a logged-out visitor sees after requesting
  `/trade/perps/tokyo/BTC-PERP` (STT-USDso spot).
- `evidence/perps-redirect-start-trading-now.png`: the page reached from the competition hub's **Start Trading Now**,
  logged in (STT-USDso spot).

## Suggested fix
Remove whatever rule now sends `/trade/perps/*` to `/trade`. It is a server-side redirect, so a Next.js
middleware or `redirects()` entry is the likely place. If the perps view is turned off on purpose, show a notice
on the spot page and stop pointing the Arena buttons and the nav at it, because the Arena's onboarding quests (a
resting limit order, a TP/SL trigger order, trading 3 markets) need it.

## Environment
- App: app.testnet.dreamdex.io as served 2026-10-19 19:27–19:41 UTC (first seen ~19:10–19:20 UTC); network Tokyo /
  Hideki (chain 50383); responses from `server: Vercel`
- Browser: Chrome 155 on Linux, 1440×900; logged in = Privy e-mail login, Somnia Account wallet
  `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`; logged out = fresh browser context with no cookies
- curl 8.18.0
- `@somnia-chain/markets-sdk`: not involved
