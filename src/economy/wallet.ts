// METROPHAGE — wallet connector.
// **Robinhood / EVM first** for identity + $METRO ERC-20 bridge.
// Connects: injected browsers (MetaMask, Phantom, Rabby, …) + WalletConnect
// (any mobile wallet) + native Phantom approval as a last-resort fallback.
// Phantom / Solana remains available when settlement is forced to SPL.

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
import {
  metroRobinhoodCluster,
  METRO_CLUSTER,
  metroIsSolana,
  metroIsEvm,
  settlementForce,
} from "./metro";
import {
  connectViaWalletConnect,
  disconnectWalletConnect,
  getActiveWalletConnectProvider,
  getWalletConnectProvider,
  isLikelyMobile,
  openInWalletBrowser,
  restoreWalletConnectSession,
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
/** How the EVM session was established — drives sign/deposit provider selection. */
let lastSource: "injected" | "walletconnect" | "solana" | null = null;

try {
  lastConnectedAddress = localStorage.getItem(ADDR_KEY);
  const ch = localStorage.getItem(CHAIN_KEY);
  lastChain = ch === "evm" || ch === "solana" ? ch : null;
  const src = localStorage.getItem(SOURCE_KEY);
  lastSource =
    src === "injected" || src === "walletconnect" || src === "solana" ? src : null;
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

/**
 * Soft age stamp for UI/debug only. The secret itself is STABLE for the life of
 * the browser profile so zone travel never needs a wallet popup. A new secret is
 * only minted when none exists (first connect) or after explicit disconnect/logout.
 */
const WALLET_SESSION_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

/** In-memory fallback when localStorage is blocked (private mode / ITP). */
const memoryWalletSessions = new Map<string, string>();

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

/**
 * True if this device already has a wallet session secret (does NOT mint).
 * Used to avoid MetaMask popups when the server only needs session resume.
 */
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
 * CRITICAL: never mint a replacement while an old secret still exists. Reminting
 * desyncs the client from D1 and forces a wallet reconnect on every zone change.
 */
export function walletSessionSecret(wallet: string): string | undefined {
  const key = sessionKeyFor(wallet);
  if (!key) return undefined;

  const mem = memoryWalletSessions.get(key);
  if (mem && mem.length >= 8) {
    // Refresh stamp periodically so long-lived tabs stay durable in storage.
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
    // Touch stamp (does NOT change the secret).
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

/** Clear device session (sign-out / disconnect only — never on zone travel). */
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

/**
 * Mint a fresh session secret. Only use on explicit logout→login or when the
 * server says the old session is dead AND the user just signed a new proof.
 * Do NOT call this before zone travel or on every personal_sign — it desyncs D1.
 */
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

/** Prefer EVM only when Robinhood is forced / mint is 0x. Default launch path is Solana. */
export function preferSolanaWallet(): boolean {
  if (settlementForce() === "solana") return true;
  if (settlementForce() === "robinhood") return false;
  if (metroIsSolana) return true;
  if (metroIsEvm) return false;
  // No CA yet (force=auto) — Solana / SPL is the active launch path.
  return true;
}

function getInjectedEvm(): EvmProvider | null {
  const w = window as unknown as {
    ethereum?: EvmProvider;
  };
  const eth = w.ethereum;
  if (!eth) return null;
  // EIP-6963 multi-inject: prefer known wallets in a stable order, else first.
  if (Array.isArray(eth.providers) && eth.providers.length) {
    const rank = (p: EvmProvider) => {
      if (p.isMetaMask && !p.isRabby) return 0;
      if (p.isRabby) return 1;
      if (p.isPhantom) return 2;
      if (p.isCoinbaseWallet) return 3;
      return 9;
    };
    return [...eth.providers].sort((a, b) => rank(a) - rank(b))[0] ?? eth;
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
  return w.phantom?.solana ?? w.solana ?? w.backpack?.solana ?? w.solflare ?? getActiveAppKitSolanaProvider() ?? null;
}

/**
 * True when the user can start a wallet connect flow.
 * Injected extension/in-app browser, WalletConnect project id, or mobile deep-link.
 */
export function walletAvailable(): boolean {
  if (getInjectedEvm() || getSolana()) return true;
  if (walletConnectEnabled()) return true;
  // Mobile Safari / Chrome can use native wallet approval/deep-link flows.
  if (isLikelyMobile()) return true;
  return false;
}

export function solanaWalletAvailable(): boolean {
  return !!getSolana();
}

export function evmWalletAvailable(): boolean {
  return !!(getInjectedEvm() || walletConnectEnabled() || getActiveWalletConnectProvider());
}

/** Whether WalletConnect modal path is configured. */
export function walletConnectAvailable(): boolean {
  return walletConnectEnabled();
}

/** Prefer the chain that matches the active $METRO mint family. */
export function getInjectedProvider(): unknown {
  if (preferSolanaWallet()) return getSolana() ?? getActiveEvmProvider();
  return getActiveEvmProvider() ?? getSolana();
}

/** Always the Solana injector (Phantom etc.) — never MetaMask. */
export function getSolanaProvider(): SolanaProvider | null {
  return getSolana();
}

/**
 * Active EVM provider for requests (sign, send, switch chain).
 * Prefer WalletConnect when that is how we connected; else injected.
 */
export function getEvmProvider(): EvmRequestProvider | null {
  return getActiveEvmProvider();
}

function getActiveEvmProvider(): EvmRequestProvider | null {
  if (lastSource === "walletconnect" || lastChain === "evm") {
    const wc = getActiveWalletConnectProvider();
    if (wc) return wc;
  }
  const injected = getInjectedEvm();
  if (injected) return injected;
  return getActiveWalletConnectProvider();
}

export function connectedWallet(): string | null {
  if (lastConnectedAddress) return lastConnectedAddress;
  return null;
}

export function connectedChain(): "evm" | "solana" | null {
  return lastChain;
}

export function connectedSource(): "injected" | "walletconnect" | "solana" | null {
  return lastSource;
}

/**
 * Silently restore a previously-approved wallet (no popup).
 * Prefer the last remembered address immediately so zone travel / login can
 * open the WebSocket without waiting on WalletConnect bundle load.
 */
export async function restoreWalletSession(): Promise<string | null> {
  // Instant path — localStorage address is enough for device-session WS login.
  if (lastConnectedAddress) return lastConnectedAddress;

  // Injected wallets (MetaMask in-app browser) — usually fast.
  if (preferSolanaWallet() || lastChain === "solana") {
    const sol = getSolana();
    if (sol) {
      try {
        const res = await sol.connect({ onlyIfTrusted: true });
        const addr = res?.publicKey?.toString() ?? sol.publicKey?.toString() ?? null;
        if (addr) {
          persistConnection(addr, "solana", "solana");
          return addr;
        }
      } catch {
        /* not trusted yet */
      }
    }
  }

  const eth = getInjectedEvm();
  if (eth && (lastChain === "evm" || !preferSolanaWallet())) {
    try {
      const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
      const addr = accounts?.[0] ?? null;
      if (addr) {
        persistConnection(addr, "evm", "injected");
        return addr;
      }
    } catch {
      /* ignore */
    }
  }

  // WalletConnect last — dynamic import can be slow; never block first link.
  if (lastSource === "walletconnect" || lastChain === "evm" || !preferSolanaWallet()) {
    try {
      const wcAddr = await Promise.race([
        restoreWalletConnectSession(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);
      if (wcAddr) {
        persistConnection(wcAddr, "evm", "walletconnect");
        return wcAddr;
      }
    } catch {
      /* ignore */
    }
  }

  return lastConnectedAddress;
}

/**
 * Ensure the active EVM wallet is on Robinhood Chain (add network if missing, then switch).
 */
export async function ensureRobinhoodNetwork(
  cluster?: RobinhoodCluster,
): Promise<{ ok: boolean; chainId?: number; reason?: string }> {
  const eth = getActiveEvmProvider();
  if (!eth) return { ok: false, reason: "no EVM wallet connected" };

  // Default is Robinhood mainnet. Only explicit robinhood-testnet cluster stays testnet.
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
  if (!sol) {
    const mobile = isLikelyMobile();
    const route = mobileSolanaConnectRoute(
      mobile && walletConnectEnabled(),
      mobile && phantomDeeplinkUsable(),
    );
    // AppKit is the normal mobile path: choose an installed Solana wallet, approve
    // there, and return to this browser for the game. Cancellation is final for
    // this click; it must not surprise-navigate the player into another app.
    if (route === "wallet_picker") {
      const address = await connectViaSolanaWalletModal();
      if (address) persistConnection(address, "solana", "solana");
      return address;
    }
    // If WalletConnect is not configured, Phantom's connect/sign protocol still
    // round-trips approval through the native app without loading the game there.
    if (route === "phantom_protocol") {
      const dl = phantomDeeplinkSession();
      if (dl) {
        persistConnection(dl.wallet, "solana", "solana");
        return dl.wallet;
      }
      beginPhantomConnect(); // page navigates to the Phantom app and back
      return null;
    }
    return null;
  }
  try {
    const res = await sol.connect({ onlyIfTrusted: true }).catch(() => sol.connect());
    const addr = res.publicKey.toString();
    persistConnection(addr, "solana", "solana");
    return addr;
  } catch {
    return null;
  }
}

async function connectInjectedEvm(): Promise<string | null> {
  const eth = getInjectedEvm();
  if (!eth) return null;
  try {
    // Only switch to Robinhood when the mint is actually EVM/RH.
    if (metroIsEvm || settlementForce() === "robinhood") {
      // Temporarily mark so ensureRobinhoodNetwork uses this inject.
      const prev = lastSource;
      lastSource = "injected";
      try {
        await ensureRobinhoodNetwork();
      } finally {
        lastSource = prev;
      }
    }
    let accounts = (await eth.request({ method: "eth_accounts" })) as string[];
    if (!accounts?.length) {
      accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    }
    const addr = accounts?.[0] ?? null;
    if (addr) {
      persistConnection(addr, "evm", "injected");
      // Switch network with the now-active inject.
      if (metroIsEvm || settlementForce() === "robinhood") {
        await ensureRobinhoodNetwork();
      }
      return addr;
    }
  } catch {
    /* user rejected */
  }
  return null;
}

async function connectEvmWalletConnect(): Promise<string | null> {
  // Warm the provider so session restore works next boot.
  await getWalletConnectProvider();
  const addr = await connectViaWalletConnect();
  if (!addr) return null;
  persistConnection(addr, "evm", "walletconnect");
  if (metroIsEvm || settlementForce() === "robinhood") {
    await ensureRobinhoodNetwork().catch(() => undefined);
  }
  return addr;
}

/**
 * Connect EVM: injected first (desktop / in-app browsers), then WalletConnect
 * (MetaMask mobile, Phantom, Rainbow, Trust, Coinbase, …). On mobile without
 * either path, deep-link into MetaMask so the user can continue in-app.
 */
async function connectEvm(): Promise<string | null> {
  // Already have an active WC session?
  const restored = await restoreWalletConnectSession();
  if (restored) {
    persistConnection(restored, "evm", "walletconnect");
    return restored;
  }

  // Injected wallet (extension or wallet in-app browser) — no modal.
  if (getInjectedEvm()) {
    const injected = await connectInjectedEvm();
    if (injected) return injected;
  }

  // WalletConnect modal — any mobile / desktop wallet in the explorer list.
  if (walletConnectEnabled()) {
    const wc = await connectEvmWalletConnect();
    if (wc) return wc;
  }

  // Last resort on phones: open the dapp inside MetaMask's browser.
  if (isLikelyMobile() && !getInjectedEvm()) {
    openInWalletBrowser("metamask");
    return null;
  }

  return null;
}

/**
 * Connect a wallet. The live path is Phantom/Solana; the EVM branch remains only
 * for explicitly forced compatibility deployments.
 */
export async function connectWallet(prefer?: "evm" | "solana"): Promise<string | null> {
  const wantSol = prefer === "solana" || (prefer !== "evm" && preferSolanaWallet());
  if (wantSol) {
    return connectSolana();
  }
  const eth = await connectEvm();
  if (eth) return eth;
  return connectSolana();
}

export async function disconnectWallet(): Promise<void> {
  if (lastConnectedAddress) clearWalletSessionSecret(lastConnectedAddress);
  const wasWc = lastSource === "walletconnect";
  persistConnection(null, null, null);
  try {
    await getSolana()?.disconnect();
  } catch {
    /* ignore */
  }
  await disconnectSolanaWalletModal();
  if (wasWc) {
    await disconnectWalletConnect();
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
 * Solana → ed25519 base58. EVM → personal_sign (Robinhood when mint is EVM).
 */
export async function signWalletLogin(
  message: string,
  address?: string,
): Promise<{ address: string; signature: string } | null> {
  const addr = address ?? lastConnectedAddress;
  const isEvmAddr = !!(addr && /^0x/i.test(addr));

  // Solana path first when address is base58 or we prefer Solana and address is not 0x.
  if (!isEvmAddr) {
    let p = getSolana();
    // The cached address deliberately restores instantly at boot, but AppKit's
    // provider lives in memory. Rehydrate that signer only when an action really
    // needs it so zone travel remains fast and a reloaded login can still sign.
    if (!p && addr && lastChain === "solana" && walletConnectEnabled()) {
      await restoreSolanaWalletModalProvider(addr);
      p = getSolana();
    }
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

  const eth = getActiveEvmProvider();
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

/** Human-facing label for UI (connect buttons, status). */
export function walletUiLabel(): string {
  if (preferSolanaWallet()) return "Phantom";
  if (lastSource === "walletconnect") return "WalletConnect";
  if (getInjectedEvm()?.isMetaMask) return "MetaMask";
  if (getInjectedEvm()?.isPhantom) return "Phantom";
  return "Wallet";
}

/**
 * Wallet names for sign-up copy, in the order players should try them.
 * Leads with the family that actually settles $METRO.
 */
export function walletChoiceList(): string {
  return preferSolanaWallet()
    ? "Phantom · Solflare"
    : "MetaMask · Phantom · any WalletConnect wallet";
}

/** Prose form of the same list, for sentences rather than button subtitles. */
export function walletChoiceProse(): string {
  return preferSolanaWallet()
    ? "Phantom or Solflare"
    : "MetaMask, Phantom, or any WalletConnect wallet";
}

export function connectWalletLabel(): string {
  if (preferSolanaWallet()) {
    return walletConnectEnabled() && isLikelyMobile() ? "Connect Solana Wallet" : "Connect Phantom";
  }
  if (walletConnectEnabled() || isLikelyMobile()) return "Connect Wallet";
  if (getInjectedEvm()?.isMetaMask) return "Connect MetaMask";
  return "Connect Wallet";
}

/** True when a browser-injected Solana provider exists (in-app browsers, extensions). */
export function hasInjectedSolana(): boolean {
  return !!getSolana();
}

// A Phantom deeplink return lands as a full page reload with `?phantom_action=…` —
// consume it BEFORE any UI reads connection state, so the title screen simply shows
// the wallet as connected when the player lands back from the Phantom app.
if (typeof window !== "undefined") {
  const back = handlePhantomRedirect();
  if (back && back.kind !== "error") {
    persistConnection(back.wallet, "solana", "solana");
  } else if (back?.kind === "error") {
    console.warn("[wallet] phantom deeplink:", back.detail);
  }
}
