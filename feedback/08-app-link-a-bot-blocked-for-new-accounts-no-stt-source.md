# App: Link a bot, the perps developer page's "simplest route" to bot gas, is blocked for a new account, and its "no STT" message names no STT source
Severity: normal
Area: app

> **Summary.** The perps developer page sends developers to Link a bot for gas, but on a new account Link a bot is disabled
> ("…has no STT") and names no source. The faucets other docs pages name pay on Shannon; the app moves that STT silently.

The developer page "Perps on Testnet for Developers" says under **Get test funds**:

> STT for gas. The simplest route is through the app: sign in at app.testnet.dreamdex.io, then Link a
> Bot with your key's address and use Send it … for gas or Top up.

On a new account (e-mail login, new Somnia Account "Wallet 1", 0 STT) the Link a bot form shows, in red,
`Can't add a bot yet: the app's key that sends this change has no STT.` and **Add bot** is disabled. The "simplest
route" to gas needs gas first. What a new developer can find at that point:

- The red message and the app's **Add funds** tab (only a deposit address, "Deposit USDC, ETH & more") name no STT source.
- The perps pages (`/docs/developers/perps-testnet`, `/docs/trading/common/link-a-bot`, `/docs/trading/perps-testnet` and
  its sub-pages) contain no "faucet", "Shannon", "bridge", "Telegram" or "Discord" (re-checked 2026-10-20 03:27 UTC).
- Other docs pages do name faucets, all for **Shannon** (chain 50312): the FAQ "My funds are not showing in the app" ("on
  testnet you take STT from the Somnia testnet faucet"), Simple Swap ("On chain `50312`, get STT for gas from the Somnia
  testnet faucet") and Quick start (testnet.somnia.network or the Google Cloud Web3 faucet). None of them says that perps
  run on Hideki (chain 50383) or how Shannon STT gets there.

What happens when a developer does use a Shannon faucet (we used `@somnia_helper_bot` in the SomniaHacks Telegram group,
`/faucet 0xADDR`, 50 STT per 24 h):

1. The STT lands on Shannon. The wallet still has 0 STT on Hideki, so a developer who checks the Hideki RPC sees nothing.
2. Only when we opened the app again, ~3 minutes later, did the app's relayer act: within ~10 s and with no prompt or
   message, it bridged 49.25 STT to Wallet 1 on Hideki and sent the app's key 0.1 STT on Shannon and 0.5 STT on Hideki.
   The wallet panel then showed both networks as one figure ("49.40 STT" = 0.65 on Shannon + 48.75 on Hideki).
3. Link a bot then worked: no red line, **Add bot** succeeded and sent the bot 5 STT.

The block itself is real: the app's key sends the operator-grant transactions itself (14,880,792 + 2,583,044 gas at
6 gwei = 0.105 STT), so it needs STT before the first bot can be linked.

## Steps to reproduce
1. Open https://app.testnet.dreamdex.io, **Connect** → **Log in with email or socials** → e-mail OTP. A new Somnia
   Account wallet is created (ours: `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`).
2. Wallet panel → wallet name → **Link a bot**: red `Can't add a bot yet: the app's key that sends this change has no
   STT.`, Add bot disabled.
3. Look for an STT source in the red message, the Add funds tab and the perps docs pages above.
4. (Workaround) Get STT from a Shannon faucet (we used `/faucet <Wallet 1 address>` in the SomniaHacks Telegram group).
   Check the balance on both chains: Shannon 50 STT, Hideki 0 STT.
5. Reload the app while logged in, wait ~10 s, then check Hideki again and open Link a bot again.

## Expected
The red message in the Link a bot form and the perps developer page name the STT source and say that Shannon STT is
moved to the DreamDEX network when the app is opened. Better still, the relayer pays for the operator grant, so a new
account never hits the red message.

