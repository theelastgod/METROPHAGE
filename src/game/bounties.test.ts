import { describe, expect, it } from "vitest";
import { BOSS_BOUNTY_COOLDOWN_MS, bossBountyCooldownRemaining } from "./bounties";

describe("boss bounty cooldown", () => {
  it("blocks the same boss job for 24 hours", () => {
    const now = 1_800_000_000_000;
    expect(bossBountyCooldownRemaining(now, now)).toBe(BOSS_BOUNTY_COOLDOWN_MS);
    expect(bossBountyCooldownRemaining(now - BOSS_BOUNTY_COOLDOWN_MS + 1, now)).toBe(1);
    expect(bossBountyCooldownRemaining(now - BOSS_BOUNTY_COOLDOWN_MS, now)).toBe(0);
  });

  it("treats missing or invalid history as available", () => {
    expect(bossBountyCooldownRemaining(0)).toBe(0);
    expect(bossBountyCooldownRemaining(Number.NaN)).toBe(0);
  });
});
