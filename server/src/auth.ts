import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { verifyMessage, getAddress } from "ethers";
import { loginMessage, retireMessage } from "../../src/net/protocol";

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

/**
 * Builds the exact text the signature must cover. Scoping this per action is what
 * stops a captured login proof from authorizing a destructive one.
 */
type MessageFor = (wallet: string, ts: number) => string;

/** Verify MetaMask / EVM personal_sign. Returns w:<checksummed> or null. */
function verifyEvmLogin(wallet: string, sig: string, ts: number, now: number, msgFor: MessageFor): string | null {
  try {
    if (Math.abs(now - ts) > FRESH_MS) return null;
    const msg = msgFor(wallet, ts);
    // Also try checksum / lowercase variants some wallets embed in the message UI only.
    const recovered = verifyMessage(msg, sig);
    if (recovered.toLowerCase() !== wallet.toLowerCase()) {
      // Client may have signed with checksummed form in the message:
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

/** Verify Solana ed25519 SIWS. Returns w:<base58> or null. */
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

/**
 * Verify a signed wallet login. Returns canonical player id ("w:<wallet>") or null.
 * Never throws — malformed proof is rejection.
 */
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

    // Prefer EVM when the address or sig shape is Ethereum.
    if (isEvmWallet(wallet) || isEvmSig(sig)) {
      if (!isEvmWallet(wallet)) return null;
      return verifyEvmLogin(wallet, sig, p.ts, now, msgFor);
    }

    return verifySolanaLogin(wallet, sig, p.ts, now, msgFor);
  } catch {
    return null;
  }
}

/** Verify a signature authorizing PERMANENT deletion of a character. */
export function verifyWalletRetire(p: WalletProof, now = Date.now()): string | null {
  return verifyWalletAction(p, retireMessage, now);
}

/**
 * Canonical player id for a wallet address without verifying a signature.
 * Used for device-session resume after the first signed login.
 */
export function walletPlayerId(wallet: string): string | null {
  try {
    const w = (wallet || "").trim();
    if (!w) return null;
    if (isEvmWallet(w)) return "w:" + getAddress(w);
    // Solana base58 addresses are typically 32–44 chars
    if (w.length >= 32 && w.length <= 48 && !w.startsWith("0x")) return "w:" + w;
    return null;
  } catch {
    return null;
  }
}
