# App (phone): the Perps Arena hero card cuts its description off mid-word at every phone width (360–430 px), and at 360–375 px the "dreamDEX Perps Arena" title too, because the text keeps a fixed 564 px width inside a clipped card
Severity: normal
Area: app

> **Summary.** On `/competition-hub`, the hero card's description paragraph has the classes `w-141 max-w-full`, a
> fixed 564 px width. Its parent is a flex column that takes its width from that same paragraph, so `max-w-full`
> resolves to 564 px and never limits it. The card is `overflow-clip`. On any viewport narrower than about 590 px,
> every line of the description runs past the card edge and is cut mid-word instead of wrapping. The page does not
> scroll sideways, so the rest cannot be reached. At 390 px a phone shows "…with $15,000 in r" / "…per wallet, comp" /
> "…without risking y". The parts that are lost include "real rewards", "compete on weekly and season ROI" and "your own
> trading capital". At 360 and 375 px the H2 "dreamDEX Perps Arena" is cut as well (360 px: "dreamDEX Perps Aren").
> Desktop shows the full title and description.

> **Checked 2026-10-26 in three runs, 06:09–06:21, 07:02–07:05 and 07:32–07:40 UTC, signed in.** All three gave the
> same numbers: the paragraph's right edge is at 591 px while the card ends at 354 / 369 / 384 / 408 / 424 px at
> 360 / 375 / 390 / 414 / 430 px wide. The live chunk `218evw0w6er2j.js` still contained the same markup at 07:32 UTC.
> Evidence: `evidence/36/measurements_2026-10-26.txt`,
> `evidence/36/arena_hero_phone_390x844_2026-10-26T0735Z.png`,
> `evidence/36/code_excerpt_2026-10-26T0732Z.txt`.

The hero card is the `<header>` at the top of the Perps Arena page. In the live bundle (chunk `218evw0w6er2j.js`,
sha256 `fb83b10b5036ad7c…`), the relevant markup is:

```js
(0,t.jsxs)("header",{className:"relative flex items-center gap-5 overflow-clip rounded-lg border border-card-edge bg-surface-raised p-5",children:[…,
 (0,t.jsxs)("div",{className:"relative flex min-w-0 flex-col items-start gap-3xl",children:[…,
  (0,t.jsxs)("div",{className:"flex flex-col gap-2xl font-medium",children:[
   (0,t.jsx)("h2",{className:"text-heading text-large-title",children:d.title}),
   d.description?(0,t.jsx)("p",{className:"w-141 max-w-full text-paragraph-400 text-subtle leading-5",children:d.description}):null]}),
```

1. The paragraph is `w-141`: 141 × 4 px = **564 px** wide.
2. Its parent `div.flex.flex-col.gap-2xl` sits in an `items-start` column, so it is sized to its content. Its content
   is the 564 px paragraph, so the div is also 564 px wide. `max-w-full` on the paragraph means 100 % of that
   564 px div, so it does not limit anything.
3. The `h2` fills the same 564 px div, so the title does not wrap either.
4. The `<header>` has `overflow-clip` (computed `overflow-x: clip`), so everything past its padding box is cut off.
   On a phone the card is 348–418 px wide, so each 564 px line is cut mid-word.

The same component lays out the rest of the card for phones: the trophy art is `max-xl:hidden`, and the buttons and
the **Prize pool** / **Traders** figures wrap to their own rows. Only the title block keeps its desktop width.

## Steps to reproduce
1. Sign in at https://app.testnet.dreamdex.io. The hero card appears only when you are signed in. Logged out, the page
   shows "Connect your wallet to see your quests" and has no hero card.
2. On a phone, or in Chrome DevTools device mode at **390 × 844** (also 360, 375, 414 or 430 wide), open
   https://app.testnet.dreamdex.io/competition-hub.
3. Read the card under **Live · Oct 12 - Nov 9**. Each of the three description lines stops mid-word at the card's
   right edge. At 360 px the title reads "dreamDEX Perps Aren".
4. Try to scroll the page or the card sideways. Neither moves.
5. Optional measurement in the console:
   ```js
   p=[...document.querySelectorAll('p')].find(e=>e.textContent.startsWith('Four-week'));
   h=p.closest('header');
   [getComputedStyle(p).width, Math.round(p.getBoundingClientRect().right),
    Math.round(h.getBoundingClientRect().right), getComputedStyle(h).overflowX,
    document.documentElement.scrollWidth]
   ```
   At 390 px this returns `['564px', 591, 384, 'clip', 390]`.
6. Repeat at 1440 × 900. The title and the description show in full.

## Expected
The title and the description wrap inside the card at every viewport width, as the rest of the card already does on
phones. `max-w-full` on the paragraph suggests this was the intent. All of the Arena's main description can be read
on a phone.

## Actual
Signed in, Chrome device emulation (mobile, touch, iPhone UA). In the table, "line ends" are the right edges of the
paragraph's three text lines, and the clip edge is the card's right edge minus its 1 px border. Measured
07:38:04–07:38:25 UTC (360–430), 07:04:19 UTC (600) and 07:39:51 UTC (1440).

| viewport | card clip edge | description line ends | hidden per line | title text ends | title hidden |
|---|---|---|---|---|---|
| 360 × 844 | 353 | 547 / 582 / 542 | 194 / 229 / 189 px | 375.8 | 22.8 px |
| 375 × 844 | 368 | 547 / 582 / 542 | 179 / 214 / 174 px | 375.8 | 7.8 px |
| 390 × 844 | 383 | 547 / 582 / 542 | 164 / 199 / 159 px | 375.8 | 0 |
| 414 × 844 | 407 | 547 / 582 / 542 | 140 / 175 / 135 px | 375.8 | 0 |
| 430 × 844 | 423 | 547 / 582 / 542 | 124 / 159 / 119 px | 375.8 | 0 |
| 600 × 844 | 593 | fits (paragraph box ends at 591) | 0 | fits | 0 |
| 1440 × 900 | 1383 | 597 / 632 / 592 | 0 | 426 | 0 |

