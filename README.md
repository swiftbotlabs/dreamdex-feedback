# dreamdex-feedback

Reproducible issue reports for the dreamDEX Perps Builder Bounty (Feedback track), Somnia Hideki
testnet ("Tokyo" region), chain id 50383. One Markdown file per issue in `feedback/`, following the
template on the bounty's Details page.

Each report was reproduced against the live testnet with plain JSON-RPC / GraphQL requests or a
minimal viem script; the requests and responses are quoted inside the report. Nothing here is a
security vulnerability (those go to security@dreamdex.io, not to this repo).

Environment used throughout: `@somnia-chain/markets-sdk` 0.32.1 (source read from the npm tarball),
RPC `https://api.hideki2.infra.testnet.somnia.network`, indexer `https://hideki-dev.smk.somnia.host/v1/graphql`.

Some reports are also backed by real testnet transactions, sent from a throwaway key
(`0x2A11e7388D1D2F9690f2636846d44b478f61bF08`) that got its gas through the app's Link a bot flow.
They are listed with status, gas and fee in `evidence/onchain_txs_2026-10-19.txt`. Corrections to a
report are marked in the report itself ("Corrected …"). They are never silent edits.

Maintained by Swift Bot Labs.
