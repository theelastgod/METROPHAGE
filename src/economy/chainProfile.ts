// METROPHAGE — $METRO settlement profile.
//
// AUTHORITATIVE: Solana SPL mint (base58) → Phantom / Solflare / Backpack.
// evm.ts / ERC-20 is unused on this build.
// Game credits ledger is always server-authoritative and chain-agnostic.

import {
  SOLANA_DEVNET,
  SOLANA_MAINNET,
  type SolanaNetworkDef,
  isSolanaPubkey,
  parseSolanaCluster,
} from "./solanaChain";

const env: Record<string, string | undefined> =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env) ||
  {};

/** Which on-chain family settles $METRO ↔ credits. */
export type SettlementFamily = "solana" | "off";

/** How the family was chosen. */
export type SettlementSource = "env_force" | "mint_shape" | "none";

export function isEvmAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test((s || "").trim());
}

/**
 * Explicit override. Default is **solana**.
 * `robinhood`/`evm` map to off — this build has no live ERC-20 adapter.
 */
export function settlementForce(): "solana" | "auto" | "off" {
  const f = (env.VITE_METRO_SETTLEMENT || env.VITE_METRO_CHAIN || "solana").toLowerCase().trim();
  if (f === "auto") return "auto";
  if (f === "off" || f === "robinhood" || f === "rh" || f === "evm") return "off";
  return "solana";
}

/**
 * Resolve settlement family from mint CA + force.
 * Empty mint → off. Base58 mint → solana. 0x mint → off (never silently take EVM).
 */
export function resolveSettlementFamily(mint: string): {
  family: SettlementFamily;
  source: SettlementSource;
} {
  const m = (mint || "").trim();
  const force = settlementForce();
  if (force === "off" || !m) return { family: "off", source: "none" };
  if (force === "auto") {
    if (isSolanaPubkey(m)) return { family: "solana", source: "mint_shape" };
    return { family: "off", source: "none" };
  }
  if (isSolanaPubkey(m)) return { family: "solana", source: "env_force" };
  return { family: "off", source: "none" };
}

export interface DualChainProfile {
  mint: string;
  family: SettlementFamily;
  source: SettlementSource;
  label: string;
  walletKind: "solana" | "none";
  solana: SolanaNetworkDef;
  rpcUrl: string | null;
  chainId: number | null;
  mainnet: boolean;
  mainnetArmed: boolean;
  settlementReady: boolean;
}

export function getDualChainProfile(opts?: {
  mint?: string;
  cluster?: string;
  rpc?: string;
  chainId?: string;
  mainnetArmed?: boolean;
}): DualChainProfile {
  const mint = (opts?.mint ?? env.VITE_METRO_MINT ?? "").trim();
  const { family, source } = resolveSettlementFamily(mint);
  const armed =
    opts?.mainnetArmed ??
    (env.VITE_METRO_MAINNET_ARMED === "1" || env.VITE_METRO_MAINNET_ARMED === "true");
  const cluster = parseSolanaCluster(opts?.cluster ?? env.VITE_METRO_CLUSTER);
  const rpcOverride = (opts?.rpc ?? env.VITE_METRO_RPC ?? "").trim() || null;

  const solana = cluster === "devnet" ? SOLANA_DEVNET : SOLANA_MAINNET;
  const rpcUrl = rpcOverride || solana.rpcUrl;
  const mainnet = solana.mainnet;
  const label =
    family === "solana"
      ? solana.name + " (SPL)"
      : mainnet
        ? "Off-chain credits · Solana mainnet (awaiting CA)"
        : "Off-chain credits · Solana devnet (awaiting CA)";

  return {
    mint,
    family,
    source,
    label,
    walletKind: "solana",
    solana,
    rpcUrl,
    chainId: null,
    mainnet,
    mainnetArmed: armed,
    settlementReady: family !== "off" && (!mainnet || armed),
  };
}

export function dualChainSummary(p: DualChainProfile = getDualChainProfile()): string {
  if (p.family === "off") {
    return "METRO settlement OFF (no CA) — credits-only · Solana · set VITE_METRO_MINT (base58) when ready";
  }
  const arm = p.mainnet ? (p.mainnetArmed ? "ARMED" : "DISARMED") : "devnet";
  return `METRO → ${p.family} (${p.source}) · ${p.label} · ${arm}${p.settlementReady ? " · ready" : " · not ready"}`;
}