`document.documentElement.scrollWidth` equals the viewport width at every size, so the page cannot be scrolled
sideways.

**What a phone shows:**

- **390 px** (07:35:14 UTC):
  ```
  dreamDEX Perps Arena
  Four-week paper trading competition with $15,000 in r
  weekly airdrop of 1,000 paper USDso per wallet, comp
  and complete quests for raffle tickets, without risking y
  ```
  Hidden: "real rewards. Trade with a", "compete on weekly and season ROI," and "your own trading capital."
- **375 px** (07:03 UTC): the last "a" of "Arena" is cut in half, and the three description lines are cut as at
  390 px.
- **360 px** (07:35:24 UTC):
  ```
  dreamDEX Perps Aren
  Four-week paper trading competition with $15,00
  weekly airdrop of 1,000 paper USDso per wallet, c
  and complete quests for raffle tickets, without risk
  ```
- **1440 px** (07:37:00 UTC), full text: "Four-week paper trading competition with $15,000 in real rewards. Trade with a
  weekly airdrop of 1,000 paper USDso per wallet, compete on weekly and season ROI, and complete quests for raffle
  tickets, without risking your own trading capital." The page's RSC payload holds the same text.

**Computed chain at 390 px** (07:35:14 UTC):

| element | class | computed width |
|---|---|---|
| `p` | `w-141 max-w-full text-paragraph-400 text-subtle leading-5` | 564px (max-width 100%) |
| `div` | `flex flex-col gap-2xl font-medium` | 564px |
| `div` | `relative flex min-w-0 flex-col items-start gap-3xl` | 336px |
| `header` | `relative flex items-center gap-5 overflow-clip … p-5` | 378px, `overflow-x: clip` |

**Fix check (client-side only, in our own tab, 07:39 UTC).** We changed only the paragraph's inline style to
`width: auto; max-width: 564px`, which is the same as `max-w-141` in place of `w-141 max-w-full`.

- At 390 px the paragraph became 336 px wide and wrapped to 5 lines, all inside the card (line ends ≤ 361, clip at
  383). The title wrapped to two lines.
- At 360 px the paragraph became 306 px wide, with 6 lines, all inside the card.
- At 1440 px the layout did not change: 564 px, 3 lines, the same line ends.

## Evidence
- `evidence/36/measurements_2026-10-26.txt`: readable summary of all runs (widths, clip edges, hidden pixels,
  computed chain, what each width shows, logged-out check, fix check).
- `evidence/36/arena_hero_phone_390x844_2026-10-26T0735Z.png`: the clipped description at 390 px.
- `evidence/36/arena_hero_phone_360x844_2026-10-26T0735Z.png`: the clipped title ("dreamDEX Perps Aren") and
  description at 360 px.
- `evidence/36/arena_hero_phone_375x844_2026-10-26T0703Z.png`: the title's last letter cut at 375 px.
- `evidence/36/arena_hero_desktop_1440x900_2026-10-26T0737Z.png`: the same account on desktop, full text.
- `evidence/36/text_edges_by_width_2026-10-26T0738Z.jsonl`: text line edges vs the clip edge at 360–430 px.
- `evidence/36/layout_json/`: raw layout reads per width (`phone_360`, `375`, `390`, `414`, `430`, `600`,
  `desktop_1440`) with the computed chain, element rectangles and the per-line visible/cut/hidden words.
- `evidence/36/logged_out_390_2026-10-26T0734Z.json`: logged out, no hero card in the DOM.
- `evidence/36/code_excerpt_2026-10-26T0732Z.txt`: the hero component from the live chunk, with the chunk's
  sha256 and the description text from the page payload. Raw copies: `evidence/36/raw/chunk_218evw0w6er2j.js`,
  `evidence/36/raw/hub_now.html`, `evidence/36/raw/chunks_now.txt`.
- `evidence/36/css_fix_test_2026-10-26T0739Z.jsonl` and
  `evidence/36/arena_hero_phone_390x844_with_css_fix_2026-10-26T0739Z.png`: the fix check.
- Chunk (public, immutable): `https://app.testnet.dreamdex.io/_next/static/immutable/chunks/218evw0w6er2j.js`.

## Suggested fix
- On the hero paragraph, replace `w-141 max-w-full` with `max-w-141` (or `w-full max-w-141`). The paragraph then
  takes the column's width on phones and stays 564 px on desktop. Our client-side check above gave exactly that.
- Optionally, give the title block (`flex flex-col gap-2xl`) `max-w-full` / `min-w-0`, so long campaign titles also
  wrap instead of being cut.

## Environment
- App: app.testnet.dreamdex.io/competition-hub as served 2026-10-26 06:09–07:40 UTC. Chunk `218evw0w6er2j.js`
  (27,860 bytes, sha256 `fb83b10b5036ad7cb876ce14582c2d2dd89259e7731b485d6e9275b2c46b0fa0`) was byte-identical at
  07:05 and 07:32 UTC.
- Browser: Chrome 155.0.8059.84 on Linux, DevTools device emulation (mobile = true, touch on, iPhone Safari user
  agent, device pixel ratio 2 and 3; both gave the same result). Desktop: 1440 × 900. We did not test on a physical
  phone.
- Account: signed in with a Privy e-mail login, Somnia Account `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`.
  Logged out means a fresh isolated browser context with no cookies.
- `@somnia-chain/markets-sdk`: not involved. No transactions sent.
