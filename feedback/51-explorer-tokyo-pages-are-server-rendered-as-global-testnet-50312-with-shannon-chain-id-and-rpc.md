# Explorer (Tokyo): every `/tokyo/...` page is server-rendered as "Global testnet · chain 50312", so plain HTTP readers (curl, crawlers, the agents `llms.txt` invites) get Shannon's chain id, RPC and links for Tokyo; only the browser corrects it after JavaScript runs
Severity: normal
Area: explorer

> **Summary.** The explorer's `llms.txt` says "Everything here is readable by agents" and gives the Tokyo pages as
> "put /tokyo first, e.g. …/tokyo/tx/<hash>". The HTML the server sends for those pages describes the wrong network.
> On `/tokyo`, the overview of the chain dreamDEX perps run on, the network chip reads "Global testnet 50312". The
> **Connect** card gives "Somnia Global testnet · Chain id 50312 · RPC https://api.infra.testnet.somnia.network/ ·
> WebSocket wss://api.infra.testnet.somnia.network/ws", the feed says "Connecting to Global testnet over WebSocket", and
> the footer reads "global testnet · chain 50312". The served body text never contains "50383", "Tokyo testnet" or a
> Tokyo RPC. On `/tokyo/tx/<hash>`, `/tokyo/address/<a>` and `/tokyo/block/<n>`, the chip and footer say "Global
> testnet 50312" right next to a "Blockchain / Tokyo testnet / …" breadcrumb, and the sidebar links (Blocks,
> Transactions, Tokens, Accounts, Contracts, Charts) point to the Global testnet routes (`/blocks`, `/txs`…). After
> hydration a browser shows "Tokyo testnet 50383", Tokyo's RPC and `/tokyo/...` links, so the server output is the
> part that is wrong.

> **Checked 2026-10-28 at 08:49, 09:08, 09:16 and 09:22 UTC by plain HTTP (no cookies), compared with a fresh Chrome context at
> 08:52–08:53 UTC.** Same result each time. Evidence: `evidence/51/ssr_network_check_2026-10-28T0908Z.txt`,
> `evidence/51/ssr_network_check_2026-10-28T0916Z.txt`, `evidence/51/hydrated_tokyo_overview_2026-10-28T0852Z.txt`.

## Why it matters
A developer or agent setting up a dreamDEX bot reads the Tokyo overview to get the chain id and RPC. Over plain HTTP,
which is how `llms.txt`-guided agents, `curl` and most fetch tools read pages, it gets Shannon's chain id 50312 and
Shannon's RPC. Signing for 50312 against Shannon's RPC means the bot is on the wrong chain: its Tokyo pools, balances
and orders are not there. The same server HTML goes to search engines and link-preview bots, and a slow phone shows it
until hydration finishes. Its sidebar links lead to Shannon's block and transaction lists.

## Steps to reproduce
`python3 -I evidence/51/ssr_network_check.py` (read-only, standard library). It fetches five Tokyo pages and prints the
network chip, footer, breadcrumb, sidebar links and, for `/tokyo`, the Connect card. By hand:

```sh
strip='import re,sys,html; s=re.sub(r"(?s)<script.*?</script>","",sys.stdin.read()); t=re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]+>"," ",s)))'
curl -s https://explorer.testnet.somnia.network/tokyo | python3 -c "$strip; print(re.findall(r'Chain id \d+|RPC https\S+|chain \d+|Global testnet|Tokyo testnet', t))"
# ['Global testnet' (6x), 'Chain id 50312', 'RPC https://api.infra.testnet.somnia.network/', 'chain 50312']   (no 'Tokyo testnet')
curl -s https://explorer.testnet.somnia.network/tokyo/tx/0x05fa91ea29f12038f7369f38c01babc604cfc1a6061f5ef1b8c3c1c87984e2ec \
  | python3 -c "$strip; print(re.findall(r'Explorer Global testnet \d+|Blockchain / Tokyo testnet|chain \d+', t), re.findall(r'href=\"(/(?:tokyo/)?txs)\"', s))"
# ['Explorer Global testnet 50312', 'Blockchain / Tokyo testnet', 'chain 50312'] ['/txs']
```

