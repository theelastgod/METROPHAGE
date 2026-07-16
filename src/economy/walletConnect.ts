// WalletConnect v2 (Reown) — mobile + multi-wallet EVM sessions.
// Free project ID from https://dashboard.reown.com → VITE_WALLETCONNECT_PROJECT_ID

import {
  ROBINHOOD_MAINNET,
  ROBINHOOD_TESTNET,
  robinhoodNetwork,
  type RobinhoodCluster,
} from "./robinhoodChain";
import { metroRobinhoodCluster, METRO_CLUSTER } from "./metro";

export interface EvmRequestProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
  disconnect?(): Promise<void>;
  /** True when this is a WalletConnect session (not injected extension). */
  isWalletConnect?: boolean;
}

const env =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env) ||
  {};

/** Public client id (safe to ship). Create free at dashboard.reown.com. */
export function walletConnectProjectId(): string {
  return (env.VITE_WALLETCONNECT_PROJECT_ID || "").trim();
}

export function walletConnectEnabled(): boolean {
  return walletConnectProjectId().length >= 8;
}

type WcProvider = EvmRequestProvider & {
  connect(opts?: { chains?: number[]; optionalChains?: number[] }): Promise<void>;
  enable(): Promise<string[]>;
  disconnect(): Promise<void>;
  accounts: string[];
  chainId: number;
  connected: boolean;
  session?: unknown;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
};

let providerPromise: Promise<WcProvider | null> | null = null;
let activeProvider: WcProvider | null = null;

function targetCluster(): RobinhoodCluster {
  // Mainnet is the default; testnet only when the client cluster is forced to testnet.
  if (METRO_CLUSTER === "robinhood-testnet") return "robinhood-testnet";
  return metroRobinhoodCluster() === "robinhood-testnet" ? "robinhood-testnet" : "robinhood";
}

function buildRpcMap(): Record<string, string> {
  const main = robinhoodNetwork("robinhood");
  const test = robinhoodNetwork("robinhood-testnet");
  return {
    [String(main.chainId)]: main.rpcUrl,
    [String(test.chainId)]: test.rpcUrl,
    // Common fallbacks so wallets that default to Ethereum still pair cleanly.
    "1": "https://cloudflare-eth.com",
  };
}

function dappMetadata() {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://metrophagev1.pages.dev";
  return {
    name: "METROPHAGE",
    description: "Neon-noir cyberpunk MMO — wallet sign-in & $METRO bridge",
    url: origin,
    icons: [`${origin}/favicon.ico`, `${origin}/icon-192.png`, `${origin}/icons/icon-192.png`],
  };
}

/**
 * Lazy-init WalletConnect Ethereum provider (QR modal + mobile deep links).
 * Reuses one instance so sessions persist across connect/sign/deposit.
 */
export async function getWalletConnectProvider(): Promise<WcProvider | null> {
  if (!walletConnectEnabled()) return null;
  if (activeProvider) return activeProvider;
  if (providerPromise) return providerPromise;

  providerPromise = (async () => {
    try {
      const mod = await import("@walletconnect/ethereum-provider");
      const EthereumProvider = mod.default ?? mod.EthereumProvider;
      const cluster = targetCluster();
      const net = robinhoodNetwork(cluster);
      const optional = [
        ROBINHOOD_MAINNET.chainId,
        ROBINHOOD_TESTNET.chainId,
        1,
      ].filter((id, i, a) => a.indexOf(id) === i) as [number, ...number[]];

      const provider = (await EthereumProvider.init({
        projectId: walletConnectProjectId(),
        showQrModal: true,
        // EVM-only provider: WalletConnect pairs EVM chains, so Robinhood leads here even
        // though Solana settles $METRO — the SPL path connects via injected Phantom instead.
        // Others optional so any wallet can still pair for chain-agnostic sign-in.
        optionalChains: optional,
        rpcMap: buildRpcMap(),
        metadata: dappMetadata(),
        methods: [
          "eth_sendTransaction",
          "eth_signTransaction",
          "eth_sign",
          "personal_sign",
          "eth_signTypedData",
          "eth_signTypedData_v4",
          "wallet_switchEthereumChain",
          "wallet_addEthereumChain",
          "wallet_watchAsset",
        ],
        optionalMethods: [
          "eth_accounts",
          "eth_requestAccounts",
          "eth_call",
          "eth_getBalance",
          "wallet_getPermissions",
          "wallet_requestPermissions",
        ],
        events: ["chainChanged", "accountsChanged", "disconnect", "connect"],
        qrModalOptions: {
          themeMode: "dark",
          // Keep WC modal above Phaser canvas + DOM HUD.
          themeVariables: {
            "--wcm-z-index": "100000",
          },
          // Promote popular mobile wallets in the explorer list.
          explorerRecommendedWalletIds: [
            "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
            "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393", // Phantom
            "1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369", // Rainbow
            "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // Trust
            "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa", // Coinbase
          ],
        },
      } as Parameters<typeof EthereumProvider.init>[0])) as WcProvider;

      // Restore existing pairing without a modal if session is still live.
      if (provider.session && provider.accounts?.length) {
        activeProvider = provider;
        return provider;
      }

      // Ensure chain preference is remembered for later connect() calls.
      void net;
      activeProvider = provider;
      return provider;
    } catch (e) {
      console.warn("[wallet] WalletConnect init failed", e);
      providerPromise = null;
      return null;
    }
  })();

  return providerPromise;
}

