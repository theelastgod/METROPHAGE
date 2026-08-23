// Solana wallet connector — Phantom / Solflare / Backpack for identity.
// Injected first; mobile uses Phantom's native sign protocol (not /ul/browse).
// ERC-20 helpers stay for leftover metro deposit until SPL settlement.

import {
  beginPhantomConnect,
  handlePhantomRedirect,
  phantomDeeplinkSession,
  phantomDeeplinkUsable,
} from "./phantomDeeplink";
import {
  type RobinhoodCluster,
  robinhoodNetwork,
  walletAddEthereumChainParams,
} from "./robinhoodChain";
import { metroRobinhoodCluster, METRO_CLUSTER } from "./metro";
import {
  disconnectWalletConnect,
  getActiveWalletConnectProvider,
  isLikelyMobile,
  walletConnectEnabled,
  type EvmRequestProvider,
} from "./walletConnect";
import {
  connectViaSolanaWalletModal,
  disconnectSolanaWalletModal,
  getActiveAppKitSolanaProvider,
  mobileSolanaConnectRoute,
  restoreSolanaWalletModalProvider,
} from "./solanaWalletModal";
import { isSolanaPubkey } from "./solanaChain";

interface EvmProvider extends EvmRequestProvider {
  isMetaMask?: boolean;
  isPhantom?: boolean;
  isCoinbaseWallet?: boolean;
  isRabby?: boolean;
  providers?: EvmProvider[];
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
const SOURCE_KEY = "mp_wallet_source_v1";

let lastConnectedAddress: string | null = null;
let lastChain: "evm" | "solana" | null = null;
let lastSource: "injected" | "walletconnect" | "solana" | null = null;

try {
  const stored = localStorage.getItem(ADDR_KEY);
  const ch = localStorage.getItem(CHAIN_KEY);
  const src = localStorage.getItem(SOURCE_KEY);
  // Leftover 0x sessions cannot sign Solana login — drop them.
  if (stored && isSolanaPubkey(stored) && ch !== "evm") {
    lastConnectedAddress = stored;
    lastChain = "solana";
    lastSource = src === "walletconnect" ? "walletconnect" : "solana";
  } else if (stored) {
    localStorage.removeItem(ADDR_KEY);
    localStorage.removeItem(CHAIN_KEY);
    localStorage.removeItem(SOURCE_KEY);
  }
} catch {
  /* private mode */
}

function persistConnection(
  addr: string | null,
  chain: "evm" | "solana" | null,
  source: "injected" | "walletconnect" | "solana" | null = null,
) {
  lastConnectedAddress = addr;
  lastChain = chain;
  lastSource = source;
  try {
    if (addr) {
      localStorage.setItem(ADDR_KEY, addr);
      if (chain) localStorage.setItem(CHAIN_KEY, chain);
      if (source) localStorage.setItem(SOURCE_KEY, source);
      else localStorage.removeItem(SOURCE_KEY);
    } else {
      localStorage.removeItem(ADDR_KEY);
      localStorage.removeItem(CHAIN_KEY);
      localStorage.removeItem(SOURCE_KEY);
    }
  } catch {
    /* ignore */
  }
}

const WALLET_SESSION_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const memoryWalletSessions = new Map<string, string>();

/** Solana base58 is case-sensitive — never fold case. */
function sessionKeyFor(wallet: string): string | null {
  const w = (wallet || "").trim();
  if (!w || w.length < 8) return null;
  if (/^0x[a-fA-F0-9]{40}$/i.test(w)) {
    return "mp_wsession_" + w.toLowerCase();
  }
  return "mp_wsession_" + w.replace(/\s+/g, "");
}

function readStoredSession(key: string): string | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const pipe = raw.indexOf("|");
    const s = pipe >= 0 ? raw.slice(0, pipe) : raw;
    return s && s.length >= 8 ? s : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredSession(key: string, secret: string) {
  const payload = `${secret}|${Date.now()}`;
  memoryWalletSessions.set(key, secret);
  try {
    localStorage.setItem(key, payload);
  } catch {
    /* private mode — memory map still holds it for this tab */
  }
}

export function hasWalletSessionSecret(wallet: string): boolean {
  const key = sessionKeyFor(wallet);
  if (!key) return false;
  if (memoryWalletSessions.has(key)) return true;
  return !!readStoredSession(key);
}

/**
 * Device-bound wallet session secret — bound server-side after the first successful
 * wallet signature. Zone travel reuses the SAME secret so you never re-sign.
 *
 * Never mint a replacement while an old secret still exists.
 */
export function walletSessionSecret(wallet: string): string | undefined {
  const key = sessionKeyFor(wallet);
  if (!key) return undefined;

  const mem = memoryWalletSessions.get(key);
  if (mem && mem.length >= 8) {
    try {
      const raw = localStorage.getItem(key);
      const pipe = raw?.indexOf("|") ?? -1;
      const issued = pipe >= 0 ? Number(raw!.slice(pipe + 1)) : 0;
      if (!raw || !Number.isFinite(issued) || Date.now() - issued > WALLET_SESSION_REFRESH_MS) {
        writeStoredSession(key, mem);
      }
    } catch {
      /* ignore */
    }
    return mem;
  }

  const existing = readStoredSession(key);
  if (existing) {
    memoryWalletSessions.set(key, existing);
    writeStoredSession(key, existing);
    return existing;
  }

  const s =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  writeStoredSession(key, s);
  return s;
}

export function clearWalletSessionSecret(wallet?: string) {
  try {
    if (wallet) {
      const key = sessionKeyFor(wallet);
      if (key) {
        localStorage.removeItem(key);
        memoryWalletSessions.delete(key);
      }
    }
  } catch {
    /* ignore */
  }
}

export function rotateWalletSessionSecret(wallet: string): string | undefined {
  const key = sessionKeyFor(wallet);
  if (!key) return undefined;
  const s =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  writeStoredSession(key, s);
  return s;
}

function getInjectedEvm(): EvmProvider | null {
  const w = window as unknown as { ethereum?: EvmProvider };
  const eth = w.ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers) && eth.providers.length) {
    return eth.providers[0] ?? eth;
  }
  return eth;
}

