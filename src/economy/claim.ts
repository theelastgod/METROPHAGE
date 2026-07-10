// METROPHAGE — claim submission for bridge withdrawals.
//
// EVM: claimTx is a fully signed raw tx (treasury pays gas). Broadcast via
// eth_sendRawTransaction — no wallet signature needed.
// Solana: claimTx is base64 partial-signed; wallet signs + sends (player pays fee).

import { getInjectedProvider, connectedChain } from "./wallet";

interface SigningProvider {
  signAndSendTransaction?(tx: unknown): Promise<{ signature: string }>;
  signTransaction?(tx: unknown): Promise<{ serialize(): Uint8Array }>;
  request?(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface ClaimSubmitResult {
  ok: boolean;
  sig?: string;
  reason?: string;
}

/** Sign + submit (Solana) or broadcast (EVM raw) a claim. */
export async function submitClaim(claimTx: string, rpc: string): Promise<ClaimSubmitResult> {
  // EVM signed raw txs start with 0x; sim claims are tagged.
  if (claimTx.startsWith("devnet-sim-claim:")) {
    return { ok: true, sig: `sim:${Date.now()}` };
  }
  if (claimTx.startsWith("0x") && claimTx.length > 100) {
    return broadcastEvmRaw(claimTx, rpc);
  }
  return submitSolanaClaim(claimTx, rpc);
}

async function broadcastEvmRaw(rawTx: string, rpc: string): Promise<ClaimSubmitResult> {
  try {
    // Prefer wallet eth_sendRawTransaction if present; else public RPC.
    const p = getInjectedProvider() as SigningProvider | null;
    if (p?.request && connectedChain() === "evm") {
      try {
        const hash = (await p.request({ method: "eth_sendRawTransaction", params: [rawTx] })) as string;
        if (hash) return { ok: true, sig: hash };
      } catch {
        /* fall through to public RPC */
      }
    }
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [rawTx] }),
    }).then((r) => r.json() as Promise<{ result?: string; error?: { message?: string } }>);
    if (res.error) return { ok: false, reason: res.error.message ?? "eth_sendRawTransaction failed" };
    if (!res.result) return { ok: false, reason: "no tx hash returned" };
    return { ok: true, sig: res.result };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
  }
}

async function submitSolanaClaim(claimTxB64: string, rpc: string): Promise<ClaimSubmitResult> {
  const p = getInjectedProvider() as SigningProvider | null;
  if (!p) return { ok: false, reason: "no wallet to sign with" };
  try {
    const { Transaction, Connection } = await import("@solana/web3.js");
    const bytes = Uint8Array.from(atob(claimTxB64), (c) => c.charCodeAt(0));
    const tx = Transaction.from(bytes);
    if (p.signAndSendTransaction) {
      const { signature } = await p.signAndSendTransaction(tx);
      return { ok: true, sig: signature };
    }
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
