import { describe, expect, it } from "vitest";
import { simulatedSettlementLocked } from "./bridgePolicy";

describe("bridge mutation policy", () => {
  it("locks simulated settlement when the flag is absent", () => {
    expect(simulatedSettlementLocked("sim", undefined)).toBe(true);
    expect(simulatedSettlementLocked("sim", "0")).toBe(true);
  });

  it("allows simulation only for the explicit local harness flag", () => {
    expect(simulatedSettlementLocked("sim", "1")).toBe(false);
    expect(simulatedSettlementLocked("sim", "true")).toBe(true);
  });

  it("never blocks a live settlement", () => {
    expect(simulatedSettlementLocked("evm", undefined)).toBe(false);
    expect(simulatedSettlementLocked("solana", undefined)).toBe(false);
  });
});
