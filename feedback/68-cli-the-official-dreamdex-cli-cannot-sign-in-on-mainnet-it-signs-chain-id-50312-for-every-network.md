# CLI: the official dreamdex CLI cannot sign in on mainnet, its default network, because it signs `Chain ID: 50312` for every network, so every authenticated command fails with `chain_id_mismatch`
Severity: major
Area: SDK | docs

> **Summary.** The Quick Start calls `somnia-dex-cli` "the fastest experience", and the CLI defaults to mainnet (`https://api.dreamdex.io`). `buildSIWE` hardcodes `Chain ID: 50312` in the sign-in message. The docs say the field must match the network, and the mainnet API refuses
> it: `Error: login: chain_id_mismatch: chain ID in message does not match this network`. So on mainnet `dreamdex login`, `order place`, `order list`, `order cancel`, `mytrades`, the vault commands and the MCP server's authenticated tools all fail for every user. Public reads work, and the same commands work with
> `--testnet`, which hides the bug until a user moves to real funds.
>
> **Checked 2026-11-01, 12:22 UTC**, built from `somnia-chain/somnia-dex-cli` at `65cce8c` (the latest commit, 2026-07-07) with a fresh throwaway key. No order was sent. Evidence: `evidence/68/`.

## Steps to reproduce
```sh
go install github.com/somnia-chain/somnia-dex-cli/cmd/dreamdex@latest
export DREAMDEX_PRIVATE_KEY=0x<any fresh key>
dreamdex login                 # default network: mainnet
dreamdex mytrades
dreamdex --testnet login       # works
```

## Expected
`dreamdex login` signs the chain id of the network it is pointed at, as the docs require: "The `Chain ID` field in the SIWE message identifies the target network and must match the environment you are trading on: `5031` for Somnia mainnet, `50312` for Somnia Shannon testnet."

## Actual
```
$ dreamdex login   (default API https://api.dreamdex.io, mainnet)
Importing key into keystore...
Key stored in ~/.config/dreamdex/keystore/api.dreamdex.io
Error: login: chain_id_mismatch: chain ID in message does not match this network
$ dreamdex mytrades
Error: authentication failed: login: chain_id_mismatch: chain ID in message does not match this network
$ dreamdex order list WETH:USDso --status open
Error: authentication failed: login: chain_id_mismatch: chain ID in message does not match this network
$ dreamdex --testnet login
Authenticated as 0x<throwaway>
```

The cause is in `internal/cmd/auth.go`:
```go
return fmt.Sprintf(`%s wants you to sign in with your Ethereum account:
...
Version: 1
Chain ID: 50312
Nonce: %s
```

The API behaves as documented. We sent the same message by hand with both values: the mainnet host answers `401 chain_id_mismatch` for 50312 and issues a token for 5031, and the testnet host does the reverse.

The first key import also succeeds before the failure, so the user is told their key was stored, then gets an error naming a chain id they never set.

## Evidence
`evidence/68/cli_transcript_2026-11-01T1223Z.txt`. Source: https://github.com/somnia-chain/somnia-dex-cli/blob/65cce8c/internal/cmd/auth.go

## Suggested fix
Read the chain id from the RPC (`eth_chainId`) or from `/v0/markets`, and format it into the message. Add a mainnet login to the CLI's tests.

## Environment
- `somnia-chain/somnia-dex-cli` `65cce8c`, built with Go 1.27.3
- `https://api.dreamdex.io/v0` (chain 5031), `https://stg.api.dreamdex.io/v0` (chain 50312)
