import { describe, expect, it } from "vitest";
import { resolveSettlementFamily, settlementForce, isEvmMint, isSolanaMint } from "./settlementFamily";

// A real 20-byte EVM address shape and a real base58 32-byte pubkey shape.
const EVM_MINT = "0x1234567890abcdef1234567890abcdef12345678";
const SPL_MINT = "So11111111111111111111111111111111111111112";

describe("mint shape detection", () => {
  it("separates 0x contracts from base58 mints", () => {
    expect(isEvmMint(EVM_MINT)).toBe(true);
    expect(isEvmMint(SPL_MINT)).toBe(false);
    expect(isSolanaMint(SPL_MINT)).toBe(true);
    expect(isSolanaMint(EVM_MINT)).toBe(false);
  });
});

describe("settlementForce", () => {
  it("defaults to robinhood when METRO_SETTLEMENT is unset or unknown", () => {
    expect(settlementForce({})).toBe("robinhood");
    expect(settlementForce({ METRO_SETTLEMENT: "" })).toBe("robinhood");
    expect(settlementForce({ METRO_SETTLEMENT: "nonsense" })).toBe("robinhood");
  });

  it("takes the Solana alternate only on an explicit force", () => {
    for (const f of ["solana", "sol", "spl", "SOLANA"]) {
      expect(settlementForce({ METRO_SETTLEMENT: f })).toBe("solana");
    }
  });

  it("honours robinhood aliases and auto", () => {
    for (const f of ["robinhood", "rh", "evm"]) {
      expect(settlementForce({ METRO_SETTLEMENT: f })).toBe("robinhood");
    }
    expect(settlementForce({ METRO_SETTLEMENT: "auto" })).toBe("auto");
  });
});

describe("resolveSettlementFamily", () => {
  it("is off until a mint CA exists, whatever the force", () => {
    expect(resolveSettlementFamily(undefined, {})).toBe("off");
    expect(resolveSettlementFamily("", {})).toBe("off");
    expect(resolveSettlementFamily("", { METRO_SETTLEMENT: "solana" })).toBe("off");
    expect(resolveSettlementFamily("", { METRO_SETTLEMENT: "auto" })).toBe("off");
  });

  it("settles a 0x mint on Robinhood by default", () => {
    expect(resolveSettlementFamily(EVM_MINT, {})).toBe("robinhood");
    expect(resolveSettlementFamily(EVM_MINT, { METRO_SETTLEMENT: "robinhood" })).toBe("robinhood");
  });

  // The guard that matters: a mint from the wrong family must never silently
  // settle on the other chain. Off means credits-only, which is the safe state.
  it("refuses a base58 mint while Robinhood is authoritative", () => {
    expect(resolveSettlementFamily(SPL_MINT, {})).toBe("off");
    expect(resolveSettlementFamily(SPL_MINT, { METRO_SETTLEMENT: "robinhood" })).toBe("off");
  });

  it("settles an SPL mint only on an explicit Solana force", () => {
    expect(resolveSettlementFamily(SPL_MINT, { METRO_SETTLEMENT: "solana" })).toBe("solana");
  });

  it("detects either family from mint shape under auto", () => {
    expect(resolveSettlementFamily(EVM_MINT, { METRO_SETTLEMENT: "auto" })).toBe("robinhood");
    expect(resolveSettlementFamily(SPL_MINT, { METRO_SETTLEMENT: "auto" })).toBe("solana");
    expect(resolveSettlementFamily("not-a-mint", { METRO_SETTLEMENT: "auto" })).toBe("off");
  });
});
