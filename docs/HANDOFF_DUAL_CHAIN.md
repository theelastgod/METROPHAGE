# Dual-chain $METRO economy

**Solana SPL is the authoritative path.** Both adapters stay in the tree until the
contract address is known:

| Family | Mint shape | Wallet | Adapter | Status |
|--------|------------|--------|---------|--------|
| Solana (SPL) | base58 | Phantom / Solana | `server/src/solana.ts` | **authoritative (default)** |
| Robinhood Chain (ERC-20) | `0x…` | MetaMask | `server/src/evm.ts` | dormant alternate |

In-game **credits** stay server/D1 and chain-agnostic. Only deposit/withdraw settlement adapters differ.

When the mint address is known, set server secrets first, then client `VITE_METRO_MINT`. The default forces `solana`; use `auto` to detect from mint shape, or force the alternate via `METRO_SETTLEMENT=robinhood` / `VITE_METRO_SETTLEMENT=robinhood`.

See `docs/METRO_CHAIN_CHOICE.md` and `docs/BRIDGE_GO_LIVE.md`.
