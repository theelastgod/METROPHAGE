import { describe, expect, it } from "vitest";
import { GOD_WALLETS, isGodAccount, normalizeWalletAddress } from "./godAccounts";

describe("Solana operator allowlist", () => {
  const operator = "9Z9uZJXdnyTE7gkFfrepJ3BWDTNA3ZeteDkpgT6cxkve";

  it("contains only the authorized wallet", () => {
    expect(GOD_WALLETS).toEqual([operator]);
  });

  it("accepts raw and persisted wallet player ids", () => {
    expect(isGodAccount(operator)).toBe(true);
    expect(isGodAccount(`w:${operator}`)).toBe(true);
  });

  it("rejects old EVM operators, malformed ids, and other Solana wallets", () => {
    expect(isGodAccount("0x7bf8195c181fbb74d10aed7035c26eca18ea726d")).toBe(false);
    expect(isGodAccount("11111111111111111111111111111111")).toBe(false);
    expect(isGodAccount("guest_runner")).toBe(false);
    expect(normalizeWalletAddress("w:not-a-wallet")).toBeNull();
  });
});
