// METROPHAGE — $METRO on-chain layer gate (Phase 5).
//
// SINGLE SOURCE OF TRUTH for whether the on-chain layer is live. Empty by default:
// the whole game runs on the off-chain, server-authoritative soft currency (`credits`)
// with NO crypto. Point VITE_METRO_MINT at a real SPL mint (devnet first) and the
// layer wakes up — by construction nothing on-chain can activate before there is an
// address to point at.
//
// P2E architecture note (read before extending this):
//   Gameplay currency STAYS the off-chain authoritative ledger — you cannot run a
//   20 Hz authoritative loop on-chain (per-tx signatures, gas, ~100ms–seconds of
//   latency). "$METRO as a P2E currency" therefore means a server-mediated BRIDGE
//   that converts the off-chain balance to/from the tradeable token at explicit
//   deposit / withdraw moments. That convertibility is the load-bearing P2E element.
//   The server authorizes every withdraw (Phase 4 authority — the client never mints
//   or decides a balance); the chain only SETTLES what the server already authorized.
//
// Safety rails encoded here:
//   - empty mint            → `metroEnabled === false` → pure off-chain game.
//   - cluster defaults to devnet; mainnet is never implicit.
//   - real-value mainnet additionally requires METRO_MAINNET_ARMED — a stray or
//     mistaken mint can never silently move real money. Stays disarmed until a
//     deliberate, post-counsel switch.

/** Safe on the Vite client and the Workers server bundle (no import.meta.env there —
 * read through a cast so the server tsconfig, which lacks vite/client types, stays green). */
const env: Record<string, string | undefined> =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env) ||
  {};

/** The $METRO SPL mint address (the "CA"). Empty string = layer off. */
export const METRO_MINT = env.VITE_METRO_MINT ?? "";

export type MetroCluster = "devnet" | "mainnet-beta";
/** Target cluster. Devnet unless explicitly set to mainnet-beta. */
export const METRO_CLUSTER: MetroCluster = env.VITE_METRO_CLUSTER === "mainnet-beta" ? "mainnet-beta" : "devnet";

/** Real-value mainnet requires this explicit arm flag (post-counsel). 1 = armed. */
export const METRO_MAINNET_ARMED = env.VITE_METRO_MAINNET_ARMED === "1";

/** HTTP base for the server bridge endpoints (`/metro/*`), derived from the WS server URL. */
export function metroApiBase(): string {
  const ws = env.VITE_SERVER_URL ?? "ws://127.0.0.1:8787/ws";
  return ws.replace(/^ws/, "http").replace(/\/ws$/, "");
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Decode a base58 string to bytes (no deps). Returns null on any invalid character. */
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
  for (let i = 0; i < s.length && s[i] === "1"; i++) bytes.push(0); // leading zeros
  return bytes.reverse();
}

/**
 * A valid Solana mint is a base58 string that decodes to exactly 32 bytes. (When the
 * wallet increment adds `@solana/web3.js`, this can be tightened to
 * `PublicKey.isOnCurve` — but a correct 32-byte base58 check already rejects a
 * fat-fingered CA on launch day, which is what matters here.)
 */
export function isValidSolanaMint(s: string): boolean {
  if (!s || s.length < 32 || s.length > 44) return false;
  const bytes = base58Decode(s);
  return bytes != null && bytes.length === 32;
}

/** THE gate. Every on-chain feature branches on this; false → the game is pure off-chain. */
export const metroEnabled = isValidSolanaMint(METRO_MINT);

export interface MetroStatus {
  enabled: boolean;
  cluster: MetroCluster;
  mint: string;
  mainnetArmed: boolean;
  /** true only when a real-value mainnet path is fully armed (valid mint + cluster + arm flag). */
  mainnetLive: boolean;
}

/** Snapshot of the gate state, for boot logging / UI / ops. */
export function getMetroStatus(): MetroStatus {
  return {
    enabled: metroEnabled,
    cluster: METRO_CLUSTER,
    mint: METRO_MINT,
    mainnetArmed: METRO_MAINNET_ARMED,
    mainnetLive: metroEnabled && METRO_CLUSTER === "mainnet-beta" && METRO_MAINNET_ARMED,
  };
}

// ── $METRO token economics (pump.fun fixed-supply model) ────────────────────
// $METRO launches like a standard pump.fun token: a FIXED 1,000,000,000 supply (mint
// authority revoked). It is therefore SCARCE and shared across every player who will
// ever play — so in-game amounts are sized against SUPPLY ÷ PLAYER BASE, never a dollar
// figure. We reserve a play-to-earn pool from the supply and divide it by the most
// players the game could ever plausibly have; that yields a per-player lifetime budget,
// and every price + payout is a fraction of it. (At the pump.fun launch the whole supply
// is only worth a few thousand dollars, so a token is a few millionths of a cent —
// context for *why* amounts are small, but no dollar value is ever shown in-game.)
export const METRO_TOTAL_SUPPLY = 1_000_000_000; // 1B, fixed
/** Share of supply reserved for play-to-earn rewards (rest = market float / DEX liquidity). */
export const METRO_P2E_POOL = 250_000_000; // 25% of supply
/** The most players the game could ever plausibly have, across its whole lifetime. */
export const METRO_MAX_PLAYERS = 100_000;
/** Per-player lifetime $METRO budget = pool ÷ max players. Every price + payout derives from this. */
export const METRO_PER_PLAYER_BUDGET = Math.round(METRO_P2E_POOL / METRO_MAX_PLAYERS); // = 2,500

/** Compact amount formatter: 2_500 → "2.5k", 800 → "800", 1_000_000 → "1M". */
export function fmtMetro(n: number): string {
  const strip = (s: string) => s.replace(/\.?0+$/, "");
  if (n >= 1_000_000) return strip((n / 1_000_000).toFixed(2)) + "M";
  if (n >= 1_000) return strip((n / 1_000).toFixed(1)) + "k";
  return String(Math.round(n));
}

// ── P2E bridge seam (dormant) ──────────────────────────────────────────────
// The off-chain authoritative ledger (server `credits`) is the live currency. The
// bridge converts it to/from $METRO. Defined here as an interface + a safe disabled
// implementation so the rest of the game can reference withdraw/deposit/balance
// without any chain code. The real (devnet) implementation lands in the wallet
// increment; mainnet stays gated behind METRO_MAINNET_ARMED.

export interface BridgeResult {
  ok: boolean;
  reason?: string;
  /** opaque on-chain reference (e.g. tx signature) when a settlement actually happens. */
  ref?: string;
}

export interface MetroBridge {
  readonly enabled: boolean;
  /** On-chain $METRO balance for a connected wallet (0 when disabled). */
  balanceOf(owner: string): Promise<number>;
  /** Off-chain credits → on-chain $METRO. Server-authorized; the client never mints. */
  withdraw(owner: string, credits: number): Promise<BridgeResult>;
  /** On-chain $METRO → off-chain credits, after the deposit is verified on-chain. */
  deposit(owner: string, metro: number): Promise<BridgeResult>;
}

/** The default bridge while the layer is off — every operation is a safe no-op. */
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

/**
 * Resolve the active bridge. Until the devnet wallet increment lands (and, for
 * mainnet, counsel sign-off), this always returns the disabled bridge — so no chain
 * code runs and the game is unaffected.
 */
export function getMetroBridge(): MetroBridge {
  // increment 2 (devnet): `if (metroEnabled) return new SolanaMetroBridge(...)`.
  return disabledBridge;
}
