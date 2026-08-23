import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { verifyMessage, getAddress } from "ethers";
import { loginMessage, retireMessage } from "../../src/net/protocol";

// METROPHAGE wallet sign-in.
//
// Live path: Solana ed25519 over loginMessage (base58 wallet + sig).
// EVM EIP-191 is kept only so leftover 0x proofs still verify until settlement cutover.

const FRESH_MS = 120_000; // ±2 min of server clock

export interface WalletProof {
  wallet: string;
  sig: string;
  ts: number;
}

function isEvmWallet(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test((s || "").trim());
}

function isEvmSig(s: string): boolean {
  return /^0x[a-fA-F0-9]{130}$/.test((s || "").trim());
}

type MessageFor = (wallet: string, ts: number) => string;

function verifyEvmLogin(wallet: string, sig: string, ts: number, now: number, msgFor: MessageFor): string | null {
  try {
    if (Math.abs(now - ts) > FRESH_MS) return null;
    const msg = msgFor(wallet, ts);
    const recovered = verifyMessage(msg, sig);
    if (recovered.toLowerCase() !== wallet.toLowerCase()) {
      const checksum = getAddress(wallet);
      const msg2 = msgFor(checksum, ts);
      const recovered2 = verifyMessage(msg2, sig);
      if (recovered2.toLowerCase() !== wallet.toLowerCase()) return null;
      return "w:" + getAddress(recovered2);
    }
    return "w:" + getAddress(recovered);
  } catch {
    return null;
  }
}

function verifySolanaLogin(wallet: string, sig: string, ts: number, now: number, msgFor: MessageFor): string | null {
  try {
    if (Math.abs(now - ts) > FRESH_MS) return null;
    const pub = bs58.decode(wallet);
    const signature = bs58.decode(sig);
    if (pub.length !== 32 || signature.length !== 64) return null;
    const msg = new TextEncoder().encode(msgFor(wallet, ts));
    if (!ed25519.verify(signature, msg, pub)) return null;
    return "w:" + wallet;
  } catch {
    return null;
  }
}

export function verifyWalletLogin(p: WalletProof, now = Date.now()): string | null {
  return verifyWalletAction(p, loginMessage, now);
}

/**
 * Verify a signature over a SPECIFIC intent. Returns "w:<wallet>" or null.
 *
 * Login proofs are deliberately reusable (the client resends one for ~90s of zone
 * hops) and have travelled in URL query strings, so they end up in access logs.
 * Anything irreversible must therefore demand its own signed text rather than
 * accept a login proof — see retireMessage.
 */
export function verifyWalletAction(p: WalletProof, msgFor: MessageFor, now = Date.now()): string | null {
  try {
    if (!p || typeof p.wallet !== "string" || typeof p.sig !== "string" || !Number.isFinite(p.ts)) {
      return null;
    }
    const wallet = p.wallet.trim();
    const sig = p.sig.trim();

    if (isEvmWallet(wallet) || isEvmSig(sig)) {
      if (!isEvmWallet(wallet)) return null;
      return verifyEvmLogin(wallet, sig, p.ts, now, msgFor);
    }

    return verifySolanaLogin(wallet, sig, p.ts, now, msgFor);
  } catch {
    return null;
  }
}

export function verifyWalletRetire(p: WalletProof, now = Date.now()): string | null {
  return verifyWalletAction(p, retireMessage, now);
}

/** Canonical player id without verifying a signature (device-session resume). */
export function walletPlayerId(wallet: string): string | null {
  try {
    const w = (wallet || "").trim();
    if (!w) return null;
    if (isEvmWallet(w)) return "w:" + getAddress(w);
    if (w.length >= 32 && w.length <= 44 && !w.startsWith("0x") && !w.startsWith("0X")) {
      return "w:" + w;
    }
    return null;
  } catch {
    return null;
  }
}
