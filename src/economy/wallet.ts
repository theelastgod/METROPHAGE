// METROPHAGE — wallet connector.
// **Solana-first** (Phantom / Solflare / Backpack) for identity + $METRO SPL bridge.
// MetaMask / Robinhood Chain remains available for legacy ERC-20 mints (0x…).

import {
  type RobinhoodCluster,
  robinhoodNetwork,
  walletAddEthereumChainParams,
} from "./robinhoodChain";
import {
  metroRobinhoodCluster,
  METRO_CLUSTER,
  METRO_MAINNET_ARMED,
  metroIsSolana,
  metroIsEvm,
  settlementForce,
  METRO_MINT,
} from "./metro";

interface EvmProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  isMetaMask?: boolean;
}

export interface SolanaProvider {
  publicKey?: { toString(): string } | null;
  isConnected?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  signMessage?(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array }>;
  signAndSendTransaction?(tx: unknown): Promise<{ signature: string }>;
  signTransaction?(tx: unknown): Promise<{ serialize(): Uint8Array }>;
}

const ADDR_KEY = "mp_wallet_addr_v1";
const CHAIN_KEY = "mp_wallet_chain_v1";

let lastConnectedAddress: string | null = null;
let lastChain: "evm" | "solana" | null = null;

try {
  lastConnectedAddress = localStorage.getItem(ADDR_KEY);
  const ch = localStorage.getItem(CHAIN_KEY);
  lastChain = ch === "evm" || ch === "solana" ? ch : null;
} catch {
  /* private mode */
}

