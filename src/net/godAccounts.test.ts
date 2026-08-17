import { describe, expect, it } from "vitest";
import { GOD_WALLETS, isGodAccount, normalizeWalletAddress } from "./godAccounts";

describe("operator allowlist", () => {
  const evmOperator = "0x7bf8195c181fbb74d10aed7035c26eca18ea726d";
  const solOperator = "9Z9uZJXdnyTE7gkFfrepJ3BWDTNA3ZeteDkpgT6cxkve";

  it("contains only the authorized EVM wallet", () => {
    expect(GOD_WALLETS).toEqual([evmOperator]);
  });

  it("accepts raw and persisted wallet player ids for the EVM operator", () => {
    expect(isGodAccount(evmOperator)).toBe(true);
    expect(isGodAccount(`w:${evmOperator}`)).toBe(true);
    // Checksummed / uppercase forms normalize to the same lowercase address.
    expect(isGodAccount(`w:0x${evmOperator.slice(2).toUpperCase()}`)).toBe(true);
  });

  it("does not accept the Solana operator on the EVM-only build", () => {
    expect(isGodAccount(solOperator)).toBe(false);
    expect(isGodAccount(`w:${solOperator}`)).toBe(false);
    expect(normalizeWalletAddress(solOperator)).toBeNull();
  });

  it("rejects malformed ids and other wallets", () => {
    expect(isGodAccount("0x0000000000000000000000000000000000000001")).toBe(false);
    expect(isGodAccount("11111111111111111111111111111111")).toBe(false);
    expect(isGodAccount("guest_runner")).toBe(false);
    expect(normalizeWalletAddress("w:not-a-wallet")).toBeNull();
  });
});
