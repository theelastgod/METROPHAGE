import { describe, expect, it } from "vitest";
import { appKitSolanaProvider, mobileSolanaConnectRoute } from "./solanaWalletModal";

describe("mobile Solana connection routing", () => {
  it("uses the wallet picker ahead of Phantom's protocol", () => {
    expect(mobileSolanaConnectRoute(true, true)).toBe("wallet_picker");
  });

  it("uses native Phantom approval only when the picker is unavailable", () => {
    expect(mobileSolanaConnectRoute(false, true)).toBe("phantom_protocol");
  });

  it("never invents an embedded-wallet-browser route", () => {
    expect(mobileSolanaConnectRoute(false, false)).toBe("unavailable");
  });

  it("forwards the login message to the selected wallet for signature", async () => {
    const message = new Uint8Array([77, 69, 84, 82, 79]);
    const signature = new Uint8Array([9, 8, 7]);
    let received: Uint8Array | null = null;
    const wallet = appKitSolanaProvider(
      "runner-wallet",
      { signMessage: async (value) => { received = value; return { signature }; } },
      async () => undefined,
    );

    await expect(wallet.signMessage?.(message)).resolves.toEqual({ signature });
    expect(received).toBe(message);
    expect(wallet.publicKey?.toString()).toBe("runner-wallet");
  });
});
