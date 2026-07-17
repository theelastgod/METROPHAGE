// Reown AppKit's Solana picker. Loaded only when a mobile browser has no injected
// wallet, keeping the connector bundle off the game's boot path.

import { walletConnectEnabled, walletConnectProjectId } from "./walletConnect";
import type { SolanaProvider } from "./wallet";

const PHANTOM_WALLETCONNECT_ID =
  "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393";

export type MobileSolanaConnectRoute = "wallet_picker" | "phantom_protocol" | "unavailable";

/** Keep ordinary mobile browsers in control of the game page. */
export function mobileSolanaConnectRoute(
  walletPickerEnabled: boolean,
  phantomProtocolEnabled: boolean,
): MobileSolanaConnectRoute {
  if (walletPickerEnabled) return "wallet_picker";
  if (phantomProtocolEnabled) return "phantom_protocol";
  return "unavailable";
}

export interface RawAppKitSolanaProvider {
  signMessage?(message: Uint8Array): Promise<{ signature: Uint8Array } | Uint8Array>;
  signAndSendTransaction?(transaction: unknown): Promise<{ signature: string }>;
  signTransaction?(transaction: unknown): Promise<{ serialize(): Uint8Array }>;
}

let activeProvider: SolanaProvider | null = null;

/** Normalize AppKit's provider into the interface used by login and SPL actions. */
export function appKitSolanaProvider(
  address: string,
  provider: RawAppKitSolanaProvider,
  disconnect: () => Promise<void>,
): SolanaProvider {
  return {
    publicKey: { toString: () => address },
    connect: async () => ({ publicKey: { toString: () => address } }),
    disconnect,
    signMessage: async (message) => {
      if (!provider.signMessage) throw new Error("Solana wallet cannot sign messages");
      const signed = await provider.signMessage(message);
      return { signature: signed instanceof Uint8Array ? signed : signed.signature };
    },
    signAndSendTransaction: provider.signAndSendTransaction?.bind(provider),
    signTransaction: provider.signTransaction?.bind(provider),
  };
}

async function createSolanaModal() {
  const [{ createAppKit }, { SolanaAdapter }, { solana }] = await Promise.all([
    import("@reown/appkit"),
    import("@reown/appkit-adapter-solana"),
    import("@reown/appkit/networks"),
  ]);
  const origin = window.location.origin || "https://metrophagev1.pages.dev";
  return createAppKit({
    adapters: [new SolanaAdapter()],
    networks: [solana],
    defaultNetwork: solana,
    projectId: walletConnectProjectId(),
    // Keep the wallet named by the primary mobile CTA above the generic catalog.
    featuredWalletIds: [PHANTOM_WALLETCONNECT_ID],
    metadata: {
      name: "METROPHAGE",
      description: "Neon-noir cyberpunk MMO — free Solana wallet sign-in",
      url: origin,
      icons: [`${origin}/icon-192.png`, `${origin}/favicon.ico`],
    },
    themeMode: "dark",
    features: {
      analytics: true,
      email: false,
      socials: [],
      swaps: false,
      onramp: false,
    },
    themeVariables: {
      "--w3m-accent": "#39ff88",
      "--w3m-border-radius-master": "1px",
      "--w3m-z-index": 100000,
    },
  });
}

let modalPromise: Promise<Awaited<ReturnType<typeof createSolanaModal>> | null> | null = null;

async function getModal() {
  if (!walletConnectEnabled()) return null;
  modalPromise ??= createSolanaModal().catch((error) => {
    console.warn("[wallet] Solana AppKit init failed", error);
    modalPromise = null;
    return null;
  });
  return modalPromise;
}

/** Open the generic mobile wallet picker, constrained to Solana wallets. */
export async function connectViaSolanaWalletModal(): Promise<string | null> {
  const modal = await getModal();
  if (!modal) return null;
  // createAppKit starts initialization but does not await it. Opening immediately
  // can race its custom-element registration and leave an empty, invisible
  // <w3m-modal class="open"> in the document on slower phones.
  await modal.ready();
  // AppKit already becomes a bottom sheet on narrow phones. This cap also keeps
  // its wallet list inside short landscape viewports instead of clipping offscreen.
  document.documentElement.style.setProperty(
    "--apkt-modal-width",
    "min(360px, calc(100vw - 24px))",
  );
  await modal.open({ view: "Connect", namespace: "solana" });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const address = modal.getAddressByChainNamespace("solana");
    const provider = modal.getProvider<RawAppKitSolanaProvider>("solana");
    if (address && provider?.signMessage) {
      activeProvider = appKitSolanaProvider(
        address,
        provider,
        async () => { await modal.disconnect("solana"); },
      );
      return address;
    }
    if (!modal.getState().open) return null;
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
  await modal.close();
  return null;
}

export function getActiveAppKitSolanaProvider(): SolanaProvider | null {
  return activeProvider;
}

export async function disconnectSolanaWalletModal(): Promise<void> {
  const modal = await getModal();
  try {
    await modal?.disconnect("solana");
  } catch {
    /* stale sessions are already disconnected */
  }
  activeProvider = null;
}