## Actual
- Step 2: the red message (screenshot `evidence/link-a-bot-no-stt.png`, 2026-10-19, taken before 11:00 UTC).
- Step 3: no STT source in the app or on the perps docs pages.
- Step 4: faucet reply 14:26:43 UTC "✅ Sent 50 STT! Next claim in 24h."; Shannon tx
  [`0x73e36f03…b14a`](https://shannon-explorer.somnia.network/tx/0x73e36f033d3408de378aca6756a152ba88cd3b1d5cfd85fa4721bce13c65b14a);
  Hideki `eth_getBalance` = 0 at block 27682541 (14:29 UTC).
- Step 5 (app opened 14:29 UTC), with no prompt:
  - Shannon [`0x08e4949d…42bd`](https://shannon-explorer.somnia.network/tx/0x08e4949d78ad0b161b1138844159a7fcd30221890306913f2917163c34b742bd):
    relayer `0xC4ab4435…cCBe` → Safe `execTransaction` on Wallet 1 → 0.1 STT to the app's key `0x2277Eb46b5116da71e15a0085A640c1E29C149c6`;
  - Shannon [`0x32aea480…0d0e`](https://shannon-explorer.somnia.network/tx/0x32aea480016d80b0b75496ff07b4100be00ba8ea145245dc4aa0cbae19e30d0e):
    same relayer → Wallet 1 calls `0x67CD0778…674C` with 49.25 STT (`0x81b4e8b4`, args chain 50383, Wallet 1, 49.25 STT);
  - Hideki `0x9dee08b3352c33e2f10cc1fb1443a062d3e9abf0dc35e056eb52f06da48034c1` (14:29:30 UTC): the bridge executor
    delivers 49.25 STT to Wallet 1;
  - Hideki `0x62f63e3e5cc9c4b3549039ec235792e91edd0e147c9421f98919f9bd359b7e7d` (14:29:34 UTC): relayer → Wallet 1
    sends 0.5 STT to the app's key.
- Link a bot then works (14:34 UTC): `evidence/link-a-bot-after-funding.png` (no red line) and
  `evidence/link-a-bot-done.png` ("Sent 5 STT to the bot for gas."); operator grants `0xc7e1d393…0614` and
  `0x2d511faf…3144` were sent by the app's key `0x2277…49c6`.

## Evidence
- `evidence/onchain_txs_2026-10-19.txt`: every transaction above with status, gas, fee, block and time (read back from
  both RPCs).
- Screenshots: `evidence/link-a-bot-no-stt.png` (before), `evidence/link-a-bot-after-funding.png`,
  `evidence/link-a-bot-done.png` (after).
- Hideki has no public block explorer for plain transfers; verify with `eth_getTransactionReceipt` on
  `https://api.hideki2.infra.testnet.somnia.network`.

## Suggested fix
- Have the relayer pay for the operator-grant transaction (the app already signs it with its own key), so a new account
  never needs STT before linking a bot.
- Or make the red message actionable ("Get test STT from … ; it arrives on DreamDEX the next time you open the app"), and
  show a short notice when the app bridges funds between networks.
- On the perps developer page, next to "The simplest route is through the app", name the faucet and the Shannon → Hideki
  move.

## Environment
- App: app.testnet.dreamdex.io as served 2026-10-19 ~10:50 and 14:29–14:40 UTC (Chrome 155, Linux); network Tokyo /
  Hideki (50383); faucet on Somnia Shannon testnet (50312). Docs text re-checked 2026-10-20 03:27 UTC.
- `@somnia-chain/markets-sdk` 0.32.1 (not involved)
- Wallets: app wallet (Somnia Account) `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`; app key
  `0x2277Eb46b5116da71e15a0085A640c1E29C149c6`; bot key `0x2A11e7388D1D2F9690f2636846d44b478f61bF08`

## Corrections
- **Corrected 2026-10-19 15:20 UTC.** The first version of this report (commit `f2a1e30`, 10:58 UTC) said there was
  "no faucet anywhere" and that a new account could not link a bot at all. That was wrong. A faucet does exist
  (`@somnia_helper_bot` in the SomniaHacks Telegram group), and with its STT the app's own flow works. The severity was
  lowered from normal to minor and the title, Actual and Suggested fix were rewritten.
- **Corrected 2026-10-20.** Severity minor → normal: "minor" is not on the bounty's scale (critical | major | normal), and
  normal is its lowest value. Removed a second false claim, that neither the app nor the docs say where STT comes from:
  the docs FAQ, Simple Swap and Quick start pages name Shannon faucets. The report now covers only what is still wrong:
  the perps pages and the red message name no source, those faucets pay on Shannon, and the app moves the STT to Hideki
  with no notice. Retitled, Area now `app` only, shortened, summary added, correction notes moved here. Earlier
  versions are in the git history.
