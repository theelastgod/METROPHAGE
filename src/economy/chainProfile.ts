// METROPHAGE — dual-path $METRO settlement profile.
//
// We do NOT know yet whether the live $METRO contract will be:
//   • Robinhood Chain ERC-20 (0x… mint)  → wallet: MetaMask / EVM
//   • Solana SPL mint (base58)           → wallet: Phantom / Solana
//
// Until the CA is known, both paths stay implemented and dormant.
// When you have the address, set env (see docs/METRO_CHAIN_CHOICE.md):
//   auto (default): detect family from mint shape
//   force: VITE_METRO_SETTLEMENT=robinhood | solana
//
// Game credits ledger is always server-authoritative and chain-agnostic.
// Only deposit/withdraw settlement adapters differ.

import {
  ROBINHOOD_MAINNET,
  ROBINHOOD_TESTNET,
  type RobinhoodNetworkDef,
} from "./robinhoodChain";
import {
  SOLANA_DEVNET,
  SOLANA_MAINNET,
  type SolanaNetworkDef,
  isSolanaPubkey,
} from "./solanaChain";

const env: Record<string, string | undefined> =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env) ||
  {};

/** Which on-chain family settles $METRO ↔ credits. */
export type SettlementFamily = "robinhood" | "solana" | "off";

/** How the family was chosen. */
export type SettlementSource = "env_force" | "mint_shape" | "none";

export function isEvmAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test((s || "").trim());
}

/** Explicit override: robinhood | solana | auto (default). */
export function settlementForce(): "robinhood" | "solana" | "auto" {
  const f = (env.VITE_METRO_SETTLEMENT || env.VITE_METRO_CHAIN || "auto").toLowerCase().trim();
  if (f === "robinhood" || f === "rh" || f === "evm") return "robinhood";
  if (f === "solana" || f === "sol" || f === "spl") return "solana";
  return "auto";
}

/**
 * Resolve settlement family from mint CA + optional force.
 * Empty mint → off (pure credits, no bridge panel settlement).
 */
export function resolveSettlementFamily(mint: string): {
  family: SettlementFamily;
  source: SettlementSource;
} {
  const m = (mint || "").trim();
  if (!m) return { family: "off", source: "none" };

  const force = settlementForce();
  if (force === "robinhood") return { family: "robinhood", source: "env_force" };
  if (force === "solana") return { family: "solana", source: "env_force" };

  if (isEvmAddress(m)) return { family: "robinhood", source: "mint_shape" };
  if (isSolanaPubkey(m)) return { family: "solana", source: "mint_shape" };

  // Unknown shape — stay off rather than guess wrong chain.
  return { family: "off", source: "none" };
}

export interface DualChainProfile {
  /** Mint / contract address (empty = bridge off). */
  mint: string;
  family: SettlementFamily;
  source: SettlementSource;
  /** Human label for UI. */
  label: string;
  /** Wallet UX path. */
  walletKind: "evm" | "solana" | "none";
  robinhood: RobinhoodNetworkDef | null;
  solana: SolanaNetworkDef | null;
  rpcUrl: string | null;
  chainId: number | null;
  mainnet: boolean;
  /** Counsel arm required before real-value mainnet settlement. */
  mainnetArmed: boolean;
  /** True when mint set AND (not mainnet OR armed). */
  settlementReady: boolean;
  /** Both paths are code-complete; only one activates per mint. */
  alternateReady: {
    robinhood: true;
    solana: true;
  };
}

/**
 * Full dual-path status for UI + debugging.
 * Call after CA is known — family flips automatically from mint shape unless forced.
 */
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
    (env.VITE_METRO_MAINNET_ARMED === "1" ||
      env.VITE_METRO_MAINNET_ARMED === "true");
  const cluster = (opts?.cluster ?? env.VITE_METRO_CLUSTER ?? "").toLowerCase().trim();
  const rpcOverride = (opts?.rpc ?? env.VITE_METRO_RPC ?? "").trim() || null;
  const chainIdOverride = opts?.chainId ?? env.VITE_METRO_CHAIN_ID;

  let robinhood: RobinhoodNetworkDef | null = null;
  let solana: SolanaNetworkDef | null = null;
  let rpcUrl: string | null = rpcOverride;
  let chainId: number | null = null;
  let mainnet = false;
  let label = "Off-chain credits only";
  let walletKind: DualChainProfile["walletKind"] = "none";

  if (family === "robinhood") {
    walletKind = "evm";
    const wantMain =
      cluster === "robinhood" ||
      cluster === "rh" ||
      cluster === "mainnet" ||
      chainIdOverride === "4663" ||
      armed;
    robinhood = wantMain ? ROBINHOOD_MAINNET : ROBINHOOD_TESTNET;
    if (chainIdOverride) {
      const n = parseInt(chainIdOverride, 10);
      if (n === 4663) robinhood = ROBINHOOD_MAINNET;
      if (n === 46630) robinhood = ROBINHOOD_TESTNET;
    }
    rpcUrl = rpcOverride || robinhood.rpcUrl;
    chainId = robinhood.chainId;
    mainnet = robinhood.isMainnet;
    label = robinhood.name + " (ERC-20)";
  } else if (family === "solana") {
    walletKind = "solana";
    const wantMain =
      cluster === "mainnet-beta" ||
      cluster === "mainnet" ||
      cluster === "solana-mainnet" ||
      /mainnet/i.test(rpcOverride || "") ||
      armed;
    solana = wantMain ? SOLANA_MAINNET : SOLANA_DEVNET;
    rpcUrl = rpcOverride || solana.rpcUrl;
    chainId = null;
    mainnet = solana.mainnet;
    label = solana.name + " (SPL)";
  }

  const settlementReady = family !== "off" && (!mainnet || armed);

  return {
    mint,
    family,
    source,
    label,
    walletKind,
    robinhood,
    solana,
    rpcUrl,
    chainId,
    mainnet,
    mainnetArmed: armed,
    settlementReady,
    alternateReady: { robinhood: true, solana: true },
  };
}

/** One-line status for logs / MetroPanel. */
export function dualChainSummary(p: DualChainProfile = getDualChainProfile()): string {
  if (p.family === "off") {
    return "METRO settlement OFF (no CA) — credits-only · RH+SOL adapters ready";
  }
  const arm = p.mainnet ? (p.mainnetArmed ? "ARMED" : "DISARMED") : "testnet";
  return `METRO → ${p.family} (${p.source}) · ${p.label} · ${arm}${p.settlementReady ? " · ready" : " · not ready"}`;
}