function persistConnection(addr: string | null, chain: "evm" | "solana" | null) {
  lastConnectedAddress = addr;
  lastChain = chain;
  try {
    if (addr) {
      localStorage.setItem(ADDR_KEY, addr);
      if (chain) localStorage.setItem(CHAIN_KEY, chain);
    } else {
      localStorage.removeItem(ADDR_KEY);
      localStorage.removeItem(CHAIN_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** Wallet device sessions expire after 7 days — forces a fresh wallet sign-in. */
const WALLET_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Stable localStorage key for a wallet.
 * EVM: case-insensitive. Solana base58 is case-sensitive — never fold case.
 */
function sessionKeyFor(wallet: string): string | null {
  const w = (wallet || "").trim();
  if (!w || w.length < 8) return null;
  if (/^0x[a-fA-F0-9]{40}$/i.test(w)) {
    return "mp_wsession_" + w.toLowerCase();
  }
  // Solana / other base58 — preserve case, strip only whitespace.
  return "mp_wsession_" + w.replace(/\s+/g, "");
}

/**
 * Device-bound wallet session secret — bound server-side after the first successful
 * wallet signature. Zone travel reuses this so you don't re-sign every district.
 * Stored as `secret|issuedAtMs`; expired secrets are rotated (next login needs a re-sign).
 */
export function walletSessionSecret(wallet: string): string | undefined {
  try {
    const key = sessionKeyFor(wallet);
    if (!key) return undefined;
    const now = Date.now();
    const raw = localStorage.getItem(key);
    if (raw) {
      const pipe = raw.indexOf("|");
      const s = pipe >= 0 ? raw.slice(0, pipe) : raw;
      const issued = pipe >= 0 ? Number(raw.slice(pipe + 1)) : now;
      if (s && s.length >= 8 && Number.isFinite(issued) && now - issued < WALLET_SESSION_TTL_MS) {
        return s;
      }
    }
    const s = crypto.randomUUID();
    localStorage.setItem(key, `${s}|${now}`);
    return s;
  } catch {
    return undefined;
  }
}

/** Force-rotate the device session (e.g. after sign-out). */
export function clearWalletSessionSecret(wallet?: string) {
  try {
    if (wallet) {
      const key = sessionKeyFor(wallet);
      if (key) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/** Mint a fresh session secret and stamp issued-at (call after a successful sign). */
export function rotateWalletSessionSecret(wallet: string): string | undefined {
  try {
    const key = sessionKeyFor(wallet);
    if (!key) return undefined;
    const s = crypto.randomUUID();
    localStorage.setItem(key, `${s}|${Date.now()}`);
    return s;
  } catch {
    return undefined;
  }
}

/** Prefer Solana when mint is SPL / forced, or when no mint yet (Solana-first launch). */
export function preferSolanaWallet(): boolean {
  if (settlementForce() === "solana") return true;
  if (settlementForce() === "robinhood") return false;
  if (metroIsSolana) return true;
  if (metroIsEvm) return false;
  // No CA yet — Solana is the active launch path.
  return !METRO_MINT || !/^0x/i.test(METRO_MINT);
}

function getEvm(): EvmProvider | null {
  const w = window as unknown as {
    ethereum?: EvmProvider & { providers?: EvmProvider[]; isMetaMask?: boolean };
  };
  const eth = w.ethereum;
  if (!eth) return null;
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

export function walletAvailable(): boolean {
  return !!(getEvm() || getSolana());
}

export function solanaWalletAvailable(): boolean {
  return !!getSolana();
}

export function evmWalletAvailable(): boolean {
  return !!getEvm();
}

/** Prefer the chain that matches the active $METRO mint family. */
export function getInjectedProvider(): unknown {
  if (preferSolanaWallet()) return getSolana() ?? getEvm();
  return getEvm() ?? getSolana();
}

/** Always the Solana injector (Phantom etc.) — never MetaMask. */
export function getSolanaProvider(): SolanaProvider | null {
  return getSolana();
}

/** Always the EVM injector (MetaMask etc.). */
export function getEvmProvider(): EvmProvider | null {
  return getEvm();
}

export function connectedWallet(): string | null {
  if (lastConnectedAddress) return lastConnectedAddress;
  return null;
}

export function connectedChain(): "evm" | "solana" | null {
  return lastChain;
}

/**
 * Silently restore a previously-approved wallet (no popup).
 * Solana-first: onlyIfTrusted Phantom connect, then MetaMask eth_accounts.
 * Call once at boot / title screen so zone travel keeps the address.
 */
export async function restoreWalletSession(): Promise<string | null> {
  if (preferSolanaWallet() || lastChain === "solana") {
    const sol = getSolana();
    if (sol) {
      try {
        const res = await sol.connect({ onlyIfTrusted: true });
        const addr = res?.publicKey?.toString() ?? sol.publicKey?.toString() ?? null;
        if (addr) {
          persistConnection(addr, "solana");
          return addr;
        }
      } catch {
        /* not trusted yet */
      }
    }
  }
  const eth = getEvm();
  if (eth && (lastChain === "evm" || !preferSolanaWallet())) {
    try {
      const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
      const addr = accounts?.[0] ?? null;
      if (addr) {
        persistConnection(addr, "evm");
        return addr;
      }
    } catch {
      /* ignore */
    }
  }
  // Fall back to last remembered address (session secret still authenticates zones).
  return lastConnectedAddress;
}

/**
 * Ensure MetaMask is on Robinhood Chain (add network if missing, then switch).
 * Uses testnet by default; mainnet only when cluster is robinhood + armed (or explicit).
 */
export async function ensureRobinhoodNetwork(
  cluster?: RobinhoodCluster,
): Promise<{ ok: boolean; chainId?: number; reason?: string }> {
  const eth = getEvm();
  if (!eth) return { ok: false, reason: "no MetaMask / EVM wallet" };

  let target: RobinhoodCluster = cluster ?? metroRobinhoodCluster();
  // Never auto-switch to mainnet without arm flag when using default path
  if (target === "robinhood" && !METRO_MAINNET_ARMED && METRO_CLUSTER !== "robinhood") {
    target = "robinhood-testnet";
  }
  const net = robinhoodNetwork(target);

  try {
    const cur = (await eth.request({ method: "eth_chainId" })) as string;
    if (cur?.toLowerCase() === net.chainIdHex.toLowerCase()) {
      return { ok: true, chainId: net.chainId };
    }
  } catch {
    /* continue to switch */
  }

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: net.chainIdHex }],
    });
    return { ok: true, chainId: net.chainId };
  } catch (e) {
    const err = e as { code?: number; message?: string };
    // 4902 = chain not added
    if (err?.code === 4902 || /unrecognized chain|not been added/i.test(err?.message ?? "")) {
      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [walletAddEthereumChainParams(net)],
        });
        return { ok: true, chainId: net.chainId };
      } catch (addErr) {
        return {
          ok: false,
          reason: String((addErr as Error)?.message ?? addErr).slice(0, 120),
        };
      }
    }
    return { ok: false, reason: String(err?.message ?? e).slice(0, 120) };
  }
}

