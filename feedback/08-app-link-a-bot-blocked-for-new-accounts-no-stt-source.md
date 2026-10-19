# App/docs: a new account is told "Can't add a bot yet: the app's key … has no STT", and neither the app nor the docs say where STT comes from (the only faucet we found is a Telegram bot that pays on Shannon, which the app then bridges without saying so)
Severity: minor
Area: app | docs

> **Corrected 2026-10-19 15:20 UTC.** The first version of this report (commit `f2a1e30`, 10:58 UTC) said there was
> "no faucet anywhere" and that a new account could not link a bot at all. That was wrong. A faucet does
> exist: `@somnia_helper_bot` in the SomniaHacks Telegram group (`/faucet 0xADDR`, 50 STT per 24 h). With
> its STT the app's own flow works: Link a bot succeeded and sent the bot gas (transactions below).
> What is left is a discoverability gap, so the severity is lowered from normal to minor and the
> title, Actual and Suggested fix were rewritten. The original text stays in the git history.

The developer page "Perps on Testnet for Developers" says under **Get test funds**:

> STT for gas. The simplest route is through the app: sign in at app.testnet.dreamdex.io, then Link a
> Bot with your key's address and use Send it … for gas or Top up.

On a new account (e-mail login, new Somnia Account "Wallet 1", 0 STT) the Link a bot form shows, in red,
`Can't add a bot yet: the app's key that sends this change has no STT.` and **Add bot** is disabled.
Nothing in the app or on the docs pages tells the developer how to get STT:

- `/docs/developers/perps-testnet`, `/docs/trading/common/link-a-bot` and `/docs/trading/perps-testnet`
  contain no "faucet", "Telegram", "Discord", "Shannon" or "bridge" (checked 2026-10-19 15:12 UTC);
- the app's **Add funds** tab only shows a deposit address ("Deposit USDC, ETH & more").

The only STT source we found is outside both: the faucet bot in the SomniaHacks Telegram group (the group
the bounty page names for whitelist requests). It works, but it is not obvious that it helps:

1. The bot answers "✅ Sent 50 STT!" with a **Shannon** (chain 50312) transaction. dreamDEX runs on
   Hideki (chain 50383), where the wallet still has **0 STT**. A developer who checks the Hideki RPC
   would conclude that the faucet did not work.
2. In our case the STT reached Hideki only when we opened the app again, ~3 minutes after the faucet
   (Hideki balance still 0 just before the page load). Within ~10 s of loading the page, with no prompt
   or message that we saw, the app's relayer ran two Safe transactions on Shannon (0.1 STT to the app's key,
   49.25 STT bridged to chain 50383), the bridge delivered 49.25 STT to Wallet 1 on Hideki, and a third Safe
   transaction sent 0.5 STT to the app's key. Afterwards the wallet panel showed the two networks as one
   figure ("49.40 STT" = 0.65 left on Shannon + 48.75 on Hideki).
3. After that the Link a bot form showed `From Wallet 1 (48.75 STT)` with no red line, **Add bot**
   worked, and the bot got 5 STT (Top up worked too).

The block on a new account is real. The cause is that the app's key needs STT for the operator-grant
transaction. That key sent the grants itself, not the relayer: 14,880,792 + 2,583,044 gas at 6 gwei =
0.105 STT.

## Steps to reproduce
1. Open https://app.testnet.dreamdex.io, **Connect** → **Log in with email or socials** → e-mail OTP.
   A new Somnia Account wallet is created (ours: `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`).
2. Wallet panel → wallet name → **Link a bot**: red `Can't add a bot yet: the app's key that sends this
   change has no STT.`, Add bot disabled.
3. Search the three docs pages above and the app's Add funds tab for any way to get STT.
4. (Workaround) In the SomniaHacks Telegram group, faucet topic: `/faucet <Wallet 1 address>`. Check the
   balance on both chains: Shannon 50 STT, Hideki 0 STT.
5. Reload the app while logged in, wait ~10 s, then check Hideki again and open Link a bot again.

## Expected
The docs (Get test funds) and the red message in the Link a bot form name the STT source, and say that
Shannon STT is moved to the DreamDEX network automatically. Better still, the relayer pays for the
operator grant, so a new account never hits the red message.

## Actual
- Step 2: `Can't add a bot yet: the app's key that sends this change has no STT.` (screenshot
  `evidence/link-a-bot-no-stt.png`, 2026-10-19, taken before 11:00 UTC).