function getInjectedSolana(): SolanaProvider | null {
  const w = window as unknown as {
    solana?: SolanaProvider;
    phantom?: { solana?: SolanaProvider };
    backpack?: { solana?: SolanaProvider };
    solflare?: SolanaProvider;
  };
  return w.phantom?.solana ?? w.solana ?? w.backpack?.solana ?? w.solflare ?? null;
}

function getSolana(): SolanaProvider | null {
  return getInjectedSolana() ?? getActiveAppKitSolanaProvider();
}

export function walletAvailable(): boolean {
  if (getInjectedSolana() || getSolana()) return true;
  if (isLikelyMobile()) return true;
  return false;
}

export function solanaWalletAvailable(): boolean {
  return !!getSolana();
}

export function evmWalletAvailable(): boolean {
  return !!(getInjectedEvm() || getActiveWalletConnectProvider());
}

export function walletConnectAvailable(): boolean {
  return walletConnectEnabled();
}

export function getInjectedProvider(): unknown {
  return getSolana();
}

export function getSolanaProvider(): SolanaProvider | null {
  return getSolana();
}

/** Lazy AppKit rehydrate only at sign/tx boundaries — zone hops stay sync. */
export async function ensureSolanaProvider(): Promise<SolanaProvider | null> {
  const existing = getSolana();
  if (existing) return existing;
  const addr = lastConnectedAddress;
  if (addr && lastChain === "solana" && walletConnectEnabled()) {
    await restoreSolanaWalletModalProvider(addr);
    return getSolana();
  }
  return null;
}

export function getEvmProvider(): EvmRequestProvider | null {
  return getActiveEvmProvider();
}

function getActiveEvmProvider(): EvmRequestProvider | null {
  const injected = getInjectedEvm();
  if (injected) return injected;
  return getActiveWalletConnectProvider();
}

export function connectedWallet(): string | null {
  return lastConnectedAddress;
}

export function connectedChain(): "evm" | "solana" | null {
  return lastChain;
}

export function connectedSource(): "injected" | "walletconnect" | "solana" | null {
  return lastSource;
}

