// Mobile Solana connect routing. AppKit is not compiled here — July pins
// pulled bigint-buffer into `npm audit`. Injected wallets + Phantom's native
// protocol (not /ul/browse) cover desktop and mobile until a clean adapter lands.

import { walletConnectEnabled } from "./walletConnect";
import type { SolanaProvider } from "./wallet";

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

export interface RawSolanaSigner {
  signMessage?(message: Uint8Array): Promise<{ signature: Uint8Array } | Uint8Array>;
  signAndSendTransaction?(transaction: unknown): Promise<{ signature: string }>;
  signTransaction?(transaction: unknown): Promise<{ serialize(): Uint8Array }>;
}

let activeProvider: SolanaProvider | null = null;

/** Normalize an external Solana signer into the login/SPL interface. */
export function appKitSolanaProvider(
  address: string,
  provider: RawSolanaSigner,
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

/** WalletConnect Solana picker is not bundled in this PR (audit-clean identity cut). */
export async function connectViaSolanaWalletModal(): Promise<string | null> {
  if (!walletConnectEnabled()) return null;
  return null;
}

export function getActiveAppKitSolanaProvider(): SolanaProvider | null {
  return activeProvider;
}

export async function restoreSolanaWalletModalProvider(
  _expectedAddress?: string,
): Promise<string | null> {
  return activeProvider?.publicKey?.toString() ?? null;
}

export async function disconnectSolanaWalletModal(): Promise<void> {
  activeProvider = null;
}
