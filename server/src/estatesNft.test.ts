import { describe, expect, it } from "vitest";
import {
  canHoldGenesisKey,
  GUEST_KEY_MSG,
  isMarketplaceOwner,
  MARKETPLACE_OWNERS,
  tokenForZone,
} from "./estatesNft";

describe("Genesis Key deed helpers", () => {
  it("rejects guests and accepts a Solana wallet player id", () => {
    expect(canHoldGenesisKey("g:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")).toBe(false);
    expect(canHoldGenesisKey("w:9Z9uZJXdnyTE7gkFfrepJ3BWDTNA3ZeteDkpgT6cxkve")).toBe(true);
    expect(GUEST_KEY_MSG).toMatch(/Phantom/i);
  });

  it("flags known marketplace escrow programs", () => {
    expect(isMarketplaceOwner("M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K")).toBe(true);
    expect(isMarketplaceOwner("9Z9uZJXdnyTE7gkFfrepJ3BWDTNA3ZeteDkpgT6cxkve")).toBe(false);
    expect(MARKETPLACE_OWNERS.size).toBeGreaterThan(3);
  });

  it("derives token from estate zone", () => {
    expect(tokenForZone("est0")).toBe(1);
    expect(tokenForZone("est49")).toBe(50);
    expect(tokenForZone("estates")).toBeNull();
  });
});
