# Bot kit: the run command the dreamBot Builder prints (`npm run dev -w perp-*`, which is `tsx watch`) delivers one Ctrl-C to the bot twice, so the perp bots exit without their shutdown cleanup and perp-maker leaves both quotes on the book
Severity: major
Area: SDK

> **Summary.** For a perps bot, the dreamBot Builder's "Option B · on your machine (free)" ends with
> `npm run dev -w <perp workspace>`. The header comments of all four perp strategies say the same. In the kit, `dev` is
> `tsx watch src/index.ts`. Under `tsx watch`, one Ctrl-C reaches the bot as two SIGINTs, about 3 ms apart. The kit's
> shared `onStop()` reads the second one as "Press Ctrl-C again to exit now" and calls `process.exit(1)`, so nothing
> after the main loop runs. In a live run on Hideki, perp-maker left both quotes on the book at full size until we
> cancelled them by hand about 2 minutes later. The same single Ctrl-C under `npm start` pulled both quotes, as the
> README promises.

> **Checked 2026-10-26 UTC.** We ran perp-maker live from 01:35 to 01:38 UTC. From 03:03 to 03:13 UTC we cloned the kit
> fresh and re-ran `npm run dev` and `npm start` on a real pseudo-terminal in dry-run mode. From 03:48 to 03:53 UTC we
> checked three things again. The kit's `main` is still `2579866`, committed 2026-10-12, and all four perp `dev`
> scripts are still `tsx watch src/index.ts`. The Builder chunk `3lgo1ecy8evdr.js` is unchanged (sha256 `6c61163b…`)
> on both app.testnet.dreamdex.io and app.dreamdex.io, and the Builder still prints `npm run dev -w perp-maker`
> (screenshot 03:51 UTC). `getOrder` at block 33264913 still returns both live-run orders with their full 7700000
> remaining. At 04:53 UTC the kit's GitHub `HEAD` was still `25798660`. Evidence: `evidence/13/recheck_2026-10-26T0348Z.txt`,
> `evidence/13/builder_option_b_perp-maker_2026-10-26.png` and `evidence/13/cast_getorder_recheck.txt`.

**Where users get the command.** On the Deploy bot step, the Builder prints this for every perps strategy (Perp
Starter, Perp Market Maker, Funding Carry, Perp Risk Guard):

```
git clone https://github.com/somnia-chain/dreamdex-bot-kit
cd dreamdex-bot-kit
npm install
# save the .env above into this folder, then:
npm run perp:doctor
npm run dev -w perp-maker
```

The bundle builds the last line as `` `npm run dev -w ${l.workspace}` `` and shows it under "Option B · on your machine
(free)". The four perp strategies also end their header comments with it: `//   npm run dev -w perp-starter`
(`strategies/perp-starter/src/index.ts:25`), and the same for `perp-maker` (:21), `perp-funding` (:21) and `perp-guard`
(:26). Each perp `package.json` has `"dev": "tsx watch src/index.ts"` and `"start": "tsx src/index.ts"`. The perp READMEs
and `docs/perps.md` say `npm start -w perp-…`, so the kit contradicts itself. Nothing in the kit says `npm run dev`
changes how Ctrl-C works.

**What happens on Ctrl-C.**
1. The terminal sends SIGINT to its whole foreground process group: npm, `sh`, the `tsx` parent and the bot's own
   `node` process.
2. Plain `tsx` (`npm start`) first waits to see whether the child has already received the signal
   (`relaySignalToChild`: `await s()!==r&&(t.kill(r)…`). The child has, so the bot gets **one** SIGINT.
3. `tsx watch` (`npm run dev`) registers `process.on("SIGINT", relaySignal)`, and `relaySignal` forwards the signal
   to the child without that check (`killProcess` → `l.kill(p)`). If the child is still alive 5 s later, it sends
   SIGKILL. The bot gets **two** SIGINTs.
