// METROPHAGE — wallet connector for the $METRO bridge.
// Prefers injected Ethereum (MetaMask / Rabby / Coinbase) for ERC-20 $METRO.
// Falls back to Solana injected providers for legacy SPL mints.

interface EvmProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  isMetaMask?: boolean;
}

interface SolanaProvider {
  publicKey?: { toString(): string } | null;
  isConnected?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  signMessage?(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array }>;
}

let lastConnectedAddress: string | null = null;
let lastChain: "evm" | "solana" | null = null;

function getEvm(): EvmProvider | null {
  const w = window as unknown as {
    ethereum?: EvmProvider & { providers?: EvmProvider[]; isMetaMask?: boolean };
  };
  const eth = w.ethereum;
  if (!eth) return null;
  // Multi-injected (MetaMask + Phantom): prefer true MetaMask.
  if (Array.isArray(eth.providers) && eth.providers.length) {
    const mm = eth.providers.find((p) => p.isMetaMask);
    if (mm) return mm;
  }
  return eth;
}

function getSolana(): SolanaProvider | null {
  const w = window as unknown as {
    solana?: SolanaProvider;
    phantom?: { solana?: SolanaProvider };
    backpack?: { solana?: SolanaProvider };
    solflare?: SolanaProvider;
  };
  return w.phantom?.solana ?? w.solana ?? w.backpack?.solana ?? w.solflare ?? null;
}

/** Any injected wallet present (ETH preferred). */
export function walletAvailable(): boolean {
  return !!(getEvm() || getSolana());
}

export function getInjectedProvider(): unknown {
  return getEvm() ?? getSolana();
}

export function connectedWallet(): string | null {
  if (lastConnectedAddress) return lastConnectedAddress;
  return null;
}

export function connectedChain(): "evm" | "solana" | null {
  return lastChain;
}

export async function connectWallet(): Promise<string | null> {
  const eth = getEvm();
  if (eth) {
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const addr = accounts?.[0] ?? null;
      if (addr) {
        lastConnectedAddress = addr;
        lastChain = "evm";
        return addr;
      }
    } catch {
      /* user rejected — try Solana */
    }
  }
  const sol = getSolana();
  if (!sol) return null;
  try {
    const res = await sol.connect();
    const addr = res.publicKey.toString();
    lastConnectedAddress = addr;
    lastChain = "solana";
    return addr;
  } catch {
    return null;
  }
}

export async function disconnectWallet(): Promise<void> {
  lastConnectedAddress = null;
  lastChain = null;
  try {
    await getSolana()?.disconnect();
  } catch {
    /* ignore */
  }
}

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
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
 * Sign the online-login / bridge-auth message.
 * EVM → personal_sign (hex sig 0x…). Solana → ed25519 base58.
 */
export async function signWalletLogin(
  message: string,
  address?: string,
): Promise<{ address: string; signature: string } | null> {
  const eth = getEvm();
  const addr = address ?? lastConnectedAddress;
  if (eth && addr && /^0x/i.test(addr)) {
    try {
      // EIP-191 personal_sign — pass the UTF-8 message (ethers.verifyMessage on server).
      const sig = (await eth.request({
        method: "personal_sign",
        params: [message, addr],
      })) as string;
      return { address: addr, signature: sig };
    } catch {
      return null;
    }
  }
  const p = getSolana();
  const solAddr = address ?? p?.publicKey?.toString() ?? lastConnectedAddress;
  if (!p?.signMessage || !solAddr) return null;
  const bytes = new TextEncoder().encode(message);
  try {
    let signature: Uint8Array;
    try {
      const res = await p.signMessage(bytes, "utf8");
      signature = res.signature;
    } catch {
      const res = await p.signMessage(bytes);
      signature = res.signature;
    }
    return { address: solAddr, signature: base58Encode(signature) };
  } catch {
    return null;
  }
}

export async function signOwnership(nonce: string): Promise<{ address: string; signature: string } | null> {
  return signWalletLogin(`METROPHAGE wallet link\nnonce: ${nonce}`);
}
