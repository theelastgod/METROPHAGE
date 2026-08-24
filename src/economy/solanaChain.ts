// Solana networks for identity chrome and (later) SPL $METRO.
// Cluster is independent of leftover Robinhood settlement until PR3.

import bs58 from "bs58";

export interface SolanaNetworkDef {
  id: "devnet" | "mainnet-beta";
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  mainnet: boolean;
}

export const SOLANA_DEVNET: SolanaNetworkDef = {
  id: "devnet",
  name: "Solana Devnet",
  rpcUrl: "https://api.devnet.solana.com",
  explorerUrl: "https://explorer.solana.com/?cluster=devnet",
  mainnet: false,
};

export const SOLANA_MAINNET: SolanaNetworkDef = {
  id: "mainnet-beta",
  name: "Solana Mainnet",
  rpcUrl: "https://api.mainnet-beta.solana.com",
  explorerUrl: "https://explorer.solana.com",
  mainnet: true,
};

export type SolanaCluster = "devnet" | "mainnet-beta";

const env: Record<string, string | undefined> =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env) ||
  {};

/** Identity chrome + Phantom handshake. Leftover Robinhood env maps onto Solana clusters. */
export function parseSolanaCluster(raw?: string): SolanaCluster {
  const c = (raw ?? env.VITE_METRO_CLUSTER ?? "").trim().toLowerCase();
  if (c === "mainnet-beta" || c === "mainnet" || c === "robinhood") return "mainnet-beta";
  if (c === "devnet" || c === "testnet" || c === "robinhood-testnet") return "devnet";
  if (!c) return "mainnet-beta";
  return "devnet";
}

export const SOLANA_CLUSTER: SolanaCluster = parseSolanaCluster();

export function solanaNetwork(cluster: SolanaCluster = SOLANA_CLUSTER): SolanaNetworkDef {
  return cluster === "mainnet-beta" ? SOLANA_MAINNET : SOLANA_DEVNET;
}

/** HUD chip: `SOL · DEVNET` / `SOL · MAINNET`. */
export function solanaChromeLabel(cluster: SolanaCluster = SOLANA_CLUSTER): string {
  return solanaNetwork(cluster).mainnet ? "SOL · MAINNET" : "SOL · DEVNET";
}

/** 32-byte Ed25519 public key as base58. Rejects 0x. */
export function isSolanaPubkey(s: string): boolean {
  const a = (s || "").trim();
  if (a.length < 32 || a.length > 44) return false;
  if (a.startsWith("0x") || a.startsWith("0X")) return false;
  try {
    return bs58.decode(a).length === 32;
  } catch {
    return false;
  }
}

/** Player-facing `4…4` (never `w:` prefix, never 0x as a live id). */
export function shortSolanaAddress(addr: string | null | undefined): string {
  if (!addr) return "";
  let a = addr.trim();
  if (a.toLowerCase().startsWith("w:")) a = a.slice(2).trim();
  if (!a || /^0x/i.test(a)) return "";
  return a.length > 8 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export function solanaExplorerTx(net: SolanaNetworkDef, sig: string): string {
  const base = net.explorerUrl.replace(/\?.*$/, "").replace(/\/+$/, "");
  const q = net.id === "devnet" ? "?cluster=devnet" : "";
  return `${base}/tx/${sig}${q}`;
}
