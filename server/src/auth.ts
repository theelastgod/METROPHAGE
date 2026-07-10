import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { verifyMessage, getAddress } from "ethers";
import { loginMessage } from "../../src/net/protocol";

// METROPHAGE wallet sign-in.
//
// Supports:
//   • MetaMask / EVM — EIP-191 personal_sign over loginMessage (secp256k1, hex 0x sig)
//   • Solana (Phantom etc.) — ed25519 over the same message (base58 wallet + sig)
//
// Canonical player id is always "w:<address>" (EVM checksummed, Solana as-signed).

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
  // 65-byte signature as 0x + 130 hex chars (r,s,v)
  return /^0x[a-fA-F0-9]{130}$/.test((s || "").trim());
}

/** Verify MetaMask / EVM personal_sign. Returns w:<checksummed> or null. */
function verifyEvmLogin(wallet: string, sig: string, ts: number, now: number): string | null {
  try {
    if (Math.abs(now - ts) > FRESH_MS) return null;
    const msg = loginMessage(wallet, ts);
    // Also try checksum / lowercase variants some wallets embed in the message UI only.
    const recovered = verifyMessage(msg, sig);
    if (recovered.toLowerCase() !== wallet.toLowerCase()) {
      // Client may have signed with checksummed form in the message:
      const checksum = getAddress(wallet);
      const msg2 = loginMessage(checksum, ts);
      const recovered2 = verifyMessage(msg2, sig);
      if (recovered2.toLowerCase() !== wallet.toLowerCase()) return null;
      return "w:" + getAddress(recovered2);
    }
    return "w:" + getAddress(recovered);
  } catch {
    return null;
  }
}

/** Verify Solana ed25519 SIWS. Returns w:<base58> or null. */
function verifySolanaLogin(wallet: string, sig: string, ts: number, now: number): string | null {
  try {
    if (Math.abs(now - ts) > FRESH_MS) return null;
    const pub = bs58.decode(wallet);
    const signature = bs58.decode(sig);
    if (pub.length !== 32 || signature.length !== 64) return null;
    const msg = new TextEncoder().encode(loginMessage(wallet, ts));
    if (!ed25519.verify(signature, msg, pub)) return null;
    return "w:" + wallet;
  } catch {
    return null;
  }
}

/**
 * Verify a signed wallet login. Returns canonical player id ("w:<wallet>") or null.
 * Never throws — malformed proof is rejection.
 */
export function verifyWalletLogin(p: WalletProof, now = Date.now()): string | null {
  try {
    if (!p || typeof p.wallet !== "string" || typeof p.sig !== "string" || !Number.isFinite(p.ts)) {
      return null;
    }
    const wallet = p.wallet.trim();
    const sig = p.sig.trim();

    // Prefer EVM when the address or sig shape is Ethereum.
    if (isEvmWallet(wallet) || isEvmSig(sig)) {
      if (!isEvmWallet(wallet)) return null;
      return verifyEvmLogin(wallet, sig, p.ts, now);
    }

    return verifySolanaLogin(wallet, sig, p.ts, now);
  } catch {
    return null;
  }
}
