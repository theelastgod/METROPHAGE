// METROPHAGE — $METRO settlement profile.
//
// AUTHORITATIVE: Robinhood Chain ERC-20 mint (0x…) → MetaMask / EVM.
// This branch is EVM-only. The Solana SPL settlement lives on the
// `settlement/solana` branch and is not compiled into this build.
//
// Game credits ledger is always server-authoritative and chain-agnostic.

import {
  ROBINHOOD_MAINNET,
  ROBINHOOD_TESTNET,
  type RobinhoodNetworkDef,
} from "./robinhoodChain";

const env: Record<string, string | undefined> =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env) ||
  {};

/** Which on-chain family settles $METRO ↔ credits. */
export type SettlementFamily = "robinhood" | "off";

/** How the family was chosen. */
export type SettlementSource = "env_force" | "mint_shape" | "none";

export function isEvmAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test((s || "").trim());
}

/**
 * Explicit override. Default is **robinhood** (authoritative).
 * `auto` keeps mint-shape detection (0x → robinhood, anything else → off).
 * A `solana` value is accepted for env compatibility but resolves to `off` —
 * this build has no SPL adapter.
 */
export function settlementForce(): "robinhood" | "auto" | "off" {
  const f = (env.VITE_METRO_SETTLEMENT || env.VITE_METRO_CHAIN || "robinhood").toLowerCase().trim();
  if (f === "auto") return "auto";
  if (f === "solana" || f === "sol" || f === "spl" || f === "off") return "off";
  return "robinhood";
}

/**
 * Resolve settlement family from mint CA + force.
 * Empty mint → off (pure credits). 0x mint → robinhood. Anything else → off.
 */
export function resolveSettlementFamily(mint: string): {
  family: SettlementFamily;
  source: SettlementSource;
} {
  const m = (mint || "").trim();
  const force = settlementForce();
  if (force === "off" || !m) return { family: "off", source: "none" };
  if (isEvmAddress(m)) {
    return { family: "robinhood", source: force === "robinhood" ? "env_force" : "mint_shape" };
  }
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
  walletKind: "evm" | "none";
  robinhood: RobinhoodNetworkDef | null;
  rpcUrl: string | null;
  chainId: number | null;
  mainnet: boolean;
  /** Counsel arm required before real-value mainnet settlement. */
  mainnetArmed: boolean;
  /** True when mint set AND (not mainnet OR armed). */
  settlementReady: boolean;
}

function pickRobinhood(cluster: string, chainIdOverride: string | undefined): RobinhoodNetworkDef {
  const wantTest =
    cluster === "robinhood-testnet" ||
    cluster === "rh-testnet" ||
    chainIdOverride === String(ROBINHOOD_TESTNET.chainId);
  let net = wantTest ? ROBINHOOD_TESTNET : ROBINHOOD_MAINNET;
  if (chainIdOverride) {
    const n = parseInt(chainIdOverride, 10);
    if (n === ROBINHOOD_MAINNET.chainId) net = ROBINHOOD_MAINNET;
    if (n === ROBINHOOD_TESTNET.chainId) net = ROBINHOOD_TESTNET;
  }
  return net;
}

/**
 * Full settlement status for UI + debugging.
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

  // Robinhood is the network target for wallets whether or not the CA is set yet.
  const robinhood = pickRobinhood(cluster, chainIdOverride);
  const rpcUrl = rpcOverride || robinhood.rpcUrl;
  const chainId = robinhood.chainId;
  const mainnet = robinhood.isMainnet;
  const label =
    family === "robinhood"
      ? robinhood.name + " (ERC-20)"
      : mainnet
        ? "Off-chain credits · Robinhood mainnet (awaiting CA)"
        : "Off-chain credits · Robinhood testnet (awaiting CA)";

  const settlementReady = family !== "off" && (!mainnet || armed);

  return {
    mint,
    family,
    source,
    label,
    walletKind: "evm",
    robinhood,
    rpcUrl,
    chainId,
    mainnet,
    mainnetArmed: armed,
    settlementReady,
  };
}

/** One-line status for logs / MetroPanel. */
export function dualChainSummary(p: DualChainProfile = getDualChainProfile()): string {
  if (p.family === "off") {
    return "METRO settlement OFF (no CA) — credits-only · Robinhood mainnet · set VITE_METRO_MINT (0x) when ready";
  }
  const arm = p.mainnet ? (p.mainnetArmed ? "ARMED" : "DISARMED") : "testnet";
  return `METRO → ${p.family} (${p.source}) · ${p.label} · ${arm}${p.settlementReady ? " · ready" : " · not ready"}`;
}
