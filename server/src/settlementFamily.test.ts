import { describe, expect, it } from "vitest";
import { resolveSettlementFamily, settlementForce, isEvmMint, isSolanaMint } from "./settlementFamily";

const SPL_MINT = "So11111111111111111111111111111111111111112";
const EVM_MINT = "0x1234567890abcdef1234567890abcdef12345678";

describe("mint shape detection", () => {
  it("separates 0x contracts from base58 mints without folding case", () => {
    expect(isEvmMint(EVM_MINT)).toBe(true);
    expect(isEvmMint(SPL_MINT)).toBe(false);
    expect(isSolanaMint(SPL_MINT)).toBe(true);
    expect(isSolanaMint(EVM_MINT)).toBe(false);
    expect(SPL_MINT === SPL_MINT.toLowerCase()).toBe(false);
  });
});

describe("settlementForce", () => {
  it("defaults to solana when METRO_SETTLEMENT is unset or unknown", () => {
    expect(settlementForce({})).toBe("solana");
    expect(settlementForce({ METRO_SETTLEMENT: "" })).toBe("solana");
    expect(settlementForce({ METRO_SETTLEMENT: "nonsense" })).toBe("solana");
  });

  it("maps EVM aliases and off to off (no live ERC-20 adapter)", () => {
    for (const f of ["robinhood", "rh", "evm", "ROBINHOOD", "off"]) {
      expect(settlementForce({ METRO_SETTLEMENT: f })).toBe("off");
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
    expect(resolveSettlementFamily("", { METRO_SETTLEMENT: "solana" })).toBe("off");
    expect(resolveSettlementFamily("", { METRO_SETTLEMENT: "auto" })).toBe("off");
  });

  it("settles an SPL mint on Solana by default", () => {
    expect(resolveSettlementFamily(SPL_MINT, {})).toBe("solana");
    expect(resolveSettlementFamily(SPL_MINT, { METRO_SETTLEMENT: "solana" })).toBe("solana");
    expect(resolveSettlementFamily(SPL_MINT, { METRO_SETTLEMENT: "auto" })).toBe("solana");
  });

  it("refuses a 0x mint under every force (EVM is not a live path)", () => {
    expect(resolveSettlementFamily(EVM_MINT, {})).toBe("off");
    expect(resolveSettlementFamily(EVM_MINT, { METRO_SETTLEMENT: "solana" })).toBe("off");
    expect(resolveSettlementFamily(EVM_MINT, { METRO_SETTLEMENT: "robinhood" })).toBe("off");
    expect(resolveSettlementFamily(EVM_MINT, { METRO_SETTLEMENT: "auto" })).toBe("off");
  });

  it("stays off for garbage mint strings", () => {
    expect(resolveSettlementFamily("not-a-mint", { METRO_SETTLEMENT: "auto" })).toBe("off");
    expect(resolveSettlementFamily("not-a-mint", { METRO_SETTLEMENT: "solana" })).toBe("off");
  });
});
