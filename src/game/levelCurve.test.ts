import { describe, it, expect } from "vitest";
import { levelMods, levelPowerLabel, LEVEL_SOFT_CAP } from "./levelCurve";
import { PLAYER_HP } from "../net/sim";
import { progressionForDistrict } from "./progression";

describe("levelMods", () => {
  it("gives a fresh Blank exactly the baseline — no hidden L1 bonus", () => {
    const m = levelMods(1);
    expect(m.hpAdd).toBe(0);
    expect(m.dmgPct).toBe(0);
  });

  it("grows HP and damage monotonically up to the cap", () => {
    let prevHp = -1;
    let prevDmg = -1;
    for (let lv = 1; lv <= LEVEL_SOFT_CAP; lv++) {
      const m = levelMods(lv);
      expect(m.hpAdd!).toBeGreaterThan(prevHp);
      expect(m.dmgPct!).toBeGreaterThan(prevDmg);
      prevHp = m.hpAdd!;
      prevDmg = m.dmgPct!;
    }
  });

  it("stops granting raw power past the soft cap", () => {
    const cap = levelMods(LEVEL_SOFT_CAP);
    for (const lv of [LEVEL_SOFT_CAP + 1, 99, 500]) {
      expect(levelMods(lv).hpAdd).toBe(cap.hpAdd);
      expect(levelMods(lv).dmgPct).toBe(cap.dmgPct);
    }
  });

  it("survives junk input rather than producing NaN", () => {
    for (const bad of [0, -5, NaN, undefined as unknown as number]) {
      const m = levelMods(bad);
      expect(Number.isFinite(m.hpAdd!)).toBe(true);
      expect(Number.isFinite(m.dmgPct!)).toBe(true);
      expect(m.hpAdd).toBe(0);
    }
  });

  // The server previously inlined these two formulas. Folding them into the
  // ModBag must not move a single number — these pin the old behaviour.
  describe("folded from the old inline server formulas", () => {
    it("reproduces critChance = min(0.05 + level*0.012, 0.3)", () => {
      for (let lv = 1; lv <= 60; lv++) {
        const BASE_CRIT = 0.05;
        const old = Math.min(BASE_CRIT + lv * 0.012, 0.3);
        const now = BASE_CRIT + levelMods(lv).critPct!;
        expect(now, `level ${lv}`).toBeCloseTo(old, 10);
      }
    });

    it("reproduces lifesteal = min(level*0.004, 0.08)", () => {
      for (let lv = 1; lv <= 60; lv++) {
        const old = Math.min(lv * 0.004, 0.08);
        expect(levelMods(lv).lifestealPct!, `level ${lv}`).toBeCloseTo(old, 10);
      }
    });
  });
});

describe("level curve vs the enemy curve", () => {
  it("keeps a rookie in the d0 band alive against d0 damage", () => {
    // d0 is the teaching rung — a L1 Blank must not be one-shot fodder.
    expect(progressionForDistrict(0).enemyDmgMult).toBeLessThan(1);
    expect(levelMods(1).hpAdd).toBe(0);
  });

  it("roughly matches d7 effective HP to the d7 damage ramp", () => {
    // At the low end of d7's recommended band (LV 22), a runner's HP should
    // have grown at least as fast as enemy damage — else the act is a wall.
    const band = progressionForDistrict(7).recLevel[0];
    const hpAt = PLAYER_HP + levelMods(band).hpAdd!;
    const hpRatio = hpAt / PLAYER_HP;
    expect(hpRatio).toBeGreaterThan(progressionForDistrict(7).enemyDmgMult);
  });

  it("does NOT let levels alone out-scale d7 enemy HP — gear must matter", () => {
    // Deliberate: the level floor keeps you fighting, it doesn't win the fight.
    const dmgRatio = 1 + levelMods(progressionForDistrict(7).recLevel[1]).dmgPct!;
    expect(dmgRatio).toBeLessThan(progressionForDistrict(7).enemyHpMult);
  });
});

describe("levelPowerLabel", () => {
  it("reads as a character-sheet line", () => {
    expect(levelPowerLabel(1)).toBe("+0 HP · +0% DMG · +1% CRIT");
    expect(levelPowerLabel(25)).toContain("+144 HP");
  });
});
