import { describe, it, expect } from "vitest";
import { nextTreasuryNonce } from "./evm";

describe("nextTreasuryNonce", () => {
  it("uses the chain count on a cold ledger", () => {
    expect(nextTreasuryNonce(7, null)).toBe(7);
    expect(nextTreasuryNonce(0, null)).toBe(0);
    expect(nextTreasuryNonce(7, undefined)).toBe(7);
  });

  /**
   * The bug this exists to kill. `getTransactionCount(addr, "pending")` only
   * advances once a tx is BROADCAST, but the server signs a claim and hands it to
   * the client to broadcast — for up to claimTtlMs (10 min). Every claim built in
   * that window used to get the same nonce; only the first to land can confirm,
   * and the rest are permanently "nonce too low" with credits already debited.
   */
  it("never reissues a nonce while an earlier claim sits un-broadcast", () => {
    const chain = 5; // nothing broadcast yet — the chain stays at 5 all window
    const first = nextTreasuryNonce(chain, null);
    expect(first).toBe(5);

    // 31s later (cooldown is 30s, TTL is 600s) the same player cashes out again.
    const second = nextTreasuryNonce(chain, first);
    expect(second).toBe(6);
    expect(second).not.toBe(first);

    // ...and again, and again. Each must be unique.
    const third = nextTreasuryNonce(chain, second);
    expect(third).toBe(7);
    expect(new Set([first, second, third]).size).toBe(3);
  });

  it("follows the chain once claims actually land", () => {
    // Issued 5,6,7; all three broadcast and mined → chain now reports 8.
    expect(nextTreasuryNonce(8, 7)).toBe(8);
  });

  it("follows the chain when it runs ahead of our ledger", () => {
    // e.g. a nonce was burned by invalidateNonce, or the treasury sent a tx
    // outside this path — never hand out a nonce the chain has already consumed.
    expect(nextTreasuryNonce(20, 3)).toBe(20);
  });

  it("is monotonic across a full interleaved session", () => {
    // Claims are issued faster than they land; the chain lags behind.
    let last: number | null = null;
    let chain = 100;
    const issued: number[] = [];
    for (let i = 0; i < 25; i++) {
      const n = nextTreasuryNonce(chain, last);
      issued.push(n);
      last = n;
      if (i % 4 === 3) chain = n + 1; // an occasional claim gets broadcast
    }
    expect(new Set(issued).size).toBe(issued.length); // all unique
    for (let i = 1; i < issued.length; i++) {
      expect(issued[i]).toBeGreaterThan(issued[i - 1]); // strictly increasing
    }
  });

  it("survives junk without handing out a garbage nonce", () => {
    for (const bad of [NaN, Infinity, -Infinity, "x" as unknown as number]) {
      expect(nextTreasuryNonce(9, bad)).toBe(9); // unreadable ledger → trust chain
    }
    expect(nextTreasuryNonce(NaN, 4)).toBe(5); // unreadable chain → trust ledger
    expect(Number.isInteger(nextTreasuryNonce(3.7, 2.2))).toBe(true);
    expect(nextTreasuryNonce(-5, null)).toBe(0); // never negative
  });
});