/** Open WC modal / deep-link list and return the selected 0x address. */
export async function connectViaWalletConnect(): Promise<string | null> {
  const provider = await getWalletConnectProvider();
  if (!provider) return null;
  try {
    const cluster = targetCluster();
    const net = robinhoodNetwork(cluster);
    await provider.connect({
      optionalChains: [
        net.chainId,
        ROBINHOOD_MAINNET.chainId,
        ROBINHOOD_TESTNET.chainId,
        1,
      ],
    });
    let accounts = provider.accounts?.length
      ? provider.accounts
      : ((await provider.request({ method: "eth_requestAccounts" })) as string[]);
    if (!accounts?.length) {
      accounts = await provider.enable();
    }
    const addr = accounts?.[0] ?? null;
    return addr;
  } catch (e) {
    // User closed modal or rejected in wallet.
    console.info("[wallet] WalletConnect cancelled", (e as Error)?.message ?? e);
    return null;
  }
}

/** Silent restore of an existing WC session (no modal). */
export async function restoreWalletConnectSession(): Promise<string | null> {
  if (!walletConnectEnabled()) return null;
  try {
    const provider = await getWalletConnectProvider();
    if (!provider) return null;
    if (provider.session && provider.accounts?.length) {
      return provider.accounts[0] ?? null;
    }
    // Some versions only expose via eth_accounts after init.
    const accounts = (await provider.request({ method: "eth_accounts" }).catch(() => [])) as string[];
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function disconnectWalletConnect(): Promise<void> {
  try {
    if (activeProvider) {
      await activeProvider.disconnect();
    }
  } catch {
    /* ignore */
  }
  activeProvider = null;
  providerPromise = null;
}

/** Active WC provider if a session is connected. */
export function getActiveWalletConnectProvider(): EvmRequestProvider | null {
  if (activeProvider?.session || (activeProvider?.accounts?.length ?? 0) > 0) {
    return activeProvider;
  }
  return null;
}

/**
 * Mobile deep-link fallback when no injected provider is present.
 * The production path opens Phantom's in-app browser for a Solana injector.
 */
export function walletBrowserUrl(
  wallet: "metamask" | "phantom" | "coinbase" | "trust",
  url: string,
): string {
  const encoded = encodeURIComponent(url);
  const parsed = new URL(url);
  const hostPath = `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
  switch (wallet) {
    case "phantom":
      return `https://phantom.app/ul/browse/${encoded}?ref=https://${parsed.host}`;
    case "coinbase":
      return `https://go.cb-w.com/dapp?cb_url=${encoded}`;
    case "trust":
      return `https://link.trustwallet.com/open_url?coin_id=60&url=${encoded}`;
    case "metamask":
    default:
      return `https://metamask.app.link/dapp/${hostPath}`;
  }
}

export function openInWalletBrowser(wallet: "metamask" | "phantom" | "coinbase" | "trust" = "phantom"): void {
  if (typeof window === "undefined") return;
  const target = walletBrowserUrl(wallet, window.location.href);
  window.open(target, "_blank", "noopener,noreferrer");
}

export function isLikelyMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent || "",
  );
}
