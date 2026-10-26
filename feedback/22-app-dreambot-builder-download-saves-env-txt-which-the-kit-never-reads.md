# App: the dreamBot Builder's "Download" button saves the bot config as `env.txt` in Chrome; the bot kit never reads `env.txt`, and its `.gitignore` does not cover it
Severity: normal
Area: app

> **Summary.** In step 5 (Deploy bot) of the dreamBot Builder, the panel "1 · Your config (.env)" has a **Download**
> button. In Chrome the file is saved as `env.txt`, not `.env`. The Builder's Option B then says "# save the .env above
> into this folder, then: npm run perp:doctor / npm run dev -w perp-starter". But the bot kit loads only a file named
> exactly `.env`, so a downloaded config placed in the kit folder is ignored and nothing warns about it. `perp:doctor`
> prints `wallet : (no PRIVATE_KEY — market view only)`. The key the user added, and every value changed on the Tune
> step, are silently dropped. The kit's `.gitignore` covers `.env` and `.env.*` but not `env.txt`, so `git add .` stages
> the file that holds the bot's private key. The file's own header says "never commit this file". The **Copy** button
> and the Railway path (paste into the RAW editor) do not go through the download and are not affected.

The Builder's code asks for the right name. Chrome saves a different one:

- Chunk `3lgo1ecy8evdr.js`, the Download button in the "1 · Your config (.env)" panel:
  `onClick:()=>{(0,rF.downloadFile)(o,".env","text/plain")},size:"xs",variant:"ghost",children:"Download"`
- Chunk `36wxbzkika9-r.js`, `downloadFile`:
  `function(e,t,r){let n=URL.createObjectURL(new Blob([e],{type:r})),o=document.createElement("a");o.href=n,o.download=t,document.body.appendChild(o),o.click(),...}`
- In Chrome 155 the anchor carries `download=".env"` (blob, `text/plain`, 361 bytes), but the browser reports
  `suggestedFilename='env.txt'` and saves `env.txt`. Chrome strips the leading dot from the download name and, because
  what is left (`env`) has no extension, adds `.txt` for the `text/plain` type.

The kit (`somnia-chain/dreamdex-bot-kit`, latest commit `2579866`) reads only `.env`:

- `packages/perp-core/src/config.ts:35-47`, `loadEnv()`, used by `perp:doctor` (through `loadConfig()`) and by
  `strategies/perp-starter/src/index.ts:56`: `const candidate = join(dir, ".env"); if (existsSync(candidate)) return void dotenv({ path: candidate });`.
  The fallback `dotenv()` also reads only `./.env`. When no file is found it returns without a message.
- The other loaders (`packages/core/src/env.ts`, `packages/ec-core/src/config.ts`, `scripts/doctor.ts`,
  `scripts/ec-doctor.ts` and more) also read a file named exactly `.env`.
- The kit's own README sets up `.env` (`cp .env.example .env`, `npm run quickstart # … writes a safe dry-run .env`). No
  page of the Builder, the kit README, the kit docs or the app's `llms-full.txt` mentions `env.txt` or says to rename the
  downloaded file.

## Steps to reproduce
1. In Chrome, open https://app.testnet.dreamdex.io/dreambot-builder.
2. Click **Skip** → **Next: Strategy** → **Perps** → **Perp Starter** → **Next: Network** → **Next: Tune** → **Get my bot**.
3. Click **Download** next to "1 · Your config (.env)". Chrome's download list shows `env.txt`.
4. Follow Option B on the same page: `git clone https://github.com/somnia-chain/dreamdex-bot-kit`, `cd dreamdex-bot-kit`,
   `npm install`, and put the downloaded file into this folder as saved. Replace `0x...` with a key (a fresh unfunded
   key is enough), then run `npm run perp:doctor`.
5. Rename the file to `.env` and run `npm run perp:doctor` again.
6. With the file still named `env.txt`, run `git check-ignore -v env.txt`, `git status --porcelain` and `git add -n .`
   in the kit folder.

## Expected
The file the Builder downloads is the file the kit reads. Either it arrives as `.env`, or the Builder says to rename it
before Option B ("save the .env above into this folder"). A config file that holds the bot's private key and says
"never commit this file" is covered by the kit's `.gitignore`.

## Actual
- **Step 3**, 2026-10-26 03:11:04 UTC (Chrome 155.0.8059.84, Linux): the anchor-click log shows
  `{"download": ".env", "hrefScheme": "blob", "blob": {"type": "text/plain", "size": 361}}`, then
  `downloadWillBegin suggestedFilename='env.txt'` and `downloadProgress state=completed receivedBytes=361`. The download
  folder holds `['env.txt']`. The file is the full Builder block (`NETWORK=hideki`, `DRY_RUN=true`,
  `STRATEGY=perp-starter`, `PRIVATE_KEY=0x...`, `PERP_SYMBOL=BTC-PERP` … `PERP_FLATTEN_ON_EXIT=false`). An earlier run
  at 01:28 UTC saved a byte-identical file (sha256 `50f7f3ff…b0f3`), also as `env.txt`.
