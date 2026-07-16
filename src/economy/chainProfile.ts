// METROPHAGE — $METRO settlement profile.
//
// AUTHORITATIVE: Solana SPL mint (base58) → Phantom / Solana wallets.
// Dormant alternate: Robinhood Chain ERC-20 (0x…) — only with
// VITE_METRO_SETTLEMENT=robinhood.
//
// Default force is Solana. `auto` restores mint-shape detection if you need it.
// Game credits ledger is always server-authoritative and chain-agnostic.

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

/**
 * Explicit override. Default is **solana** (authoritative).
 * Use `robinhood` only to re-enable the dormant ERC-20 alternate.
 * Use `auto` for mint-shape detection (restore-friendly).
 */
export function settlementForce(): "robinhood" | "solana" | "auto" {
  const f = (env.VITE_METRO_SETTLEMENT || env.VITE_METRO_CHAIN || "solana").toLowerCase().trim();
  if (f === "robinhood" || f === "rh" || f === "evm") return "robinhood";
  if (f === "auto") return "auto";
  return "solana";
}

/**
 * Resolve settlement family from mint CA + force.
 * Empty mint → off (pure credits). Solana is default when mint is base58.
 * Robinhood mint only activates with force=robinhood or force=auto.
 */
export function resolveSettlementFamily(mint: string): {
  family: SettlementFamily;
  source: SettlementSource;
} {
  const m = (mint || "").trim();
  const force = settlementForce();

  if (force === "robinhood") {
    if (!m) return { family: "off", source: "none" };
    return { family: "robinhood", source: "env_force" };
  }

  if (force === "auto") {
    if (!m) return { family: "off", source: "none" };
    if (isEvmAddress(m)) return { family: "robinhood", source: "mint_shape" };
    if (isSolanaPubkey(m)) return { family: "solana", source: "mint_shape" };
    return { family: "off", source: "none" };
  }

  // solana (default / force)
  if (!m) return { family: "off", source: "none" };
  if (isSolanaPubkey(m)) return { family: "solana", source: "env_force" };
  // 0x mint while forced solana → stay off (do not silently take the EVM path)
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
  /** Solana is live; robinhood adapter remains in tree for optional restore. */
  alternateReady: {
    solana: true;
    robinhood: false;
    robinhoodAlternate: true;
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
    // Mainnet is the default; only explicit testnet cluster / chain id selects testnet.
    const wantTest =
      cluster === "robinhood-testnet" ||
      cluster === "rh-testnet" ||
      chainIdOverride === "46630";
    robinhood = wantTest ? ROBINHOOD_TESTNET : ROBINHOOD_MAINNET;
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
    // Mainnet is the default; only an explicit devnet cluster / RPC selects devnet.
    const wantDev =
      cluster === "devnet" ||
      cluster === "solana-devnet" ||
      (!cluster && /devnet/i.test(rpcOverride || ""));
    solana = wantDev ? SOLANA_DEVNET : SOLANA_MAINNET;
    rpcUrl = rpcOverride || solana.rpcUrl;
    chainId = null;
    mainnet = solana.mainnet;
    label = solana.name + " (SPL)";
  } else {
    // Off / awaiting CA — Solana mainnet is the network target for wallets.
    walletKind = "solana";
    const wantDev =
      cluster === "devnet" ||
      cluster === "solana-devnet" ||
      (!cluster && /devnet/i.test(rpcOverride || ""));
    solana = wantDev ? SOLANA_DEVNET : SOLANA_MAINNET;
    rpcUrl = rpcOverride || solana.rpcUrl;
    chainId = null;
    mainnet = solana.mainnet;
    label = wantDev
      ? "Off-chain credits · Solana devnet (awaiting CA)"
      : "Off-chain credits · Solana mainnet (awaiting CA)";
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
    alternateReady: { solana: true, robinhood: false, robinhoodAlternate: true },
  };
}

/** One-line status for logs / MetroPanel. */
export function dualChainSummary(p: DualChainProfile = getDualChainProfile()): string {
  if (p.family === "off") {
    return "METRO settlement OFF (no CA) — credits-only · Solana mainnet · set VITE_METRO_MINT (base58) when ready";
  }
  const arm = p.mainnet ? (p.mainnetArmed ? "ARMED" : "DISARMED") : "testnet";
  return `METRO → ${p.family} (${p.source}) · ${p.label} · ${arm}${p.settlementReady ? " · ready" : " · not ready"}`;
}
