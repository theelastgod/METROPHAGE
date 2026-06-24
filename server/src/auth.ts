import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { loginMessage } from "../../src/net/protocol";

// METROPHAGE wallet sign-in. Identity is a Solana wallet address, proven by an ed25519
// signature over a fresh, timestamped message (the same string the client signs, from
// protocol.loginMessage). Stateless — no server-side nonce store (awkward across a
// hibernating/sharded DO); the timestamp freshness window bounds replay instead. The
// canonical player id becomes "w:<wallet>", so all persistence keys off the wallet.

const FRESH_MS = 120_000; // a signed login is valid within ±2 min of the server clock

export interface WalletProof {
  wallet: string; // base58 Solana address (= ed25519 public key)
  sig: string; // base58 ed25519 signature over loginMessage(wallet, ts)
  ts: number; // epoch ms the client signed at
}

/**
 * Verify a signed wallet login. Returns the canonical player id ("w:<wallet>") on
 * success, or null on any failure (bad shape, stale timestamp, bad signature). Never
 * throws — a malformed proof is just a rejection.
 */
export function verifyWalletLogin(p: WalletProof, now = Date.now()): string | null {
  try {
    if (!p || typeof p.wallet !== "string" || typeof p.sig !== "string" || !Number.isFinite(p.ts)) {
      return null;
    }
    if (Math.abs(now - p.ts) > FRESH_MS) return null; // stale or future-dated → replay guard
    const pub = bs58.decode(p.wallet);
    const sig = bs58.decode(p.sig);
    if (pub.length !== 32 || sig.length !== 64) return null;
    const msg = new TextEncoder().encode(loginMessage(p.wallet, p.ts));
    if (!ed25519.verify(sig, msg, pub)) return null;
    return "w:" + p.wallet;
  } catch {
    return null;
  }
}
