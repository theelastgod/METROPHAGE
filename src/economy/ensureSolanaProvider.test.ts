// Regression net for the reload trap: cached address restores instantly, AppKit's
// in-memory signer does not. ensureSolanaProvider is the ONE shared boundary that
// rehydrates it for login signatures, SPL deposits, and withdrawal claims.
import { beforeEach, describe, expect, it, vi } from "vitest";

// The suite runs in node — give wallet.ts the two browser globals it touches.
const g = globalThis as unknown as { window?: unknown; localStorage?: Storage };
const store = new Map<string, string>();
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage;
g.window = globalThis;

const restoreSpy = vi.fn(async (_addr: string) => {
  (window as unknown as { solana?: unknown }).solana = {
    publicKey: { toString: () => "So1ReloadedWa11et11111111111111111111111111" },
    signMessage: async () => ({ signature: new Uint8Array(64) }),
    connect: async () => ({ publicKey: { toString: () => "x" } }),
    disconnect: async () => {},
  };
});

vi.mock("./solanaWalletModal", () => ({
  connectViaSolanaWalletModal: vi.fn(),
  disconnectSolanaWalletModal: vi.fn(),
  getActiveAppKitSolanaProvider: () => null,
  restoreSolanaWalletModalProvider: (addr: string) => restoreSpy(addr),
  mobileSolanaConnectRoute: () => "modal",
}));

vi.mock("./walletConnect", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return { ...mod, walletConnectEnabled: () => true };
});

describe("ensureSolanaProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    restoreSpy.mockClear();
    delete (window as unknown as { solana?: unknown }).solana;
    localStorage.clear();
  });

  it("rehydrates the AppKit signer when only the cached address survived a reload", async () => {
    localStorage.setItem("mp_wallet_addr_v1", "So1ReloadedWa11et11111111111111111111111111");
    localStorage.setItem("mp_wallet_chain_v1", "solana");
    localStorage.setItem("mp_wallet_source_v1", "solana");
    const { ensureSolanaProvider } = await import("./wallet");
    const p = await ensureSolanaProvider();
    expect(restoreSpy).toHaveBeenCalledTimes(1);
    expect(p?.signMessage).toBeTypeOf("function");
  });

  it("returns the injected provider without touching AppKit when one exists", async () => {
    (window as unknown as { solana?: unknown }).solana = { injected: true, connect: async () => ({ publicKey: { toString: () => "inj" } }), disconnect: async () => {} };
    const { ensureSolanaProvider } = await import("./wallet");
    const p = await ensureSolanaProvider();
    expect(restoreSpy).not.toHaveBeenCalled();
    expect((p as { injected?: boolean } | null)?.injected).toBe(true);
  });

  it("returns null when nothing was ever connected", async () => {
    const { ensureSolanaProvider } = await import("./wallet");
    expect(await ensureSolanaProvider()).toBeNull();
    expect(restoreSpy).not.toHaveBeenCalled();
  });
});
