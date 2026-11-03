# App: the mainnet site banner still says "Perps Arena kicks off October 12", three weeks into the four-week campaign
Severity: normal
Area: app

> **Summary.** Every mainnet page we opened (Trade, Markets, Lend, and the not-found page) shows a logged-out visitor the banner "Perps Arena kicks off October 12. $15,000 in prizes. No deposit required. Terms apply. Join Perps Arena." It's November 3, and week 4, the last one, is running. The banner is served from the app's banner config: it was created on 2026-10-06 with no `startsAt` or `endsAt`, so nothing ever replaced it. The testnet app's banner was updated to "Perps Arena is live. $15,000 in rewards." Mainnet is where new visitors arrive, and it still pitches the event as upcoming.
>
> **Checked 2026-11-03, 11:14–11:29 UTC**, logged out. Evidence: `evidence/75/`.

## Steps to reproduce
Open https://app.dreamdex.io/trade/spot/SOMI:USDso in a private window and read the banner under the nav. Or:
```sh
curl -s https://app.dreamdex.io/trade/spot/SOMI:USDso | grep -o 'Perps Arena kicks off[^"\\]*'
```

## Expected
A banner that matches the campaign's state, like testnet's "Perps Arena is live", or one that ends when the campaign does.

## Actual
`campaignBanners` in the server-rendered mainnet HTML:
- `908d9db0-…`: created 2026-10-06 17:05 UTC, `startsAt` null, `endsAt` null, enabled, audience everyone. Message "Perps Arena kicks off October 12. $15,000 in prizes. No deposit required. Terms apply." The CTA goes to the testnet competition page.
- The second mainnet banner, "Get early access to Perps on dreamDEX. Join the mainnet waitlist.", links to `app.dreamdex.io/preregister` with `utm_source=testnet&utm_content=testnet_perps_arena_banner`. So clicks from mainnet get attributed to testnet.

## Evidence
- `evidence/75/banner_config_2026-11-03T1115Z.txt`: both mainnet banners as served (ids, dates, messages, links) and the testnet banner text
- `evidence/75/mainnet_trade_page_banner_2026-11-03T1114Z.png`

## Suggested fix
Change the mainnet message to the testnet wording, and give campaign banners an `endsAt` on the campaign's close. Fix the waitlist banner's UTM tags for mainnet.

## Environment
`https://app.dreamdex.io` (deployment `dpl_822sE9mQ3NfGnHbKcFyMvMvnWPGc`), logged out; `https://app.testnet.dreamdex.io` for comparison.