export async function restoreWalletSession(): Promise<string | null> {
  if (lastConnectedAddress) return lastConnectedAddress;

  const sol = getSolana();
  if (sol) {
    try {
      const res = await sol.connect({ onlyIfTrusted: true });
      const addr = res?.publicKey?.toString() ?? sol.publicKey?.toString() ?? null;
      if (addr && isSolanaPubkey(addr)) {
        persistConnection(addr, "solana", "solana");
        return addr;
      }
    } catch {
      /* not trusted yet */
    }
  }

  return lastConnectedAddress;
}

/** Leftover ERC-20 deposit path (MetroPanel) until SPL settlement. */
export async function ensureRobinhoodNetwork(
  cluster?: RobinhoodCluster,
): Promise<{ ok: boolean; chainId?: number; reason?: string }> {
  const eth = getActiveEvmProvider();
  if (!eth) return { ok: false, reason: "no EVM wallet connected" };

  let target: RobinhoodCluster = cluster ?? metroRobinhoodCluster();
  if (METRO_CLUSTER === "robinhood-testnet") target = "robinhood-testnet";
  else if (target !== "robinhood-testnet") target = "robinhood";
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
  if (!sol) {
    const mobile = isLikelyMobile();
    const route = mobileSolanaConnectRoute(
      false,
      mobile && phantomDeeplinkUsable(),
    );
    if (route === "wallet_picker") {
      const address = await connectViaSolanaWalletModal();
      if (address && isSolanaPubkey(address)) persistConnection(address, "solana", "solana");
      return address && isSolanaPubkey(address) ? address : null;
    }
    if (route === "phantom_protocol") {
      const dl = phantomDeeplinkSession();
      if (dl && isSolanaPubkey(dl.wallet)) {
        persistConnection(dl.wallet, "solana", "solana");
        return dl.wallet;
      }
      beginPhantomConnect();
      return null;
    }
    return null;
  }
  try {
    const res = await sol.connect({ onlyIfTrusted: true }).catch(() => sol.connect());
    const addr = res.publicKey.toString();
    if (!isSolanaPubkey(addr)) return null;
    persistConnection(addr, "solana", "solana");
    return addr;
  } catch {
    return null;
  }
}

export async function connectWallet(_prefer?: "evm" | "solana"): Promise<string | null> {
  return connectSolana();
}

export async function disconnectWallet(): Promise<void> {
  if (lastConnectedAddress) clearWalletSessionSecret(lastConnectedAddress);
  persistConnection(null, null, null);
  try {
    await getSolana()?.disconnect();
  } catch {
    /* ignore */
  }
  await disconnectSolanaWalletModal();
  try {
    await disconnectWalletConnect();
  } catch {
    /* leftover EVM WC */
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

export async function signWalletLogin(
  message: string,
  address?: string,
): Promise<{ address: string; signature: string } | null> {
  const addr = address ?? lastConnectedAddress;
  if (addr && /^0x/i.test(addr)) return null;

  const p = await ensureSolanaProvider();
  const solAddr = addr ?? p?.publicKey?.toString() ?? lastConnectedAddress;
  if (p?.signMessage && solAddr && isSolanaPubkey(solAddr)) {
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
  return null;
}

export async function signOwnership(nonce: string): Promise<{ address: string; signature: string } | null> {
  return signWalletLogin(`METROPHAGE wallet link\nnonce: ${nonce}`);
}

export function walletUiLabel(): string {
  return "Phantom";
}

export function walletChoiceList(): string {
  return "Phantom · Solflare · Backpack";
}

export function walletChoiceProse(): string {
  return "Phantom, Solflare, or Backpack";
}

export function connectWalletLabel(): string {
  return "Connect Phantom";
}

export function hasInjectedSolana(): boolean {
  return !!getInjectedSolana();
}

if (typeof window !== "undefined") {
  const back = handlePhantomRedirect();
  if (back && back.kind !== "error") {
    persistConnection(back.wallet, "solana", "solana");
  } else if (back?.kind === "error") {
    console.warn("[wallet] phantom deeplink:", back.detail);
  }
}
