// METROPHAGE — $METRO on-chain layer gate (Phase 5).
//
// AUTHORITATIVE: Solana mainnet-beta SPL (base58 mint) — Phantom / WalletConnect
// Dormant alternate: Robinhood Chain ERC-20 (0x) — only with VITE_METRO_SETTLEMENT=robinhood
// Empty mint → pure off-chain credits (awaiting CA). Real-value settlement also needs METRO_MAINNET_ARMED.
// Go-live: VITE_METRO_MINT (base58) + server METRO_MINT + METRO_TREASURY_SECRET + MAINNET_ARMED=1.

import {
  ROBINHOOD_MAINNET,
  ROBINHOOD_TESTNET,
  type RobinhoodCluster,
  robinhoodNetwork,
} from "./robinhoodChain";
import { getDualChainProfile, dualChainSummary, type DualChainProfile } from "./chainProfile";
import { isSolanaPubkey } from "./solanaChain";
import {
  METRO_TOTAL_SUPPLY as POLICY_SUPPLY,
  METRO_P2E_DESIGN_POOL,
  METRO_PER_PLAYER_LIFETIME_BUDGET,
  TARGET_PLAYERS,
  BASE_DEPOSIT_CREDITS,
  BASE_WITHDRAW_CREDITS,
  BASE_MIN_WITHDRAW_CREDITS,
  METRO_DEV_SEED_METRO,
} from "../game/economyPolicy";

const env: Record<string, string | undefined> =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env) ||
  {};

/** The $METRO SPL mint (the "CA"); a 0x ERC-20 contract on the dormant alternate. Empty = layer off. */
export const METRO_MINT = env.VITE_METRO_MINT ?? "";

export type MetroCluster =
  | "robinhood"
  | "robinhood-testnet"
  | "sepolia"
  | "mainnet"
  | "devnet"
  | "mainnet-beta"
  | "custom";

function parseCluster(): MetroCluster {
  const c = (env.VITE_METRO_CLUSTER || "").toLowerCase().trim();
  if (c === "mainnet-beta" || c === "mainnet" || c === "solana-mainnet" || c === "sol-mainnet")
    return "mainnet-beta";
  if (c === "robinhood" || c === "rh" || c === "rh-mainnet") return "robinhood";
  if (c === "robinhood-testnet" || c === "rh-testnet") return "robinhood-testnet";
  if (c === "sepolia" || c === "devnet" || c === "custom") return c as MetroCluster;
  // Solana mainnet-beta is authoritative. Only an explicit EVM force uses Robinhood defaults.
  const force = (env.VITE_METRO_SETTLEMENT || "").toLowerCase();
  if (force === "robinhood" || force === "rh" || force === "evm") {
    return "robinhood";
  }
  return "mainnet-beta";
}

/** Target network. Defaults Solana mainnet-beta (authoritative path). */
export const METRO_CLUSTER: MetroCluster = parseCluster();

export const METRO_MAINNET_ARMED = env.VITE_METRO_MAINNET_ARMED === "1";

export function metroApiBase(): string {
  const ws = env.VITE_SERVER_URL ?? "ws://127.0.0.1:8787/ws";
  return ws.replace(/^ws/, "http").replace(/\/ws$/, "");
}

export function isEvmAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test((s || "").trim());
}

/** Active Robinhood network when cluster is robinhood / robinhood-testnet. */
export function activeRobinhoodNetwork() {
  if (METRO_CLUSTER === "robinhood") return ROBINHOOD_MAINNET;
  if (METRO_CLUSTER === "robinhood-testnet") return ROBINHOOD_TESTNET;
  return null;
}

/** EIP-155 chain id, or null on Solana clusters (SPL has no chain id). */
export function metroChainId(): number | null {
  const rh = activeRobinhoodNetwork();
  if (rh) return rh.chainId;
  // Solana is authoritative — no chain id on the SPL path.
  if (METRO_CLUSTER === "mainnet-beta" || METRO_CLUSTER === "devnet") return null;
  if (env.VITE_METRO_CHAIN_ID) {
    const n = parseInt(env.VITE_METRO_CHAIN_ID, 10);
    return Number.isFinite(n) ? n : null;
  }
  // Dormant EVM alternate: only once a 0x mint is actually in hand.
  if (isEvmAddress(METRO_MINT)) return ROBINHOOD_MAINNET.chainId;
  return null;
}

export function metroRpc(): string {
  if (env.VITE_METRO_RPC) return env.VITE_METRO_RPC;
  const rh = activeRobinhoodNetwork();
  if (rh) return rh.rpcUrl;
  if (METRO_CLUSTER === "devnet") return "https://api.devnet.solana.com";
  if (METRO_CLUSTER === "mainnet-beta") return "https://api.mainnet-beta.solana.com";
  // Dormant EVM alternate: only once a 0x mint is actually in hand.
  if (isEvmAddress(METRO_MINT)) return ROBINHOOD_MAINNET.rpcUrl;
  return "https://api.mainnet-beta.solana.com";
}

