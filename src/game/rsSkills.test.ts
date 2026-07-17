import { describe, expect, it } from "vitest";
import { levelForXp, RS_SKILL_XP_CAP, skillAwardAmount, skillSnapshot, skillStatKey, xpForLevel } from "./rsSkills";

describe("authoritative profession progression", () => {
  it("has a monotonic 1–99 curve", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(50)).toBeGreaterThan(xpForLevel(49));
    expect(levelForXp(RS_SKILL_XP_CAP)).toBe(99);
  });

  it("sanitizes fixed skill counters from player stats", () => {
    expect(skillSnapshot({ skill_combat: 91.9, skill_trading: -8, skill_mining: Infinity })).toEqual({
      combat: 91,
      trading: 0,
      exploration: 0,
      crafting: 0,
      mining: 0,
    });
    expect(skillStatKey("exploration")).toBe("skill_exploration");
  });

  it("caps awards at level 99", () => {
    expect(skillAwardAmount({ skill_combat: RS_SKILL_XP_CAP - 4 }, "combat", 35)).toBe(4);
    expect(skillAwardAmount({ skill_combat: RS_SKILL_XP_CAP }, "combat", 35)).toBe(0);
  });
});
