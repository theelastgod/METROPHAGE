export type BridgeSettlementKind = "sim" | "evm" | "solana";

/**
 * Simulated settlement trusts client-supplied amounts and is therefore read-only
 * unless a local harness explicitly opts in. Live chain settlement is unaffected.
 */
export function simulatedSettlementLocked(kind: BridgeSettlementKind, allowSim: string | undefined): boolean {
  return kind === "sim" && allowSim !== "1";
}
