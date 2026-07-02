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

let lastConnectedAddress: string | null = null;

function getProvider(): InjectedProvider | null {
  const w = window as unknown as {
    solana?: InjectedProvider;
    phantom?: { solana?: InjectedProvider };
    backpack?: { solana?: InjectedProvider };
    solflare?: InjectedProvider;
  };
  // Phantom injects window.phantom.solana; Backpack/Solflare vary — try all common paths.
  return w.phantom?.solana ?? w.solana ?? w.backpack?.solana ?? w.solflare ?? null;
}

/** Is any injected Solana wallet present? */
export function walletAvailable(): boolean {
  return !!getProvider();
}

/** The raw injected provider, loosely typed — for the lazy claim-submission helper
 *  (claim.ts), which needs signAndSendTransaction. Kept opaque here so this file
 *  stays dependency-free. */
export function getInjectedProvider(): unknown {
  return getProvider();
}

/** Currently connected address (base58), or null. */
export function connectedWallet(): string | null {
  const p = getProvider();
  const pk = p?.publicKey?.toString();
  if (pk) {
    lastConnectedAddress = pk;
    return pk;
  }
  // Some wallets expose publicKey only briefly — keep the last successful connect().
  if (p?.isConnected && lastConnectedAddress) return lastConnectedAddress;
  return lastConnectedAddress;
}

/** Prompt the user to connect; resolves to the address or null on cancel/no-wallet. */
export async function connectWallet(): Promise<string | null> {
  const p = getProvider();
  if (!p) return null;
  try {
    const res = await p.connect();
    const addr = res.publicKey.toString();
    lastConnectedAddress = addr;
    return addr;
  } catch {
    return null; // user rejected
  }
}

export async function disconnectWallet(): Promise<void> {
  lastConnectedAddress = null;
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
export async function signWalletLogin(
  message: string,
  address?: string,
): Promise<{ address: string; signature: string } | null> {
  const p = getProvider();
  const addr = address ?? p?.publicKey?.toString() ?? lastConnectedAddress;
  if (!p?.signMessage || !addr) return null;
  const bytes = new TextEncoder().encode(message);
  try {
    // Wallet APIs differ: Phantom accepts (bytes, "utf8"); others want bytes only.
    let signature: Uint8Array;
    try {
      const res = await p.signMessage(bytes, "utf8");
      signature = res.signature;
    } catch {
      const res = await p.signMessage(bytes);
      signature = res.signature;
    }
    return { address: addr, signature: base58Encode(signature) };
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
