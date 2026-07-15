import { describe, it, expect } from "vitest";
import { publicPlayerKey } from "./protocol";

const WALLET = "w:0x8ba1f109551bD432803012645Ac136ddd64DBA72";

describe("publicPlayerKey", () => {
  it("is stable for the same id", async () => {
    expect(await publicPlayerKey(WALLET)).toBe(await publicPlayerKey(WALLET));
  });

  it("differs per id", async () => {
    const a = await publicPlayerKey(WALLET);
    const b = await publicPlayerKey("w:0x0000000000000000000000000000000000000001");
    const c = await publicPlayerKey("guest_runner");
    expect(new Set([a, b, c]).size).toBe(3);
  });

  /**
   * The point: /leaderboard is unauthenticated, and a wallet runner's player id
   * IS their on-chain address. Publishing it maps callsign → wallet → balances.
   */
  it("does not leak the address it was derived from", async () => {
    const k = await publicPlayerKey(WALLET);
    expect(k).not.toContain("0x");
    expect(k).not.toContain("8ba1f1");
    expect(k.toLowerCase()).not.toContain(WALLET.slice(2, 10).toLowerCase());
    expect(/^[0-9a-f]{16}$/.test(k)).toBe(true);
  });

  it("is case-sensitive on the id, so distinct rows stay distinct", async () => {
    expect(await publicPlayerKey(WALLET)).not.toBe(await publicPlayerKey(WALLET.toLowerCase()));
  });

  it("handles an empty id without throwing", async () => {
    expect(/^[0-9a-f]{16}$/.test(await publicPlayerKey(""))).toBe(true);
  });
});
