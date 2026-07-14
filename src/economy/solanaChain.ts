// METROPHAGE — Solana settlement networks for $METRO (SPL mint path).
// Parallel to robinhoodChain.ts. Used when the mint CA is base58 (not 0x…).
//
// Until a CA exists, this module is a dormant alternate. Flip live by setting:
//   VITE_METRO_MINT=<base58 mint>
//   VITE_METRO_CLUSTER=devnet | mainnet-beta
//   VITE_METRO_RPC=https://api.devnet.solana.com (or your RPC)
// Server: METRO_MINT, METRO_TREASURY_SECRET (base64 64-byte keypair), METRO_RPC.
// Mainnet still requires METRO_MAINNET_ARMED / VITE_METRO_MAINNET_ARMED.

export interface SolanaNetworkDef {
  id: "devnet" | "mainnet-beta";
  name: string;
  /** JSON-RPC endpoint. */
  rpcUrl: string;
  /** Explorer base (tx/account links). */
  explorerUrl: string;
  /** True only for mainnet-beta (counsel-gated for real-value $METRO). */
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

export function solanaNetwork(cluster: SolanaCluster = "devnet"): SolanaNetworkDef {
  return cluster === "mainnet-beta" ? SOLANA_MAINNET : SOLANA_DEVNET;
}

/** Rough shape check for SPL mints / Solana pubkeys (base58, 32-byte payload). */
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function isSolanaPubkey(s: string): boolean {
  const a = (s || "").trim();
  if (a.length < 32 || a.length > 44) return false;
  if (a.startsWith("0x") || a.startsWith("0X")) return false;
  const bytes: number[] = [0];
  for (const ch of a) {
    const v = BASE58.indexOf(ch);
    if (v < 0) return false;
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
  for (let i = 0; i < a.length && a[i] === "1"; i++) bytes.push(0);
  return bytes.length === 32;
}

export function solanaExplorerTx(net: SolanaNetworkDef, sig: string): string {
  const base = net.explorerUrl.replace(/\?.*$/, "");
  const q = net.id === "devnet" ? "?cluster=devnet" : "";
  return `${base}/tx/${sig}${q}`;
}
