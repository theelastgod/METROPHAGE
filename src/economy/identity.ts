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

/** Sign a fresh wallet proof for HTTP identity checks. */
export async function signIdentityProof(): Promise<{ wallet: string; sig: string; ts: number } | null> {
  let wallet = connectedWallet();
  if (!wallet) wallet = await connectWallet();
  if (!wallet) return null;
  const ts = Date.now();
  const signed = await signWalletLogin(loginMessage(wallet, ts));
  if (!signed) return null;
  return { wallet: signed.address, sig: signed.signature, ts };
}

/** Query the server for this wallet's locked character (one-time creation). */
export async function fetchWalletIdentity(proof: { wallet: string; sig: string; ts: number }): Promise<WalletIdentity | null> {
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
    if (!j.ok || !j.id) return null;
    return {
      wallet: proof.wallet,
      playerId: j.id,
      name: j.name ?? null,
      look: j.look ?? null,
      locked: !!j.locked,
    };
  } catch {
    return null;
  }
}

export function hasWalletProvider(): boolean {
  return walletAvailable();
}