- Step 3: no faucet, Telegram, Discord or bridge mention on the docs pages; Add funds shows only a deposit address.
- Step 4: bot reply 14:26:43 UTC "✅ Sent 50 STT! Next claim in 24h."; Shannon tx
  [`0x73e36f03…b14a`](https://shannon-explorer.somnia.network/tx/0x73e36f033d3408de378aca6756a152ba88cd3b1d5cfd85fa4721bce13c65b14a)
  (block 518459349, from `0xCc14Cb19…c927`); Hideki `eth_getBalance` = 0 at block 27682541 (14:29 UTC).
- Step 5 (app opened 14:29 UTC), with no prompt:
  - Shannon [`0x08e4949d…42bd`](https://shannon-explorer.somnia.network/tx/0x08e4949d78ad0b161b1138844159a7fcd30221890306913f2917163c34b742bd):
    relayer `0xC4ab4435…cCBe` → Safe `execTransaction` on Wallet 1 → 0.1 STT to the app's key `0x2277Eb46b5116da71e15a0085A640c1E29C149c6`;
  - Shannon [`0x32aea480…0d0e`](https://shannon-explorer.somnia.network/tx/0x32aea480016d80b0b75496ff07b4100be00ba8ea145245dc4aa0cbae19e30d0e):
    same relayer → Wallet 1 calls `0x67CD0778…674C` (`0x81b4e8b4`, args chain 50383, Wallet 1, 49.25 STT) with 49.25 STT;
  - Hideki `0x9dee08b3352c33e2f10cc1fb1443a062d3e9abf0dc35e056eb52f06da48034c1` (14:29:30 UTC): bridge
    executor delivers 49.25 STT to Wallet 1;
  - Hideki `0x62f63e3e5cc9c4b3549039ec235792e91edd0e147c9421f98919f9bd359b7e7d` (14:29:34 UTC): relayer →
    Wallet 1 sends 0.5 STT to the app's key.
- Link a bot then works (14:34 UTC): `evidence/link-a-bot-after-funding.png` (form, no red line) and
  `evidence/link-a-bot-done.png` ("Sent 5 STT to the bot for gas."); Hideki txs `0xc7e1d393…0614` and
  `0x2d511faf…3144` (operator grants, sent by the app's key `0x2277…49c6`), `0x9126c516…bf8c` and `0xf937f3d3…4be7`
  (Safe executions). The bot `0x2A11e7388D1D2F9690f2636846d44b478f61bF08` then held 5 STT.

## Evidence
- `evidence/onchain_txs_2026-10-19.txt`: every transaction above with status, gas, fee, block and time
  (read back from both RPCs).
- Screenshots: `evidence/link-a-bot-no-stt.png` (before), `evidence/link-a-bot-after-funding.png`,
  `evidence/link-a-bot-done.png` (after).
- Wallet panel text read from the DOM at ~14:31 UTC, after the bridge: `Wallet 1 … STT 49.40 STT $9.27`
  (Hideki 48.75 + Shannon 0.65).
- Hideki has no public block explorer for plain transfers (the app's markets explorer
  `smk-dev-markets-explorer-hideki-…run.app/tx/<hash>` shows only indexed market events). Verify with
  `eth_getTransactionReceipt` on `https://api.hideki2.infra.testnet.somnia.network`.

## Suggested fix
- Put the STT route on the developer page next to "The simplest route is through the app": the faucet
  bot, the fact that it pays on Shannon, and that the app moves it to the DreamDEX network the next time
  you open it.
- Make the red Link a bot message actionable ("Get test STT: … then reopen the app"), and show a short
  notice when the app bridges funds between networks.
- Or have the relayer pay for the operator-grant transaction (the app already signs it with its own key),
  so a new account never needs STT before linking a bot.

## Environment
- App: app.testnet.dreamdex.io as served 2026-10-19 ~10:50 and 14:29–14:40 UTC (Chrome 155, Linux);
  network Tokyo / Hideki (50383); faucet on Somnia Shannon testnet (50312)
- `@somnia-chain/markets-sdk` 0.32.1 (not involved)
- Wallets: app wallet (Somnia Account) `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`; app key
  `0x2277Eb46b5116da71e15a0085A640c1E29C149c6`; bot key `0x2A11e7388D1D2F9690f2636846d44b478f61bF08`
