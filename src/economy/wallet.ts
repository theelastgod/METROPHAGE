// METROPHAGE — minimal Solana wallet connector (Phase 5 · 2c).
//
// Uses the injected provider that Phantom / Backpack / Glow expose as `window.solana`
// (Solflare via `window.solflare`). NO dependencies — the wallet itself signs; heavier
// on-chain reads / tx-building (balance, deposit transfers) are lazy-loaded later
// (2c-2, once a devnet mint exists). Keeps @solana/web3.js out of the game bundle.

interface InjectedProvider {
  publicKey?: { toString(): string } | null;
  isConnected?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  signMessage?(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array }>;
}

function getProvider(): InjectedProvider | null {
  const w = window as unknown as { solana?: InjectedProvider; phantom?: { solana?: InjectedProvider }; solflare?: InjectedProvider };
  return w.solana ?? w.phantom?.solana ?? w.solflare ?? null;
}

/** Is any injected Solana wallet present? */
export function walletAvailable(): boolean {
  return !!getProvider();
}

/** Currently connected address (base58), or null. */
export function connectedWallet(): string | null {
  const p = getProvider();
  return p?.isConnected && p.publicKey ? p.publicKey.toString() : null;
}

/** Prompt the user to connect; resolves to the address or null on cancel/no-wallet. */
export async function connectWallet(): Promise<string | null> {
  const p = getProvider();
  if (!p) return null;
  try {
    const res = await p.connect();
    return res.publicKey.toString();
  } catch {
    return null; // user rejected
  }
}

export async function disconnectWallet(): Promise<void> {
  try {
    await getProvider()?.disconnect();
  } catch {
    /* ignore */
  }
}

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Dependency-free base58 (Bitcoin/Solana alphabet) — keeps bs58 out of the game bundle.
 *  Leading zero bytes map to leading '1's; the remaining bytes are a base-256→58 bignum. */
function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      const x = digits[j] * 256 + carry;
      digits[j] = x % 58;
      carry = (x / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) str += B58_ALPHABET[digits[i]];
  return str;
}

/**
 * Sign the online-login message with the connected wallet, proving identity. Returns the
 * address (base58) + an ed25519 signature (base58, what the server's bs58.decode expects),
 * or null if there's no signing wallet / the user declines.
 */
export async function signWalletLogin(message: string): Promise<{ address: string; signature: string } | null> {
  const p = getProvider();
  if (!p?.signMessage || !p.publicKey) return null;
  try {
    const { signature } = await p.signMessage(new TextEncoder().encode(message), "utf8");
    return { address: p.publicKey.toString(), signature: base58Encode(signature) };
  } catch {
    return null; // user declined
  }
}

/**
 * Sign-In-With-Solana: sign a server nonce to prove wallet ownership. Returned
 * signature is base64. (Server-side verification + binding to the game identity is
 * the auth-hardening step before mainnet — for now this proves the wallet can sign.)
 */
export async function signOwnership(nonce: string): Promise<{ address: string; signature: string } | null> {
  const p = getProvider();
  if (!p?.signMessage || !p.publicKey) return null;
  try {
    const msg = new TextEncoder().encode(`METROPHAGE wallet link\nnonce: ${nonce}`);
    const { signature } = await p.signMessage(msg, "utf8");
    let bin = "";
    for (const b of signature) bin += String.fromCharCode(b);
    return { address: p.publicKey.toString(), signature: btoa(bin) };
  } catch {
    return null;
  }
}
