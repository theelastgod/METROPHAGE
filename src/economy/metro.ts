// METROPHAGE — $METRO on-chain layer gate (Phase 5).
//
// AUTHORITATIVE: Solana SPL mint (base58, pump.fun CA) — Phantom / Solflare / Backpack.
// Empty mint → pure off-chain credits (awaiting CA). Real-value settlement also needs METRO_MAINNET_ARMED.
// Go-live: VITE_METRO_MINT (base58) + server METRO_MINT + METRO_TREASURY_SECRET + MAINNET_ARMED=1.

import { type RobinhoodCluster } from "./robinhoodChain";
import { getDualChainProfile, dualChainSummary, type DualChainProfile } from "./chainProfile";
import {
  parseSolanaCluster,
  solanaNetwork,
  type SolanaCluster,
  isSolanaPubkey,
} from "./solanaChain";
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

/** The $METRO mint (pump.fun CA). Empty string = layer off. Never fold case. */
export const METRO_MINT = env.VITE_METRO_MINT ?? "";

export type MetroCluster = SolanaCluster | "robinhood" | "robinhood-testnet" | "sepolia" | "custom";

function parseCluster(): MetroCluster {
  const c = (env.VITE_METRO_CLUSTER || "").toLowerCase().trim();
  if (c === "robinhood" || c === "rh" || c === "rh-mainnet") return parseSolanaCluster("mainnet-beta");
  if (c === "robinhood-testnet" || c === "rh-testnet" || c === "testnet") return "devnet";
  if (c === "sepolia" || c === "custom") return c;
  return parseSolanaCluster(c);
}

export const METRO_CLUSTER: MetroCluster = parseCluster();

export const METRO_MAINNET_ARMED = env.VITE_METRO_MAINNET_ARMED === "1";

export function metroApiBase(): string {
  const ws = env.VITE_SERVER_URL ?? "ws://127.0.0.1:8787/ws";
  return ws.replace(/^ws/, "http").replace(/\/ws$/, "");
}

export function isEvmAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test((s || "").trim());
}

/** Leftover export for unused ERC-20 helpers. */
export function activeRobinhoodNetwork() {
  return null;
}

export function metroChainId(): number | null {
  return null;
}

export function metroRpc(): string {
  if (env.VITE_METRO_RPC) return env.VITE_METRO_RPC;
  const cluster: SolanaCluster = METRO_CLUSTER === "devnet" ? "devnet" : "mainnet-beta";
  return solanaNetwork(cluster).rpcUrl;
}

/** Leftover export for unused WalletConnect EVM helpers. */
export function metroRobinhoodCluster(): RobinhoodCluster {
  return METRO_CLUSTER === "devnet" ? "robinhood-testnet" : "robinhood";
}

export function isValidMetroMint(s: string): boolean {
  return isSolanaPubkey(s);
}

export const metroEnabled = isValidMetroMint(METRO_MINT);
export const metroIsEvm = false;
export const dualChain: DualChainProfile = getDualChainProfile({
  mint: METRO_MINT,
  cluster: typeof METRO_CLUSTER === "string" ? METRO_CLUSTER : "",
  mainnetArmed: METRO_MAINNET_ARMED,
});
export const metroIsSolana = dualChain.family === "solana";
export const metroIsRobinhood = false;

export interface MetroStatus {
  enabled: boolean;
  cluster: MetroCluster;
  mint: string;
  chain: "solana" | "off";
  chainId: number | null;
  networkName: string;
  mainnetArmed: boolean;
  mainnetLive: boolean;
  dual: DualChainProfile;
  summary: string;
}

export function getMetroStatus(): MetroStatus {
  const dual = getDualChainProfile({
    mint: METRO_MINT,
    cluster: typeof METRO_CLUSTER === "string" ? METRO_CLUSTER : "",
    mainnetArmed: METRO_MAINNET_ARMED,
  });
  return {
    enabled: dual.family !== "off" && dual.mint.length > 0,
    cluster: METRO_CLUSTER,
    mint: METRO_MINT,
    chain: dual.family === "solana" ? "solana" : "off",
    chainId: null,
    networkName: dual.label,
    mainnetArmed: METRO_MAINNET_ARMED,
    mainnetLive: dual.mainnet && dual.mainnetArmed && dual.family !== "off",
    dual,
    summary: dualChainSummary(dual),
  };
}

export const METRO_TOTAL_SUPPLY = POLICY_SUPPLY;
export const METRO_P2E_POOL = METRO_P2E_DESIGN_POOL;
export const METRO_MAX_PLAYERS = TARGET_PLAYERS;
export const METRO_PER_PLAYER_BUDGET = METRO_PER_PLAYER_LIFETIME_BUDGET;
export const METRO_DEV_SEED = METRO_DEV_SEED_METRO;

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

export { getDualChainProfile, dualChainSummary, settlementForce } from "./chainProfile";
export { solanaNetwork } from "./solanaChain";