4. The kit's shared handler (`packages/perp-core/src/exchange.ts:174-184`):
   ```ts
   const stop = () => {
     if (stopped) process.exit(1);
     stopped = true;
     console.log("\nstopping, finishing the current cycle first. Press Ctrl-C again to exit now.");
   };
   ```
   The second SIGINT arrives about 3 ms after the first and ends the process with code 1. Nothing after the main loop
   runs:
   - **perp-maker** (tested): `cancelQuietly` for both resting quotes and the `quotes pulled, exiting` line
     (`index.ts:190-196`) are skipped. Its README says "Ctrl-C pulls both quotes before exiting."
   - **perp-starter** (from the code, same `onStop` and post-loop code, not run live): the `if (stopped())` block
     (`index.ts:233-245`) is skipped. In own-account mode that block cancels the armed take-profit/stop-loss pair.
     The Builder says "A Perp Starter bracket also locks 0.30 STT while it is armed, returned when it is cancelled."
     The same block runs `PERP_FLATTEN_ON_EXIT`. The README says "Ctrl-C cancels them and reclaims the SOMI. Set
     `PERP_FLATTEN_ON_EXIT=true` to close the position on the way out as well." The Builder offers the setting as
     "When you stop the bot: Keep the position / Close the position", with the help text "With a linked bot the take-profit and stop-loss only act
     while it runs, so a stopped bot leaves the position unguarded." With the printed command, "Close the position"
     never runs.
   - **perp-funding / perp-guard** (from the code): after the loop they only print a final line and call
     `shutdown()`. Under `npm run dev` that line is missing, and a Ctrl-C that lands mid-cycle ends the process
     mid-cycle instead of "finishing the current cycle first".

This is not the error-path case, where a bot that throws leaves its quotes behind. Here the normal Ctrl-C path is cut
short. A `try/finally` around the main loop would not fix it, because `process.exit(1)` inside the signal handler ends
the process before any pending `finally` runs.

## Steps to reproduce
**A. Dry run, no key or funds needed**
1. `git clone https://github.com/somnia-chain/dreamdex-bot-kit && cd dreamdex-bot-kit && npm install` (HEAD
   `2579866`; we used `npm ci --ignore-scripts`, which installs tsx 4.22.4 from the lockfile).
2. Set `NETWORK=hideki`, `DRY_RUN=true` and `PERP_SYMBOL=XRP-PERP`. We exported them; a root `.env` works the same.
3. In a terminal, run `npm run dev -w perp-maker`, the Builder's command. Wait for both
   `[dry-run] would place quote …` lines, then press Ctrl-C **once**.
4. Control: run `npm start -w perp-maker` and press Ctrl-C once.
5. Optional, to see the signals: add a passive listener to the bot process only, then repeat steps 3 and 4 with
   `NODE_OPTIONS="--require /abs/path/siglog.cjs"`:
   ```js
   // siglog.cjs (the SIGLOG part of evidence/13/guard_siglog.cjs)
   if (process.argv[1]?.endsWith("src/index.ts")) {
     for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.stderr.write(`[siglog] ${process.pid} ${s} ${new Date().toISOString()}\n`));
     process.on("exit", (c) => process.stderr.write(`[siglog] ${process.pid} exit code=${c} ${new Date().toISOString()}\n`));
   }
   ```

**B. Live, with a funded Hideki key trading its own account**
1. Use a `.env` with `NETWORK=hideki`, `DRY_RUN=false`, `PRIVATE_KEY=<key with STT for gas and USDso in its MarginBank>`,
   `PERP_SYMBOL=XRP-PERP`, `PERP_MM_NOTIONAL_USDSO=10`, `PERP_MM_LEVERAGE=10`, `PERP_MM_HALF_SPREAD_BPS=100` and
   `PERP_MM_REFRESH_MS=5000`.
2. Run `npm run dev -w perp-maker`. Wait for both `placed quote … | order <id>` lines, then press Ctrl-C once.
3. Read both orders from the pool, for example with
   `cast call 0x7058579f3248559963f79adb937c6de9f953e060 "getOrder(uint128)((uint128,bool,address,uint64,uint256,uint256,uint256,uint64))" <id> --rpc-url https://api.hideki2.infra.testnet.somnia.network`.
4. Control: repeat steps 2 and 3 with `npm start -w perp-maker`.

Our live run started `tsx watch strategies/perp-maker/src/index.ts` from the repo root, which is what `npm run dev`
runs, in its own process group. It sent SIGINT to the whole group with `kill -INT -- -<pgid>`, which is what a
terminal does on Ctrl-C (`evidence/13/live_watch.sh`, `evidence/13/live_plain.sh`). We ran the npm commands themselves on a
real pseudo-terminal in part A.

## Expected
One Ctrl-C under the command the Builder prints runs the documented shutdown. perp-maker pulls both quotes,
perp-starter cancels its armed stops, and `PERP_FLATTEN_ON_EXIT=true` closes the position. The process exits at once
only on a second, deliberate Ctrl-C, as the bot's own message says.

