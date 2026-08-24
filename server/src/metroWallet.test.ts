import { describe, expect, it } from "vitest";
import { isValidWallet, BRIDGE, POOL_EMPTY_USER_MSG } from "./metro";

describe("Solana wallet + claim TTL", () => {
  it("accepts a 32-byte base58 pubkey and rejects 0x", () => {
    expect(isValidWallet("11111111111111111111111111111111")).toBe(true);
    expect(isValidWallet("So11111111111111111111111111111111111111112")).toBe(true);
    expect(isValidWallet("0x1234567890abcdef1234567890abcdef12345678")).toBe(false);
    expect(isValidWallet("not-a-wallet")).toBe(false);
  });

  it("keeps claim TTL inside Solana blockhash lifetime", () => {
    expect(BRIDGE.claimTtlMs).toBe(2 * 60_000);
    expect(POOL_EMPTY_USER_MSG).toBe("Check back later.");
  });
});
