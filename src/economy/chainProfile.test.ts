import { describe, expect, it } from "vitest";
import { isEvmAddress, resolveSettlementFamily } from "./chainProfile";
import { isSolanaPubkey } from "./solanaChain";

const SPL_MINT = "So11111111111111111111111111111111111111112";
const EVM_MINT = "0x1234567890abcdef1234567890abcdef12345678";

describe("chainProfile mint shape", () => {
  it("treats pump.fun CA as base58, never as a lowercased 0x", () => {
    expect(isSolanaPubkey(SPL_MINT)).toBe(true);
    expect(isEvmAddress(SPL_MINT)).toBe(false);
    expect(isEvmAddress(EVM_MINT)).toBe(true);
    expect(SPL_MINT === SPL_MINT.toLowerCase()).toBe(false);
  });

  it("resolves a base58 mint to solana under the default force", () => {
    expect(resolveSettlementFamily(SPL_MINT).family).toBe("solana");
    expect(resolveSettlementFamily("").family).toBe("off");
    expect(resolveSettlementFamily(EVM_MINT).family).toBe("off");
  });
});
