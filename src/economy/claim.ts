// METROPHAGE — claim submission for bridge withdrawals (EVM-only build).
//
// claimTx is a fully signed raw Robinhood Chain tx (0x…) that the client
// broadcasts via eth_sendRawTransaction — through the connected wallet first,
// then the public RPCs. The Solana claim path lives on `settlement/solana`.

import { getEvmProvider, connectedChain } from "./wallet";

export interface ClaimSubmitResult {
  ok: boolean;
  sig?: string;
  reason?: string;
}

/** Broadcast an EVM raw claim tx. */
export async function submitClaim(claimTx: string, rpc: string): Promise<ClaimSubmitResult> {
  // Sim harness.
  if (claimTx.startsWith("devnet-sim-claim:")) {
    return { ok: true, sig: `sim:${Date.now()}` };
  }
  // EVM signed raw txs start with 0x.
  if (claimTx.startsWith("0x") && claimTx.length > 100) {
    return broadcastEvmRaw(claimTx, rpc);
  }
  return { ok: false, reason: "unrecognized claim payload (this build settles on Robinhood Chain only)" };
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
