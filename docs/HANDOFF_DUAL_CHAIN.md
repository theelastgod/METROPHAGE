# $METRO settlement — two branches, not one toggle

The two $METRO settlement families are kept as **separate versions of the game**:

| Branch | Family | Wallets | Status |
|--------|--------|---------|--------|
| `main` (this) | Robinhood Chain ERC-20 (`0x` mint) | MetaMask / WalletConnect | **Authoritative — production** |
| `settlement/solana` | Solana SPL (base58 mint) | Phantom / AppKit | Preserved, deployable, not on prod |

Why a branch split rather than a runtime switch: the dual-chain tree flip-flopped
authoritative chain twice (Robinhood → Solana → Robinhood, "23 commits of drift"), and the
dormant Solana stack was the source of every high-severity `npm audit` finding on the
client (`bigint-buffer`, `axios` via `@solana/*` / `@reown/appkit-adapter-solana`). Compiling
only one family per branch removes the vuln surface and the "which chain is live?" ambiguity.

In-game **credits** stay server/D1 and chain-agnostic on both branches. Only the
deposit/withdraw settlement adapter and the wallet sign-in family differ.

- Robinhood runbook: `docs/METRO_CHAIN_CHOICE.md`, `docs/BRIDGE_GO_LIVE.md`, `MAINNET_GO_LIVE.md`.
- Solana runbook: check out `settlement/solana` and read the same files there.
- Bug fixes that are chain-agnostic (world, combat, economy sinks, UI) should be
  cherry-picked across; settlement code should not.