## Actual
**A. Dry run, real pseudo-terminal (2026-10-26)**

| Command | Ctrl-C (0x03 to the pty) | SIGINTs the bot received | Bot exit | `quotes pulled, exiting` |
|---|---|---|---|---|
| `npm run dev -w perp-maker` | 03:07:44.917Z | 03:07:44.918Z and 03:07:44.921Z | code 1 at 03:07:44.921Z | no |
| `npm start -w perp-maker` | 03:07:53.759Z | 03:07:53.759Z only | code 0 at 03:07:55.120Z | yes |
| `tsx watch src/index.ts` (direct) | 03:08:03.316Z | 03:08:03.316Z and 03:08:03.319Z | code 1 at 03:08:03.320Z | no |

Without the listener, the same result holds: under `npm run dev` the output ends at `stopping, finishing the current
cycle first. Press Ctrl-C again to exit now.` (Ctrl-C at 03:07:12.463Z), and under `npm start` the next line is
`quotes pulled, exiting` (Ctrl-C at 03:07:20.251Z).

**B. Live, Somnia Tokyo / Hideki (50383), XRP-PERP pool `0x7058579f3248559963f79adb937c6de9f953e060`, signer
`0x2A11e7388D1D2F9690f2636846d44b478f61bF08` trading its own account**

Under `tsx watch` (what `npm run dev` runs):
- The bid, 7.7 XRP @ 1.2778, was order `664082786653550186447`, tx `0x7849bd35167e1e68b25a1d9821a87e9d470d43033aeb5e39d2b4afbe52203a5d`, block 33263643, 01:35:05Z.
- The ask, 7.7 XRP @ 1.3036, was order `866996971464355254224`, tx `0xdd572112e861cbaa78d651301fd63585a4572a230d8ea8f9a1335703b3c8640e`, block 33263650, 01:35:06Z.
- SIGINT went to the process group at 01:35:09.415Z. The log ends at `stopping, … Press Ctrl-C again to exit now.`
  with exit status 1. There is no `quotes pulled`.
- `getOrder` returned both orders with `quantityRemaining` 7700000 (the full size) at blocks 33263700 (01:35:11Z),
  33264772 (01:36:58Z) and 33264913 (01:37:12Z).
- `npm run perp:doctor`, run at 01:35:55Z, showed `margin : … locked 1.99`. Before the run, at 01:34:05Z, it showed
  `locked 0.00`.
- We cancelled both orders by hand: `0x4c7c770bb2dfa61c0e2f504051c6f77c746c3e62f5f32bfaf8a6d4da615ae36e` (block
  33264914) and `0xebb8db3842bbb367f5effe5459485d6752f815c5fe8eb55a17b7a612a214a48b` (block 33264917). At block
  33264918, `getOrder` reverts with `IncorrectOrder` (`0x8080c2ed`).

Control under plain `tsx` (what `npm start` runs):
- The bot placed `0xa783694f18da0bf433c8e511842b8f55fe8dbe306320d63cd01686c4ed06af79` (block 33265180) and
  `0xfc02449309f80308d1ae53703902b1217cbc4cc9fdea39257ba0ac02d016761c` (block 33265187), orders
  `866996971464355254568` and `664082786653550186793`.
- SIGINT at 01:37:43.160Z. The output shows `quotes pulled, exiting` and the exit status is 0.
- The bot's own cancels landed at once: `0x45276ecd7dc36b46730e72c6a903efa1c31388eb38b8ffed48e233c35981978d` (block
  33265225, 01:37:43Z) and `0xde8a95a040bd8a4b8cae38c775fe501328107625b640e93e7bd2a75f5f7bde31` (block 33265229,
  01:37:44Z).

## Evidence
All files are in `evidence/13/`:
- `pty_A_npm_run_dev.log`, `pty_B_npm_start.log`, `pty_C_npm_run_dev_siglog.log`, `pty_D_npm_start_siglog.log` and
  `pty_E_tsx_watch_direct_siglog.log`, each with a `.meta` file. They hold the terminal output, the process tree and
  process groups right before the key, the Ctrl-C time and the exit. `pty_ctrlc.py` is the driver: it writes 0x03 to
  the pty master, so the terminal itself sends the SIGINT. `guard_siglog.cjs` is the preload we used. Its `SIGLOG=1`
  part is the passive listener above; the rest limits the jail's network access to Somnia testnet hosts.
