// METROPHAGE — claim submission for bridge withdrawals.
//
// Worker always broadcasts Solana cash-outs. The client only accepts
// `solana-sent:<sig>` (or the sim harness prefix). Never broadcast a
// client-held signed tx — Solana blockhashes die in ~90s.

export interface ClaimSubmitResult {
  ok: boolean;
  sig?: string;
  reason?: string;
}

export async function submitClaim(claimTx: string, _rpc?: string): Promise<ClaimSubmitResult> {
  if (claimTx.startsWith("devnet-sim-claim:")) {
    return { ok: true, sig: `sim:${Date.now()}` };
  }
  if (claimTx.startsWith("solana-sent:")) {
    const sig = claimTx.slice("solana-sent:".length).trim();
    if (!sig) return { ok: false, reason: "empty treasury payout signature" };
    return { ok: true, sig };
  }
  return {
    ok: false,
    reason: "Worker broadcasts cash-outs — no client-held signed tx",
  };
}
