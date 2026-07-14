// METROPHAGE — claim submission for bridge withdrawals.
//
// Solana (primary): claimTx is base64 partial-signed; Phantom signs + sends (player pays fee).
// EVM (legacy): claimTx is a fully signed raw tx (treasury pays gas) via eth_sendRawTransaction.

import { getSolanaProvider, getEvmProvider, connectedChain } from "./wallet";

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
  const rpcs = [
    rpc,
    "https://rpc.testnet.chain.robinhood.com",
    "https://rpc.mainnet.chain.robinhood.com",
  ].filter((u, i, a) => u && a.indexOf(u) === i);

  try {
    const p = getEvmProvider();
    if (p?.request && connectedChain() === "evm") {
      try {
        const hash = (await p.request({ method: "eth_sendRawTransaction", params: [rawTx] })) as string;
        if (hash) return { ok: true, sig: hash };
      } catch {
        /* try public RPCs */
      }
    }
    let lastErr = "broadcast failed";
    for (const url of rpcs) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [rawTx] }),
        }).then((r) => r.json() as Promise<{ result?: string; error?: { message?: string } }>);
        if (res.result) return { ok: true, sig: res.result };
        if (res.error?.message) lastErr = res.error.message;
      } catch (e) {
        lastErr = String((e as Error)?.message ?? e);
      }
    }
    return { ok: false, reason: lastErr.slice(0, 160) };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
  }
}

async function submitSolanaClaim(claimTxB64: string, rpc: string): Promise<ClaimSubmitResult> {
  // CRITICAL: use Solana injector only — getInjectedProvider() can return MetaMask when both are installed.
  const p = getSolanaProvider();
  if (!p) return { ok: false, reason: "no Solana wallet — connect Phantom to sign the cash-out claim" };
  try {
    const { Transaction, Connection } = await import("@solana/web3.js");
    const bytes = Uint8Array.from(atob(claimTxB64), (c) => c.charCodeAt(0));
    const tx = Transaction.from(bytes);
    if (p.signAndSendTransaction) {
      const { signature } = await p.signAndSendTransaction(tx);
      if (!signature) return { ok: false, reason: "wallet returned empty signature" };
      return { ok: true, sig: signature };
    }
    if (p.signTransaction) {
      const signed = await p.signTransaction(tx);
      const conn = new Connection(rpc, "confirmed");
      const sig = await conn.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      // Wait for confirmation so /metro/withdraw/confirm can see the tx.
      try {
        const latest = await conn.getLatestBlockhash("confirmed");
        await conn.confirmTransaction({ signature: sig, ...latest }, "confirmed");
      } catch {
        /* confirm endpoint retries if RPC is lagging */
      }
      return { ok: true, sig };
    }
    return { ok: false, reason: "wallet cannot sign transactions" };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
  }
}