Then open https://explorer.testnet.somnia.network/tokyo in a browser and compare: after hydration the chip reads
"Tokyo testnet 50383" and the Connect card gives chain id 50383 with `https://api.hideki.infra.testnet.somnia.network/`.

## Expected
The server renders `/tokyo/...` pages for Tokyo: chip and footer "Tokyo testnet · chain 50383", the Connect card with
Tokyo's chain id, RPC and WebSocket, and `/tokyo/...` sidebar links. The pages already know they are Tokyo pages: the
meta description and the breadcrumb say "Tokyo testnet", and the route is `/[network]/…`. The server HTML should then
match what the browser shows after hydration.

## Actual
`evidence/51/ssr_network_check_2026-10-28T0908Z.txt` (the 09:16 and 09:22 runs are identical):

```
/tokyo  HTTP 200
  network chip : Global testnet 50312
  footer       : global testnet · chain 50312
  sidebar links: /blocks -> /blocks, /txs -> /txs, /tokens -> /tokens, /top-accounts -> /top-accounts, /verified-contracts -> /verified-contracts, /charts -> /charts
  Chain id     : 50312 Currency STT RPC
  RPC          : https://api.infra.testnet.somnia.network/ Copy WebSocket wss://api.infra.testnet.somnia.network/ws
  Live from    : Global testnet Latest blocks
  Connecting to: Global testnet over WebSocket.

/tokyo/tx/0x05fa91ea29f12038f7369f38c01babc604cfc1a6061f5ef1b8c3c1c87984e2ec  HTTP 200
  network chip : Global testnet 50312
  footer       : global testnet · chain 50312
  breadcrumb   : Tokyo testnet
  meta desc    : 0x05fa91ea29…7984e2ec on Somnia Tokyo testnet · Status: Success · Value: 0 STT · Block: 35,210,700
  sidebar links: /blocks -> /blocks, /txs -> /txs, …
/tokyo/address/0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0  (BTC-PERP)   chip Global testnet 50312, footer chain 50312, breadcrumb Tokyo testnet
/tokyo/block/35210700                                                  chip Global testnet 50312, footer chain 50312, breadcrumb Tokyo testnet
```

After hydration (`evidence/51/hydrated_tokyo_overview_2026-10-28T0852Z.txt`, `evidence/51/hydrated_tokyo_tx_05fa_2026-10-28T0853Z.txt`):

```
EXPLORER / Tokyo testnet / 50383 · 893 ms
CONNECT  Somnia Tokyo testnet · Asia-Pacific · Tokyo · testnet
CHAIN ID 50383   RPC https://api.hideki.infra.testnet.somnia.network/   WEBSOCKET wss://api.hideki.infra.testnet.somnia.network/ws
// somnia explorer · tokyo testnet · chain 50383
Blocks -> /tokyo/blocks, Transactions -> /tokyo/txs, Tokens -> /tokyo/tokens, …
```

## Evidence
- `evidence/51/ssr_network_check_2026-10-28T0908Z.txt`, `…T0916Z.txt`, `…T0922Z.txt`: three runs, five pages.
- `evidence/51/hydrated_tokyo_overview_2026-10-28T0852Z.txt`, `evidence/51/hydrated_tokyo_tx_05fa_2026-10-28T0853Z.txt`:
  the same pages after JavaScript, in a fresh Chrome context.
- `evidence/51/ssr_network_check.py`: the script.

## Suggested fix
Resolve the network from the `[network]` route segment on the server, before rendering the shell (chip, sidebar,
footer, Connect card, live-feed placeholders). The page metadata and breadcrumb already do this. Do not render a
Global testnet default that the client then replaces.

## Environment
- Explorer: https://explorer.testnet.somnia.network as served 2026-10-28 (Next.js on Vercel, `x-matched-path:
  /[network]/tx/[hash]`); `llms.txt` fetched 08:49 UTC
- Tokyo testnet = Hideki, chain id 50383; Global testnet = Shannon, chain id 50312
- Python 3 standard library, curl 8.18.0, Chrome 155 on Linux; read-only
