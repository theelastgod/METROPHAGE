# Dual-chain $METRO economy

Keep **both** $METRO settlement paths ready until the contract address is known:

| Family | Mint shape | Wallet | Adapter |
|--------|------------|--------|---------|
| Robinhood Chain (ERC-20) | `0x…` | MetaMask | `server/src/evm.ts` |
| Solana (SPL) | base58 | Phantom / Solana | `server/src/solana.ts` |

In-game **credits** stay server/D1 and chain-agnostic. Only deposit/withdraw settlement adapters differ.

When the mint address is known, set server secrets first, then client `VITE_METRO_MINT`. Auto-detect from mint shape, or force via `METRO_SETTLEMENT` / `VITE_METRO_SETTLEMENT`.

See `docs/METRO_CHAIN_CHOICE.md` and `docs/BRIDGE_GO_LIVE.md`.