- **Step 4**, 03:16:41 UTC, the downloaded file with a fresh random unfunded key filled in, named `env.txt` in the kit
  root:
  ```
  network  : hideki (chain 50383)
  indexer  : https://hideki-dev.smk.somnia.host/v1/graphql
  wallet   : (no PRIVATE_KEY — market view only)

  markets  : 21 live
  ```
  The output does not say that no `.env` was found. The unmodified download (placeholder `0x...`) named `env.txt` gives
  the same output (03:16:14 UTC).
- **Step 5**, 03:17:12 UTC, the same file named `.env`:
  ```
  wallet   : 0xdb2A8CbF7625e127a77365e94935E746C71980b2
  gas      : 0 STT
  wallet USDso : 0.0000 (in-wallet, not margin)
  margin   : unlocked 0.00 · locked 0.00 · equity 0.00 · withdrawable 0.00 · status Healthy · health ∞ (no position)
             ^ empty bank: approve the MarginBank and deposit collateral before trading.
  ```
  As a control, the unmodified download named `.env` is also read. It stops at the `0x...` placeholder with
  `Error: invalid private key, expected hex or 32 bytes, got string` (03:16:33 UTC), which shows the file was loaded.
  The placeholder error itself is a separate, known item and is not part of this report.
- **Step 6**, 03:49:36 UTC, kit `2579866`, git 2.53.0:
  ```
  $ git check-ignore -v env.txt; echo exit=$?
  exit=1
  $ git check-ignore -v --no-index .env; echo exit=$?
  .gitignore:7:.env	.env
  exit=0
  $ git status --porcelain
  ?? env.txt
  $ git add -n .
  add 'env.txt'
  ```
- **Still live**, 03:49 UTC: the Builder page references both chunks, and both are byte-identical to the copies taken
  at 03:11 UTC. The kit's GitHub `HEAD` is still `25798660bbe4674a6f83a960b202852896e2fed4` (2026-10-12).

## Evidence
- `evidence/22/builder_download_run_2026-10-26T0311Z.txt`: the click path with UTC times, the step-5 page text (incl.
  "1 · Your config (.env)", "Never share it, never commit this file." and "# save the .env above into this folder,
  then:"), the anchor-click log and the browser download events.
- `evidence/22/builder_deploy_step_2026-10-26T0128Z.png`: step 5 with the **Download** button next to "1 · Your config (.env)".
- `evidence/22/builder_download_saved_as_env.txt`: the file exactly as Chrome saved it (361 bytes, sha256 `50f7f3ff79d8d37f410064a0ebe52031555e0be94a958f02f77894faddc9b0f3`).
- Full `npm run perp:doctor` output for the four cases (real kit code, deps from the kit's lockfile; the test key was
  deleted afterwards):
  - `evidence/22/perp_doctor_A_download_as_env.txt_2026-10-26T0316Z.log` (download as saved, `env.txt`)
  - `evidence/22/perp_doctor_B_download_as_.env_2026-10-26T0316Z.log` (same file named `.env`)
  - `evidence/22/perp_doctor_C_key_filled_as_env.txt_2026-10-26T0316Z.log` (key filled in, `env.txt`)
  - `evidence/22/perp_doctor_D_key_filled_as_.env_2026-10-26T0317Z.log` (key filled in, `.env`)
- `evidence/22/bundle_excerpt_2026-10-26T0349Z.txt`: the download call, the `downloadFile` helper, the config header and
  the Option B text, with chunk sha256; `evidence/22/builder_page_chunks_2026-10-26T0349Z.txt`: chunk list of the live page.
- `evidence/22/kit_code_excerpt.txt`: `loadEnv()`, the other `.env` loaders, the `perp:doctor` wallet line, `.gitignore`
  and the README lines.
- `evidence/22/gitignore_check.txt`: step 6 output.
- Chunks (public, immutable): `https://app.testnet.dreamdex.io/_next/static/immutable/chunks/3lgo1ecy8evdr.js`,
  `…/36wxbzkika9-r.js`.

## Suggested fix
- In the Builder, make the Option B line match what the browser saves, e.g.
  `# save the config above as .env in this folder (the Download button saves it as env.txt: mv ~/Downloads/env.txt .env)`,
  or download under a name that keeps an extension (e.g. `dreambot.env`) with a "rename it to `.env`" note.
- In the kit's `.gitignore`, add `env.txt` (and `*.env`), since the Builder tells users to put a private key in that file.
- In `loadEnv()` / `perp:doctor`, say when no `.env` was found (for example `no .env found in <dir> or its parents`),
  and point at a stray `env.txt` if one exists. Today a missing config looks the same as a deliberate read-only run.

## Environment
- App: app.testnet.dreamdex.io/dreambot-builder as served 2026-10-26, 01:28 and 03:10–03:11 UTC; chunks re-checked
  03:49 UTC (`3lgo1ecy8evdr.js`, `36wxbzkika9-r.js`)
- Browser: Chrome 155.0.8059.84 on Linux. We tested only Chrome; other browsers may name the file differently.
- Bot kit: `somnia-chain/dreamdex-bot-kit` @ `25798660bbe4674a6f83a960b202852896e2fed4` (2026-10-12, latest),
  dependencies from its lockfile (`npm ci --ignore-scripts`), Node v22.22.1; the kit's own `@somnia-chain/markets-sdk`
  (0.31.0 under `perp-core`)
- Network: Somnia Tokyo testnet (chain id 50383, "Hideki" in the docs and kit), read-only; no transactions sent
