import { describe, expect, it } from "vitest";
import { resolveSettlementFamily, settlementForce, isEvmMint, isSolanaMint } from "./settlementFamily";

// A real base58 32-byte pubkey shape and a real 20-byte EVM address shape.
const SPL_MINT = "So11111111111111111111111111111111111111112";
const EVM_MINT = "0x1234567890abcdef1234567890abcdef12345678";

describe("mint shape detection", () => {
  it("separates 0x contracts from base58 mints", () => {
    expect(isEvmMint(EVM_MINT)).toBe(true);
    expect(isEvmMint(SPL_MINT)).toBe(false);
    expect(isSolanaMint(SPL_MINT)).toBe(true);
    expect(isSolanaMint(EVM_MINT)).toBe(false);
  });
});

describe("settlementForce", () => {
  it("defaults to solana when METRO_SETTLEMENT is unset or unknown", () => {
    expect(settlementForce({})).toBe("solana");
    expect(settlementForce({ METRO_SETTLEMENT: "" })).toBe("solana");
    expect(settlementForce({ METRO_SETTLEMENT: "nonsense" })).toBe("solana");
  });

  it("takes the EVM alternate only on an explicit force", () => {
    for (const f of ["robinhood", "rh", "evm", "ROBINHOOD"]) {
      expect(settlementForce({ METRO_SETTLEMENT: f })).toBe("robinhood");
    }
  });

  it("honours sol aliases and auto", () => {
    for (const f of ["solana", "sol", "spl"]) {
      expect(settlementForce({ METRO_SETTLEMENT: f })).toBe("solana");
    }
    expect(settlementForce({ METRO_SETTLEMENT: "auto" })).toBe("auto");
  });
});

describe("resolveSettlementFamily", () => {
  it("is off until a mint CA exists, whatever the force", () => {
    expect(resolveSettlementFamily(undefined, {})).toBe("off");
    expect(resolveSettlementFamily("", {})).toBe("off");
    expect(resolveSettlementFamily("", { METRO_SETTLEMENT: "robinhood" })).toBe("off");
    expect(resolveSettlementFamily("", { METRO_SETTLEMENT: "auto" })).toBe("off");
  });

  it("settles an SPL mint on Solana by default", () => {
    expect(resolveSettlementFamily(SPL_MINT, {})).toBe("solana");
    expect(resolveSettlementFamily(SPL_MINT, { METRO_SETTLEMENT: "solana" })).toBe("solana");
  });

  // The guard that matters: a mint from the wrong family must never silently
  // settle on the other chain. Off means credits-only, which is the safe state.
  it("refuses a 0x mint while Solana is authoritative", () => {
    expect(resolveSettlementFamily(EVM_MINT, {})).toBe("off");
    expect(resolveSettlementFamily(EVM_MINT, { METRO_SETTLEMENT: "solana" })).toBe("off");
  });

  it("refuses a base58 mint while the EVM alternate is forced", () => {
    expect(resolveSettlementFamily(SPL_MINT, { METRO_SETTLEMENT: "robinhood" })).toBe("off");
  });

  it("settles a 0x mint only on an explicit EVM force", () => {
    expect(resolveSettlementFamily(EVM_MINT, { METRO_SETTLEMENT: "robinhood" })).toBe("robinhood");
  });

  it("detects either family from mint shape under auto", () => {
    expect(resolveSettlementFamily(SPL_MINT, { METRO_SETTLEMENT: "auto" })).toBe("solana");
    expect(resolveSettlementFamily(EVM_MINT, { METRO_SETTLEMENT: "auto" })).toBe("robinhood");
    expect(resolveSettlementFamily("not-a-mint", { METRO_SETTLEMENT: "auto" })).toBe("off");
  });
});