async function connectSolana(): Promise<string | null> {
  const sol = getSolana();
  if (!sol) return null;
  try {
    const res = await sol.connect({ onlyIfTrusted: true }).catch(() => sol.connect());
    const addr = res.publicKey.toString();
    persistConnection(addr, "solana");
    return addr;
  } catch {
    return null;
  }
}

async function connectEvm(): Promise<string | null> {
  const eth = getEvm();
  if (!eth) return null;
  try {
    // Only switch to Robinhood when the mint is actually EVM/RH.
    if (metroIsEvm || settlementForce() === "robinhood") {
      await ensureRobinhoodNetwork();
    }
    let accounts = (await eth.request({ method: "eth_accounts" })) as string[];
    if (!accounts?.length) {
      accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    }
    const addr = accounts?.[0] ?? null;
    if (addr) {
      persistConnection(addr, "evm");
      return addr;
    }
  } catch {
    /* user rejected */
  }
  return null;
}

/**
 * Connect a wallet. Solana-first by default (Phantom).
 * Pass prefer: "evm" for MetaMask / Robinhood ERC-20 path.
 */
export async function connectWallet(prefer?: "evm" | "solana"): Promise<string | null> {
  const wantSol = prefer === "solana" || (prefer !== "evm" && preferSolanaWallet());
  if (wantSol) {
    const sol = await connectSolana();
    if (sol) return sol;
    return connectEvm();
  }
  const eth = await connectEvm();
  if (eth) return eth;
  return connectSolana();
}

export async function disconnectWallet(): Promise<void> {
  if (lastConnectedAddress) clearWalletSessionSecret(lastConnectedAddress);
  persistConnection(null, null);
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
 * Solana → ed25519 base58. EVM → personal_sign (Robinhood only when mint is EVM).
 */
export async function signWalletLogin(
  message: string,
  address?: string,
): Promise<{ address: string; signature: string } | null> {
  const addr = address ?? lastConnectedAddress;
  const isEvmAddr = !!(addr && /^0x/i.test(addr));

  // Solana path first when address is base58 or we prefer Solana and address is not 0x.
  if (!isEvmAddr) {
    const p = getSolana();
    const solAddr = addr ?? p?.publicKey?.toString() ?? lastConnectedAddress;
    if (p?.signMessage && solAddr && !/^0x/i.test(solAddr)) {
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
  }

  const eth = getEvm();
  if (eth && addr && isEvmAddr) {
    try {
      if (metroIsEvm || settlementForce() === "robinhood") {
        await ensureRobinhoodNetwork();
      }
      const sig = (await eth.request({
        method: "personal_sign",
        params: [message, addr],
      })) as string;
      return { address: addr, signature: sig };
    } catch {
      return null;
    }
  }
  return null;
}

export async function signOwnership(nonce: string): Promise<{ address: string; signature: string } | null> {
  return signWalletLogin(`METROPHAGE wallet link\nnonce: ${nonce}`);
}
