import { loginMessage, retireMessage, type PlayerLook } from "../net/protocol";
import {
  connectWallet,
  connectedWallet,
  hasInjectedSolana,
  signWalletLogin,
  walletAvailable,
  walletConnectAvailable,
  connectWalletLabel,
  preferSolanaWallet,
} from "./wallet";
import {
  beginPhantomSign,
  phantomDeeplinkSession,
  phantomDeeplinkUsable,
  takePhantomProof,
} from "./phantomDeeplink";
import { isLikelyMobile } from "./walletConnect";

/** Mobile without an injector but WITH a Phantom deeplink session: signatures must
 *  round-trip through the Phantom app (the page reloads in between). */
function phantomSignRoundTrip(addr: string): boolean {
  return (
    isLikelyMobile() &&
    phantomDeeplinkUsable() &&
    !hasInjectedSolana() &&
    phantomDeeplinkSession()?.wallet === addr
  );
}

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
  // A Phantom app round-trip may have just landed with our signature — use it.
  const landed = takePhantomProof("login", addr);
  if (landed) return landed;
  const ts = Date.now();
  if (phantomSignRoundTrip(addr)) {
    // Page navigates to the Phantom app; the proof is picked up on return.
    beginPhantomSign(loginMessage(addr, ts), { kind: "login", ts, wallet: addr });
    return null;
  }
  const signed = await signWalletLogin(loginMessage(addr, ts), addr);
  if (!signed) return null;
  return { wallet: signed.address, sig: signed.signature, ts };
}

/**
 * Sign a proof authorizing PERMANENT deletion of this wallet's character.
 *
 * Separate from signIdentityProof on purpose. The server will not retire on a
 * login proof (those are reusable and end up in logs), and this also means the
 * wallet actually shows "permanently delete this character" instead of
 * "METROPHAGE login" while asking someone to approve an irreversible purge.
 */
export async function signRetireProof(
  wallet?: string,
): Promise<{ wallet: string; sig: string; ts: number } | null> {
  const addr = wallet ?? connectedWallet();
  if (!addr) return null;
  const landed = takePhantomProof("retire", addr);
  if (landed) return landed;
  const ts = Date.now();
  if (phantomSignRoundTrip(addr)) {
    beginPhantomSign(retireMessage(addr, ts), { kind: "retire", ts, wallet: addr });
    return null;
  }
  const signed = await signWalletLogin(retireMessage(addr, ts), addr);
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

/** Connect Phantom/Solana (if needed) — does not sign or hit the server. */
export async function ensureWalletConnected(): Promise<string | null> {
  const existing = connectedWallet();
  if (existing) return existing;
  // Always attempt connect when any path is available (inject / WC / mobile deep-link).
  if (!walletAvailable()) return null;
  return connectWallet();
}

function noWalletDetail(): string {
  const sol = preferSolanaWallet();
  if (walletConnectAvailable()) {
    return sol
      ? "Open Phantom or Solflare, then approve the connection."
      : "Open the wallet picker, choose MetaMask / Phantom / any WalletConnect wallet, then approve.";
  }
  if (isLikelyMobile()) {
    return sol
      ? "No browser wallet detected. Tap Connect to open Phantom (or install a wallet app), then return."
      : "No browser wallet detected. Tap Connect to open MetaMask (or install a wallet app), then return.";
  }
  return sol
    ? "Install Phantom, Solflare, or another Solana wallet extension — or set VITE_WALLETCONNECT_PROJECT_ID for mobile WalletConnect."
    : "Install MetaMask, Phantom, or another wallet extension — or set VITE_WALLETCONNECT_PROJECT_ID for mobile WalletConnect.";
}

/** Full wallet sign-up: connect + sign login message (proof for /identity and WS). */
export async function walletSignUp(): Promise<
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

/** Backward-compatible symbol for older callers; the live path is Phantom/Solana. */
export const metaMaskSignUp = walletSignUp;

export function hasWalletProvider(): boolean {
  return walletAvailable();
}

export { connectWalletLabel };