/** Default Robinhood cluster string for wallet_switch — mainnet unless testnet forced. */
export function metroRobinhoodCluster(): RobinhoodCluster {
  return METRO_CLUSTER === "robinhood-testnet" ? "robinhood-testnet" : "robinhood";
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(s: string): number[] | null {
  const bytes: number[] = [0];
  for (const ch of s) {
    const v = BASE58.indexOf(ch);
    if (v < 0) return null;
    let carry = v;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < s.length && s[i] === "1"; i++) bytes.push(0);
  return bytes.reverse();
}

export function isValidSolanaMint(s: string): boolean {
  if (isSolanaPubkey(s)) return true;
  if (!s || s.length < 32 || s.length > 44) return false;
  const bytes = base58Decode(s);
  return bytes != null && bytes.length === 32;
}

export function isValidMetroMint(s: string): boolean {
  return isEvmAddress(s) || isValidSolanaMint(s);
}

export const metroEnabled = isValidMetroMint(METRO_MINT);
export const metroIsEvm = isEvmAddress(METRO_MINT);
/** Dual-path profile (RH + SOL adapters; only one family active per mint). */
export const dualChain: DualChainProfile = getDualChainProfile({
  mint: METRO_MINT,
  cluster: METRO_CLUSTER,
  mainnetArmed: METRO_MAINNET_ARMED,
});
export const metroIsRobinhood = dualChain.family === "robinhood";
export const metroIsSolana = dualChain.family === "solana";

export interface MetroStatus {
  enabled: boolean;
  cluster: MetroCluster;
  mint: string;
  chain: "robinhood" | "evm" | "solana" | "off";
  chainId: number | null;
  networkName: string;
  mainnetArmed: boolean;
  mainnetLive: boolean;
  /** Dual-path metadata for UI / debug. */
  dual: DualChainProfile;
  summary: string;
}

export function getMetroStatus(): MetroStatus {
  const dual = getDualChainProfile({
    mint: METRO_MINT,
    cluster: METRO_CLUSTER,
    mainnetArmed: METRO_MAINNET_ARMED,
  });
  const rh = activeRobinhoodNetwork();
  let chain: MetroStatus["chain"] = dual.family === "off" ? "off" : dual.family === "solana" ? "solana" : "robinhood";
  if (dual.family === "robinhood" && !rh && metroIsEvm) chain = "evm";
  return {
    enabled: dual.family !== "off" && dual.mint.length > 0,
    cluster: METRO_CLUSTER,
    mint: METRO_MINT,
    chain,
    chainId: dual.chainId ?? metroChainId(),
    networkName: dual.label,
    mainnetArmed: METRO_MAINNET_ARMED,
    mainnetLive: dual.mainnet && dual.mainnetArmed && dual.family !== "off",
    dual,
    summary: dualChainSummary(dual),
  };
}

// ── Token framing (Solana SPL primary; 1% dev seed + player deposits) ──────────
// Fixed 1B human units. Cash-out pool = 1% seed + deposits − withdrawals.
// USD price floats with the market; game math is in $METRO + credits.
export const METRO_TOTAL_SUPPLY = POLICY_SUPPLY;
/** Soft design budget for lifetime earn rates (not a second on-chain allocation). */
export const METRO_P2E_POOL = METRO_P2E_DESIGN_POOL;
export const METRO_MAX_PLAYERS = TARGET_PLAYERS;
export const METRO_PER_PLAYER_BUDGET = METRO_PER_PLAYER_LIFETIME_BUDGET;
export const METRO_DEV_SEED = METRO_DEV_SEED_METRO;

/** Healthy-phase bridge rates (live panel may show stress-adjusted values from /metro/pool). */
export const METRO_DEPOSIT_CREDITS = BASE_DEPOSIT_CREDITS;
export const METRO_WITHDRAW_CREDITS = BASE_WITHDRAW_CREDITS;
export const METRO_MIN_WITHDRAW_CREDITS = BASE_MIN_WITHDRAW_CREDITS;

export function fmtMetro(n: number): string {
  const strip = (s: string) => s.replace(/\.?0+$/, "");
  if (n >= 1_000_000) return strip((n / 1_000_000).toFixed(2)) + "M";
  if (n >= 1_000) return strip((n / 1_000).toFixed(1)) + "k";
  return strip(n.toFixed(2));
}

export interface BridgeResult {
  ok: boolean;
  reason?: string;
  ref?: string;
}

export interface MetroBridge {
  readonly enabled: boolean;
  balanceOf(owner: string): Promise<number>;
  withdraw(owner: string, credits: number): Promise<BridgeResult>;
  deposit(owner: string, metro: number): Promise<BridgeResult>;
}

export const disabledBridge: MetroBridge = {
  enabled: false,
  async balanceOf() {
    return 0;
  },
  async withdraw() {
    return { ok: false, reason: "metro layer disabled" };
  },
  async deposit() {
    return { ok: false, reason: "metro layer disabled" };
  },
};

export function getMetroBridge(): MetroBridge {
  return disabledBridge;
}

// re-export for callers that need network add params
export { robinhoodNetwork, ROBINHOOD_MAINNET, ROBINHOOD_TESTNET };
export { getDualChainProfile, dualChainSummary, settlementForce } from "./chainProfile";
export { solanaNetwork, SOLANA_DEVNET, SOLANA_MAINNET, isSolanaPubkey } from "./solanaChain";
