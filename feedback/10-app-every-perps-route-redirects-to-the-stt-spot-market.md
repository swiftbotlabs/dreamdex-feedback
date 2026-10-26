# App: the documented and in-app perps entry points (`/perps`, per-market deep links, the Perps Arena "Start trading" button) 307-redirect to the STT-USDso spot market
Severity: normal
Area: app

> **Summary.** On `app.testnet.dreamdex.io`, the perps entry points a user is pointed at all answer with a
> server-side `307` that ends on the STT-USDso spot market: the docs' `/perps` link, every per-market deep link
> `/trade/perps/<region>/<MARKET>-PERP` (regions `tokyo`, `dreamdex`, `hideki`, `somnia`), and the Perps Arena's
> **Start trading** button (`href="/trade/perps/tokyo/BTC-PERP"`). The user lands on `/trade/spot/tokyo/STT:USDso`
> with no notice, while the app's own feature flags in that page say perps are enabled and the default landing.

> **Scope correction (see "Corrections" below).** This is about the *entry points*, not a claim that the perps
> trading view is gone. The perps view is reachable in other states: a public competitor repo shows a trader placing
> BTC-PERP orders and arming TP/SL through this same app on 2026-10-22, and the perps home `/trade/perps/tokyo` has
> returned a page at other times (it is a `404` right now). The reproducible defect is that the links the docs and
> the app advertise send the user to spot.

> **Re-verified 2026-10-26, 13:12 UTC, logged out.** Still reproduces, as it has since 2026-10-19 ~19:10 UTC.
> Evidence: `evidence/10/perps_entrypoints_2026-10-26T1312Z.txt`.

## Steps to reproduce
1. `curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://app.testnet.dreamdex.io/perps` and follow each
   `location` by hand (or in a browser, logged out or logged in). Repeat for
   `/trade/perps/tokyo/BTC-PERP`, `/trade/perps/dreamdex/BTC-PERP`, `/trade/perps/hideki/BTC-PERP`,
   `/trade/perps/somnia/BTC-PERP`.
2. Logged in, open https://app.testnet.dreamdex.io/competition and click **Start trading** (an
   `<a href="/trade/perps/tokyo/BTC-PERP">`), or open `/competition-hub` and click **Start Trading Now**.
3. On any spot page, open the market selector (**STT - USDso**) and click a perp row (e.g. **BTC 20x**).

## Expected
Following `/perps`, a per-market deep link, or the Arena's **Start trading** opens a BTC-PERP perps trading view
(perp chart, leveraged order form, positions), as the docs and the Arena's call to action assume.

## Actual
Run 2026-10-26 13:12 UTC (`evidence/10/perps_entrypoints_2026-10-26T1312Z.txt`):

```
/perps                              307 -> /trade/perps/tokyo/BTC-PERP 307 -> /trade/spot/tokyo/STT:USDso 200
/trade/perps/tokyo/BTC-PERP         307 -> /trade/spot/tokyo/STT:USDso 200
/trade/perps/tokyo/ETH-PERP         307 -> /trade/spot/tokyo/STT:USDso 200
/trade/perps/dreamdex/BTC-PERP      307 -> /trade/perps/dreamdex 307 -> /trade/spot/tokyo/STT:USDso 200
/trade/perps/hideki/BTC-PERP        307 -> /trade/perps/hideki   307 -> /trade/spot/tokyo/STT:USDso 200
/trade/perps/somnia/BTC-PERP        307 -> /trade/perps/somnia   307 -> /trade/spot/tokyo/STT:USDso 200
/trade/perps/tokyo                  404
```

- **Step 2:** the click makes the Next.js router fetch the same `/trade/perps/tokyo/BTC-PERP?_rsc=…`, gets the same
  `307`s and ends on STT-USDso spot (first seen 2026-10-19 19:39 UTC, screenshot
  `evidence/perps-redirect-start-trading-now.png`).
- **Step 3:** the selector closes, the router requests the perp route, gets the same redirects, URL stays on spot.
- **The app's own flags say perps are on**, in the SSR payload of the spot page it lands on: `"gate-perps":false`,
  `"perp-markets-listed":true`, `"perps-default-landing":true`, `"dreambot-perps":true`. So the redirect contradicts
  the app's configuration rather than following a deliberate switch-off.
- **Server-side, not regional.** On 2026-10-20 a check-host.net run got the `307` from 38 of 40 nodes in 25
  countries for `/trade/perps/tokyo/BTC-PERP` (report in `evidence/perps_redirect_2026-10-20T0330Z.txt`).

## Evidence
- `evidence/10/perps_entrypoints_2026-10-26T1312Z.txt`: today's hop-by-hop chains for every entry point above and the
  four feature flags.
- `evidence/perps_redirect_2026-10-20T0330Z.txt`, `evidence/perps_redirect_2026-10-19.txt`: the curl headers, the
  check-host 38/40 report and the Chrome DevTools network log (document requests, redirect `location`s, RSC fetches)
  for each entry point, logged out and logged in.
- `evidence/perps-redirect-start-trading-now.png`, `evidence/perps-redirect-direct-url-logged-out.png`: the spot page
  a user reaches from the competition hub's **Start Trading Now** and from a direct perp URL.

## Suggested fix
Point `/perps`, the per-market deep links and the Arena's **Start trading** button at whatever route actually serves
the perps trading view (the one reachable in the working state), or, if perps are intentionally paused for a region,
show a notice on the spot page instead of a silent redirect and update the Arena CTAs, because the Arena onboarding
quests (a resting limit order, a TP/SL trigger order, trading 3 markets) depend on this view.

## Environment
- App: `app.testnet.dreamdex.io`, served 2026-10-26 13:12 UTC (first seen ~19:10 UTC 2026-10-19; re-checked 10-20,
  10-25, 10-26); network Tokyo / Hideki (chain 50383); responses `server: Vercel`
- Browser steps: Chrome 155 on Linux, logged in = Privy e-mail login, Somnia Account wallet
  `0x0e7E…3817`; logged out = fresh context. curl 8.18.0
- `@somnia-chain/markets-sdk`: not involved

## Corrections
- **Rescoped 2026-10-26 (severity major → normal).** The earlier version claimed "the perps trading view cannot be
  opened by anyone, from any entry point." That over-claims: the trading view is reachable in other states (a public
  competitor traded BTC-PERP and armed TP/SL through this app on 2026-10-22, and the perps home has loaded at other
  times), so a reviewer who can open perps could read the old claim as "not reproducible." The accurate, reproducible
  defect is the entry-point redirect, and the severity now matches a broken-navigation / UX issue. First seen and
  filed 2026-10-19 19:42 UTC, earlier than the other perps-route-redirect reports we are aware of.