- `live_tsx_watch.log` and `live_tsx_plain.log`, each with a `.meta` file (process group, SIGINT time, exit status),
  plus the scripts that produced them, `live_watch.sh` and `live_plain.sh`.
- `onchain_txs_2026-10-26.txt`: all eight transactions with block, time, selector, status and gas.
  `onchain_check.mjs` → `onchain_check_2026-10-26T0312Z.txt` is a read-only check, re-run at 03:12 UTC. It gives each
  tx's target order ids, and `getOrder` for every order at the blocks listed under Actual.
- `cast_getorder_recheck.txt`: the `cast call getOrder` lines at blocks 33264913 and 33264918, re-run at 03:53 UTC.
- `perp_doctor_before_0134Z.txt` and `perp_doctor_after_watch_run_0135Z.txt`: `npm run perp:doctor` before the live
  watch run and after it.
- `code_excerpts.txt`: `exchange.ts:165-184`, the post-loop code of perp-maker and perp-starter, every perp
  `dev`/`start` script and header comment, the README Ctrl-C lines, the lockfile's tsx entry, the tsx 4.22.4 watch and
  non-watch signal code, and the Builder's run-command, Option B and `PERP_FLATTEN_ON_EXIT` fragments.
- `builder_option_b_perp-maker_2026-10-26.png`: the Builder's Option B showing `npm run dev -w perp-maker`, 03:51 UTC.
  `builder_deploy_step_perp-starter_2026-10-26T0128Z.png`: the Deploy step for Perp Starter, with
  `PERP_FLATTEN_ON_EXIT=false` in the generated `.env` and "A Perp Starter bracket also locks 0.30 STT while it is armed".
- `builder_chunk_3lgo1ecy8evdr.js`: the Builder chunk as served at 03:48 UTC. `recheck_2026-10-26T0348Z.txt` has the
  kit HEAD, the four `dev` scripts and the chunk hash on both hosts.

## Suggested fix
- Print `npm start -w ${workspace}` in the Builder's Option B, as `docs/perps.md` and the perp READMEs already do.
  Change the four perp header comments to `npm start -w perp-…` as well. Or make the perp `dev` scripts plain
  `tsx src/index.ts`.
- Make `onStop()` ignore a repeat signal that arrives within about 1 s of the first, so a relayed duplicate is not
  taken for the user's second Ctrl-C. On its own this is not enough under `tsx watch`, because tsx still sends SIGKILL
  5 s after it relays the signal (`killProcess`, `C=5e3`). A shutdown that takes longer, such as cancelling stops and
  then flattening, would still be cut off. That is why the printed command matters most.

## Environment
- `somnia-chain/dreamdex-bot-kit` at `25798660bbe4674a6f83a960b202852896e2fed4` (`main`, committed 2026-10-12
  10:34:21 UTC), installed with `npm ci --ignore-scripts`. tsx 4.22.4 comes from `package-lock.json`, and its tarball's
  sha512 matches the lockfile integrity. Node v22.22.1 and npm 9.2.0 on Linux (aarch64). We ran the kit code in a
  sandbox with no secrets and network access limited to Somnia testnet hosts.
- Somnia Tokyo testnet, chain id 50383 ("Hideki" in the docs and the kit), RPC
  `https://api.hideki2.infra.testnet.somnia.network`.
- dreamBot Builder: `https://app.testnet.dreamdex.io/dreambot-builder` and `https://app.dreamdex.io/dreambot-builder`,
  both serving `/_next/static/immutable/chunks/3lgo1ecy8evdr.js` (sha256
  `6c61163b1753e1f916c530fe1d95811f965a06731058954e329c2e47ad27ba87`). Chrome 155 on Linux.
- Wallet: our testnet bot key `0x2A11e7388D1D2F9690f2636846d44b478f61bF08`, trading its own account. The Builder
  screenshot was taken while logged in with our Somnia Account `0x0e7E8DF6Eac2E14165b4fA4CB2BD4e445d0E3817`.
- Dates: 2026-10-26. The live run was 01:35–01:38 UTC, the dry-run pty runs 03:07–03:08 UTC and the re-checks
  03:48–03:53 UTC.
- `@somnia-chain/markets-sdk`: 0.31.0 for `perp-core` and 0.30.0 at the root, per the kit's lockfile. It is not the cause.
