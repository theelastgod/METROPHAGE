import { verifyMessage, getAddress } from "ethers";
import { loginMessage, retireMessage } from "../../src/net/protocol";

// METROPHAGE wallet sign-in (EVM-only build).
//
// Supports MetaMask / WalletConnect / any EVM wallet — EIP-191 personal_sign over
// loginMessage (secp256k1, hex 0x sig). The Solana ed25519 verifier lives on the
// `settlement/solana` branch.
//
// Canonical player id is always "w:<checksummed 0x address>".

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

    // EVM only. (Non-0x wallets — e.g. base58 — are rejected outright on this build.)
    if (!isEvmWallet(wallet)) return null;
    if (!isEvmSig(sig) && !sig.startsWith("0x")) return null;
    return verifyEvmLogin(wallet, sig, p.ts, now, msgFor);
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
    return null;
  } catch {
    return null;
  }
}
