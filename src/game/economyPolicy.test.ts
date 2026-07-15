import { describe, expect, it } from "vitest";
import {
  METRO_DEV_SEED_METRO,
  TARGET_PLAYERS,
  BASE_WITHDRAW_CREDITS,
  resolveEconomyPolicy,
  populationTier,
  nextPopThreshold,
  POP_THRESHOLDS,
} from "./economyPolicy";

describe("economyPolicy — unlimited earn/WD + pop rate tiers", () => {
  it("seeds 10M METRO (1% of 1B)", () => {
    expect(METRO_DEV_SEED_METRO).toBe(10_000_000);
    expect(TARGET_PLAYERS).toBe(500);
    expect(POP_THRESHOLDS).toEqual([500, 1000, 1500, 2500]);
  });

  it("maps player counts to tiers at each threshold", () => {
    expect(populationTier(500).id).toBe("launch");
    expect(populationTier(501).id).toBe("growth");
    expect(populationTier(1001).id).toBe("scale");
    expect(populationTier(1501).id).toBe("mass");
    expect(populationTier(2501).id).toBe("mega");
  });

  it("never imposes daily earn or daily withdraw caps", () => {
    for (const n of [500, 1000, 1500, 2500, 5000]) {
      const p = resolveEconomyPolicy({
        poolMetro: METRO_DEV_SEED_METRO,
        circulatingCredits: 100_000,
        activePlayers: n,
        seedMetro: METRO_DEV_SEED_METRO,
      });
      expect(p.dailyEmitCap).toBe(0);
      expect(p.dailyWithdrawCapCredits).toBe(0);
      expect(p.globalDailyWithdrawMetro).toBeGreaterThan(1e12);
    }
  });

  it("widens cash-out spread as population exceeds each tier", () => {
    const base = {
      poolMetro: METRO_DEV_SEED_METRO,
      circulatingCredits: 100_000,
      seedMetro: METRO_DEV_SEED_METRO,
    };
    const at500 = resolveEconomyPolicy({ ...base, activePlayers: 500 });
    const at1000 = resolveEconomyPolicy({ ...base, activePlayers: 1000 });
    const at2501 = resolveEconomyPolicy({ ...base, activePlayers: 2501 });
    expect(at500.withdrawCreditsPerMetro).toBeGreaterThanOrEqual(BASE_WITHDRAW_CREDITS);
    expect(at1000.withdrawCreditsPerMetro).toBeGreaterThan(at500.withdrawCreditsPerMetro);
    expect(at2501.withdrawCreditsPerMetro).toBeGreaterThan(at1000.withdrawCreditsPerMetro);
  });

  it("crisis widens spread but still no daily caps", () => {
    const p = resolveEconomyPolicy({
      poolMetro: 100,
      circulatingCredits: 5_000_000,
      activePlayers: 500,
      seedMetro: METRO_DEV_SEED_METRO,
    });
    expect(p.phase).toBe("crisis");
    expect(p.dailyEmitCap).toBe(0);
    expect(p.dailyWithdrawCapCredits).toBe(0);
    expect(p.withdrawCreditsPerMetro).toBeGreaterThanOrEqual(200);
  });

  it("next threshold steps correctly", () => {
    expect(nextPopThreshold(100)).toBe(500);
    expect(nextPopThreshold(501)).toBe(1000);
    expect(nextPopThreshold(2501)).toBe(null);
  });

  it("scales credits-per-$METRO with market USD price", () => {
    const base = {
      poolMetro: METRO_DEV_SEED_METRO,
      circulatingCredits: 100_000,
      activePlayers: 500,
      seedMetro: METRO_DEV_SEED_METRO,
    };
    const at1 = resolveEconomyPolicy({ ...base, metroUsd: 1, priceSource: "test" });
    const at2 = resolveEconomyPolicy({ ...base, metroUsd: 2, priceSource: "test" });
    const atHalf = resolveEconomyPolicy({ ...base, metroUsd: 0.5, priceSource: "test" });
    expect(at1.priceMult).toBeCloseTo(1, 5);
    expect(at2.priceMult).toBeCloseTo(2, 5);
    expect(atHalf.priceMult).toBeCloseTo(0.5, 5);
    // Higher USD price → more credits per $METRO both ways (spread preserved)
    expect(at2.depositCreditsPerMetro).toBeGreaterThan(at1.depositCreditsPerMetro);
    expect(at2.withdrawCreditsPerMetro).toBeGreaterThan(at1.withdrawCreditsPerMetro);
    expect(atHalf.depositCreditsPerMetro).toBeLessThan(at1.depositCreditsPerMetro);
    // Round-trip still retains house edge (deposit < withdraw rate)
    expect(at2.depositCreditsPerMetro).toBeLessThan(at2.withdrawCreditsPerMetro);
  });
});
