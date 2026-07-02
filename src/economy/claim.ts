// METROPHAGE — claim submission for $0-launch withdrawals (Phase 5).
//
// A withdrawal is a CLAIM: the server debits credits, reserves the pool, and returns a
// payout tx partially signed by the treasury with the PLAYER as fee payer. This module
// has the player's wallet sign + submit it — the player pays the network fee (~0.000005
// SOL) and their own token-account rent; the treasury never spends SOL.
//
// @solana/web3.js is imported DYNAMICALLY so it lives in its own lazy chunk: the game
// bundle stays free of Solana weight, and the chunk only ever loads inside the gated
// bridge panel when a real (non-sim) claim needs submitting.

import { getInjectedProvider } from "./wallet";

interface SigningProvider {
  signAndSendTransaction?(tx: unknown): Promise<{ signature: string }>;
  signTransaction?(tx: unknown): Promise<{ serialize(): Uint8Array }>;
}

export interface ClaimSubmitResult {
  ok: boolean;
  sig?: string;
  reason?: string;
}

/** Sign + submit a base64 claim tx with the injected wallet. */
export async function submitClaim(claimTxB64: string, rpc: string): Promise<ClaimSubmitResult> {
  const p = getInjectedProvider() as SigningProvider | null;
  if (!p) return { ok: false, reason: "no wallet to sign with" };
  try {
    const { Transaction, Connection } = await import("@solana/web3.js"); // lazy chunk
    const bytes = Uint8Array.from(atob(claimTxB64), (c) => c.charCodeAt(0));
    const tx = Transaction.from(bytes);
    // preferred: the wallet signs AND submits (it picks its own RPC)
    if (p.signAndSendTransaction) {
      const { signature } = await p.signAndSendTransaction(tx);
      return { ok: true, sig: signature };
    }
    // fallback: wallet signs, we submit through the public RPC
    if (p.signTransaction) {
      const signed = await p.signTransaction(tx);
      const conn = new Connection(rpc, "confirmed");
      const sig = await conn.sendRawTransaction(signed.serialize());
      return { ok: true, sig };
    }
    return { ok: false, reason: "wallet cannot sign transactions" };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
  }
}
