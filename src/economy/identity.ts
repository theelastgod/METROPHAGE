import { loginMessage, type PlayerLook } from "../net/protocol";
import { connectWallet, connectedWallet, signWalletLogin, walletAvailable } from "./wallet";

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

/** Connect wallet (if needed) — does not sign or hit the server. Prefers MetaMask. */
export async function ensureWalletConnected(): Promise<string | null> {
  const existing = connectedWallet();
  if (existing) return existing;
  if (!walletAvailable()) return null;
  return connectWallet();
}

/** Full MetaMask sign-up: connect + sign login message (proof for /identity and WS). */
export async function metaMaskSignUp(): Promise<
  | { ok: true; proof: { wallet: string; sig: string; ts: number } }
  | { ok: false; error: IdentityError; detail?: string }
> {
  if (!walletAvailable()) return { ok: false, error: "no_wallet", detail: "Install MetaMask" };
  const addr = await ensureWalletConnected();
  if (!addr) return { ok: false, error: "connect_failed", detail: "MetaMask connection cancelled" };
  const proof = await signIdentityProof(addr);
  if (!proof) return { ok: false, error: "sign_failed", detail: "MetaMask signature cancelled" };
  return { ok: true, proof };
}

export function hasWalletProvider(): boolean {
  return walletAvailable();
}