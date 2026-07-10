// METROPHAGE — $METRO on-chain layer gate (Phase 5).
//
// SINGLE SOURCE OF TRUTH for whether the on-chain layer is live. Empty by default:
// the whole game runs on the off-chain, server-authoritative soft currency (`credits`)
// with NO crypto. Point VITE_METRO_MINT at a real ERC-20 (0x…) or legacy Solana mint
// and the layer wakes up.
//
// Preferred path: Ethereum ERC-20. Solana SPL remains supported for existing mints.
// Mainnet requires METRO_MAINNET_ARMED (counsel gate).

const env: Record<string, string | undefined> =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env) ||
  {};

/** The $METRO mint / ERC-20 contract (the "CA"). Empty string = layer off. */
export const METRO_MINT = env.VITE_METRO_MINT ?? "";

export type MetroCluster = "sepolia" | "mainnet" | "devnet" | "mainnet-beta" | "custom";

/** Target cluster / network. Defaults sepolia for EVM mints, devnet for Solana. */
export const METRO_CLUSTER: MetroCluster = (() => {
  const c = (env.VITE_METRO_CLUSTER || "").toLowerCase();
  if (c === "mainnet" || c === "mainnet-beta") return c === "mainnet-beta" ? "mainnet-beta" : "mainnet";
  if (c === "sepolia" || c === "devnet" || c === "custom") return c as MetroCluster;
  return isEvmAddress(METRO_MINT) ? "sepolia" : "devnet";
})();

export const METRO_MAINNET_ARMED = env.VITE_METRO_MAINNET_ARMED === "1";

export function metroApiBase(): string {
  const ws = env.VITE_SERVER_URL ?? "ws://127.0.0.1:8787/ws";
  return ws.replace(/^ws/, "http").replace(/\/ws$/, "");
}

export function metroRpc(): string {
  if (env.VITE_METRO_RPC) return env.VITE_METRO_RPC;
  if (isEvmAddress(METRO_MINT)) {
    return METRO_CLUSTER === "mainnet" || METRO_CLUSTER === "mainnet-beta"
      ? "https://ethereum-rpc.publicnode.com"
      : "https://ethereum-sepolia-rpc.publicnode.com";
  }
  return METRO_CLUSTER === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com";
}

export function isEvmAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test((s || "").trim());
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
  if (!s || s.length < 32 || s.length > 44) return false;
  const bytes = base58Decode(s);
  return bytes != null && bytes.length === 32;
}

/** Gate: ERC-20 0x address or Solana mint. */
export function isValidMetroMint(s: string): boolean {
  return isEvmAddress(s) || isValidSolanaMint(s);
}

export const metroEnabled = isValidMetroMint(METRO_MINT);
export const metroIsEvm = isEvmAddress(METRO_MINT);

export interface MetroStatus {
  enabled: boolean;
  cluster: MetroCluster;
  mint: string;
  chain: "evm" | "solana" | "off";
  mainnetArmed: boolean;
  mainnetLive: boolean;
}

export function getMetroStatus(): MetroStatus {
  const chain = !metroEnabled ? "off" : metroIsEvm ? "evm" : "solana";
  const mainnetCluster = METRO_CLUSTER === "mainnet" || METRO_CLUSTER === "mainnet-beta";
  return {
    enabled: metroEnabled,
    cluster: METRO_CLUSTER,
    mint: METRO_MINT,
    chain,
    mainnetArmed: METRO_MAINNET_ARMED,
    mainnetLive: metroEnabled && mainnetCluster && METRO_MAINNET_ARMED,
  };
}

export const METRO_TOTAL_SUPPLY = 1_000_000_000;
export const METRO_P2E_POOL = 250_000_000;
export const METRO_MAX_PLAYERS = 100_000;
export const METRO_PER_PLAYER_BUDGET = Math.round(METRO_P2E_POOL / METRO_MAX_PLAYERS);

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
