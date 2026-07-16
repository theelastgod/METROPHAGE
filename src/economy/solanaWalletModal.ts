// Reown AppKit's Solana picker. Loaded only when a mobile browser has no injected
// wallet, keeping the connector bundle off the game's boot path.

import { walletConnectEnabled, walletConnectProjectId } from "./walletConnect";
import type { SolanaProvider } from "./wallet";

interface RawAppKitSolanaProvider {
  signMessage?(message: Uint8Array): Promise<{ signature: Uint8Array } | Uint8Array>;
  signAndSendTransaction?(transaction: unknown): Promise<{ signature: string }>;
  signTransaction?(transaction: unknown): Promise<{ serialize(): Uint8Array }>;
}

let activeProvider: SolanaProvider | null = null;

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
  await modal.open({ view: "Connect", namespace: "solana" });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const address = modal.getAddressByChainNamespace("solana");
    const provider = modal.getProvider<RawAppKitSolanaProvider>("solana");
    if (address && provider?.signMessage) {
      activeProvider = {
        publicKey: { toString: () => address },
        connect: async () => ({ publicKey: { toString: () => address } }),
        disconnect: async () => { await modal.disconnect("solana"); },
        signMessage: async (message) => {
          const signed = await provider.signMessage!(message);
          return { signature: signed instanceof Uint8Array ? signed : signed.signature };
        },
        signAndSendTransaction: provider.signAndSendTransaction?.bind(provider),
        signTransaction: provider.signTransaction?.bind(provider),
      };
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
