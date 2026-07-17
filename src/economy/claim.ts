// METROPHAGE — claim submission for bridge withdrawals.
//
// Solana (primary):
//   - `solana-sent:<sig>` — Worker already broadcast a treasury-paid payout (no player SOL)
//   - fully signed base64 tx (treasury fee-payer) — client just sends raw
//   - partially signed base64 (player fee-payer fallback) — Phantom signs + sends
// EVM (legacy): claimTx is a fully signed raw tx via eth_sendRawTransaction.

import { ensureSolanaProvider, getEvmProvider, connectedChain } from "./wallet";

export interface ClaimSubmitResult {
  ok: boolean;
  sig?: string;
  reason?: string;
}

/** Sign + submit (Solana) or broadcast (EVM raw) a claim. */
export async function submitClaim(claimTx: string, rpc: string): Promise<ClaimSubmitResult> {
  // Sim harness.
  if (claimTx.startsWith("devnet-sim-claim:")) {
    return { ok: true, sig: `sim:${Date.now()}` };
  }
  // Server already broadcast treasury-paid Solana cash-out.
  if (claimTx.startsWith("solana-sent:")) {
    const sig = claimTx.slice("solana-sent:".length).trim();
    if (!sig) return { ok: false, reason: "empty treasury payout signature" };
    return { ok: true, sig };
  }
  // EVM signed raw txs start with 0x.
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
  try {
    const { Transaction, Connection } = await import("@solana/web3.js");
    const bytes = Uint8Array.from(atob(claimTxB64), (c) => c.charCodeAt(0));
    const tx = Transaction.from(bytes);
    const conn = new Connection(rpc, "confirmed");

    // Fully signed treasury-paid cash-out — broadcast only (player needs no SOL / no sign).
    const sigs = tx.signatures ?? [];
    const allPresent = sigs.length > 0 && sigs.every((s) => s.signature != null);
    if (allPresent) {
      try {
        const sig = await conn.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
        try {
          const latest = await conn.getLatestBlockhash("confirmed");
          await conn.confirmTransaction({ signature: sig, ...latest }, "confirmed");
        } catch {
          /* confirm endpoint retries */
        }
        return { ok: true, sig };
      } catch (e) {
        return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
      }
    }

    // Partial-signed (player fee-payer fallback) — needs Phantom.
    const p = await ensureSolanaProvider();
    if (!p) return { ok: false, reason: "no Solana wallet — connect Phantom (treasury will pay fees when funded)" };
    if (p.signAndSendTransaction) {
      const { signature } = await p.signAndSendTransaction(tx);
      if (!signature) return { ok: false, reason: "wallet returned empty signature" };
      return { ok: true, sig: signature };
    }
    if (p.signTransaction) {
      const signed = await p.signTransaction(tx);
      const sig = await conn.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
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
