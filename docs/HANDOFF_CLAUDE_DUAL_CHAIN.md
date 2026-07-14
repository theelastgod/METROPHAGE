# Handoff → Claude Code: dual-chain $METRO economy

**Date:** 2026-07-13  
**Repo:** `/Users/wendellphillips/METROPHAGE`  
**Branch:** `main` (ahead of last deploy only by local WIP — dual-chain files **not committed**)  
**Last pushed commit:** `640a954` (god-mode hardening)

## Goal

Keep **both** $METRO settlement paths ready until the CA is known:

| Family | Mint shape | Wallet | Adapter |
|--------|------------|--------|---------|
| Robinhood Chain (ERC-20) | `0x…` | MetaMask | `server/src/evm.ts` |
| Solana (SPL) | base58 | Phantom / Solana | `server/src/solana.ts` |

In-game **credits** ledger stays server/D1 and is **chain-agnostic**. Only deposit/withdraw settlement adapters differ.

When the user provides the **contract/mint address**, set secrets + cluster and ship **one** family (auto-detect from mint shape, or force via env).

## What was started (local, uncommitted)

### New files
- `src/economy/solanaChain.ts` — Solana devnet/mainnet-beta defs (parallel to `robinhoodChain.ts`)
- `src/economy/chainProfile.ts` — dual-path resolve + `getDualChainProfile()` / `dualChainSummary()`
- `server/src/settlementFamily.ts` — server family resolve (`robinhood` | `solana` | `off`)
- `docs/METRO_CHAIN_CHOICE.md` — ops checklist for CA day

### Modified
- `src/economy/metro.ts` — wires dual profile into `getMetroStatus()`
- `server/src/index.ts` — `pickSettlement()` returns `family`; `/metro/pool` exposes dual-path fields
- `docs/BRIDGE_GO_LIVE.md`, `SHIPPING.md` — point at dual-path docs

### Env knobs (document + implement consistently)
| Side | Force family | Mint | Cluster |
|------|--------------|------|---------|
| Client | `VITE_METRO_SETTLEMENT=robinhood\|solana\|auto` | `VITE_METRO_MINT` | `VITE_METRO_CLUSTER` |
| Server | `METRO_SETTLEMENT=robinhood\|solana\|auto` | `METRO_MINT` | `METRO_RPC`, `METRO_CHAIN_ID` (EVM) |

Mainnet still counsel-gated: `METRO_MAINNET_ARMED` / `VITE_METRO_MAINNET_ARMED`.

## Known TypeScript errors (fix first)

From last `npx tsc --noEmit` (interrupted mid-session):

1. **`src/economy/chainProfile.ts:111`** — `??` and `||` mixed without parentheses  
2. **`src/economy/chainProfile.ts:142`** — `RobinhoodNetworkDef` uses **`isMainnet`**, not `mainnet`  
3. **`src/economy/metro.ts:155`** — unused `mainnetCluster`

Also confirm `Env` in `server/src/world.ts` includes optional `METRO_SETTLEMENT?: string` if not already.

## Suggested completion checklist

1. Fix the three tsc errors; `npx tsc --noEmit` clean.  
2. Align `metro.ts` `parseCluster()` with dual-path (base58 mint → solana clusters when unset).  
3. Ensure `/metro/pool` JSON always includes `family`, `familyLabel`, `dualPathReady`.  
4. Optional: MetroPanel shows `getMetroStatus().summary` (RH vs SOL) for debugging.  
5. Commit with message like:  
   `feat: dual-path $METRO (Robinhood ERC-20 + Solana SPL adapters)`  
6. Do **not** set live mint secrets until CA is known.  
7. No need to redeploy production for dormant path unless committing/shipping the scaffold is desired.

## Existing production code (already on main)

Do not reimplement from scratch:

- Bridge accounting: `server/src/metro.ts` (`BRIDGE` rates 100 in / 125 out)
- EVM settlement: `server/src/evm.ts`
- Solana settlement: `server/src/solana.ts` (player fee-payer claims; treasury never spends SOL)
- Client claim UX: `src/economy/claim.ts` (EVM raw tx **or** Solana wallet sign)
- Wallet: `src/economy/wallet.ts` (EVM preferred; Solana provider still present)

## Context the user stated

> “Create an alternate version of the economy based off of Solana and SOL chain. We are not sure if $METRO will be on SOL or Robinhood. When we have the contract address, we will know and tell you which system to implement.”

## Out of scope for this handoff

- God mode, quest log, FIXER, cold-start fixes (already shipped on `main`)  
- Actually arming mainnet or setting production CA  
- Changing credit rates without explicit ask  

## Verify after finish

```sh
cd /Users/wendellphillips/METROPHAGE
npx tsc --noEmit
cd server && npx wrangler deploy   # only if shipping server changes
# client only if shipping: npm run deploy:client
curl -sS https://metrophage-server.wendellphillips.workers.dev/metro/pool | jq .
```

---

**Claude Code prompt (paste):**

```
Continue METROPHAGE dual-chain $METRO work from docs/HANDOFF_CLAUDE_DUAL_CHAIN.md.
Repo: /Users/wendellphillips/METROPHAGE. Fix tsc errors in chainProfile.ts + metro.ts,
finish dual-path scaffold (RH ERC-20 + Solana SPL), leave mint unset for production.
Do not invent a CA. Commit when clean. Ask before deploy.
```
