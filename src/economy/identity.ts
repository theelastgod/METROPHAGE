import { loginMessage, type PlayerLook } from "../net/protocol";
import {
  connectWallet,
  connectedWallet,
  signWalletLogin,
  walletAvailable,
  walletConnectAvailable,
  connectWalletLabel,
} from "./wallet";
import { isLikelyMobile } from "./walletConnect";

const HTTP_BASE =
  (import.meta.env as Record<string, string | undefined>).VITE_SERVER_URL?.replace(/^ws/, "http").replace(/\/ws$/, "") ??
  "http://127.0.0.1:8787";

export interface WalletIdentity {
  wallet: string;
  playerId: string;
  name: string | null;
  look: PlayerLook | null;
  locked: boolean;
}

export type IdentityError = "no_wallet" | "connect_failed" | "sign_failed" | "server_unreachable" | "auth_failed" | "unknown";

/** Sign a fresh wallet proof for HTTP identity checks (wallet must already be connected). */
export async function signIdentityProof(
  wallet?: string,
): Promise<{ wallet: string; sig: string; ts: number } | null> {
  const addr = wallet ?? connectedWallet();
  if (!addr) return null;
  const ts = Date.now();
  const signed = await signWalletLogin(loginMessage(addr, ts), addr);
  if (!signed) return null;
  return { wallet: signed.address, sig: signed.signature, ts };
}

export interface IdentityResult {
  identity: WalletIdentity | null;
  error?: IdentityError;
  detail?: string;
}

/** Query the server for this wallet's locked character (one-time creation). */
export async function fetchWalletIdentity(proof: {
  wallet: string;
  sig: string;
  ts: number;
}): Promise<IdentityResult> {
  try {
    const r = await fetch(`${HTTP_BASE}/identity`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(proof),
    });
    const j = (await r.json()) as {
      ok?: boolean;
      id?: string;
      name?: string | null;
      look?: PlayerLook | null;
      locked?: boolean;
      reason?: string;
    };
    if (r.status === 401 || j.reason?.includes("sign-in failed")) {
      return { identity: null, error: "auth_failed", detail: j.reason ?? "signature rejected" };
    }
    if (!j.ok || !j.id) {
      return { identity: null, error: "unknown", detail: j.reason ?? `HTTP ${r.status}` };
    }
    return {
      identity: {
        wallet: proof.wallet,
        playerId: j.id,
        name: j.name ?? null,
        look: j.look ?? null,
        locked: !!j.locked,
      },
    };
  } catch (e) {
    return {
      identity: null,
      error: "server_unreachable",
      detail: String((e as Error)?.message ?? e),
    };
  }
}

/** Connect wallet (if needed) — does not sign or hit the server. EVM-first + WalletConnect. */
export async function ensureWalletConnected(): Promise<string | null> {
  const existing = connectedWallet();
  if (existing) return existing;
  // Always attempt connect when any path is available (inject / WC / mobile deep-link).
  if (!walletAvailable()) return null;
  return connectWallet();
}

function noWalletDetail(): string {
  if (walletConnectAvailable()) {
    return "Open the wallet picker, choose MetaMask / Phantom / any WalletConnect wallet, then approve.";
  }
  if (isLikelyMobile()) {
    return "No browser wallet detected. Tap Connect to open MetaMask (or install a wallet app), then return.";
  }
  return "Install MetaMask, Phantom, or another wallet extension — or set VITE_WALLETCONNECT_PROJECT_ID for mobile WalletConnect.";
}

/** Full wallet sign-up: connect + sign login message (proof for /identity and WS). */
export async function metaMaskSignUp(): Promise<
  | { ok: true; proof: { wallet: string; sig: string; ts: number } }
  | { ok: false; error: IdentityError; detail?: string }
> {
  if (!walletAvailable()) {
    return { ok: false, error: "no_wallet", detail: noWalletDetail() };
  }
  const addr = await ensureWalletConnected();
  if (!addr) {
    return {
      ok: false,
      error: "connect_failed",
      detail: isLikelyMobile() && !walletConnectAvailable()
        ? "Opening your wallet browser… return here after it loads, then tap Connect again."
        : "Wallet connection cancelled",
    };
  }
  const proof = await signIdentityProof(addr);
  if (!proof) return { ok: false, error: "sign_failed", detail: "Wallet signature cancelled" };
  return { ok: true, proof };
}

/** Alias — wallet sign-up (same implementation). */
export const walletSignUp = metaMaskSignUp;

export function hasWalletProvider(): boolean {
  return walletAvailable();
}

export { connectWalletLabel };
