import { describe, expect, it } from "vitest";
import { currentGuildWeek, guildGoalProgressKey, weeklyGuildGoal } from "./guildGoals";

describe("guildGoals", () => {
  it("returns a stable weekly goal with required fields", () => {
    const g = weeklyGuildGoal(1_700_000_000_000);
    expect(g.id).toBeTruthy();
    expect(g.target).toBeGreaterThan(0);
    expect(g.rewardCredits).toBeGreaterThan(0);
    expect(["kills", "bosses", "captures", "deposits"]).toContain(g.stat);
  });

  it("is stable within a week and keys by week+goal", () => {
    const t0 = 1_700_000_000_000;
    const week = currentGuildWeek(t0);
    // Stay inside the same week index (day-of-week remainder * day).
    const dayMs = 86_400_000;
    let tSame = t0;
    for (let i = 0; i < 6; i++) {
      const t = t0 + i * dayMs;
      if (currentGuildWeek(t) === week) tSame = t;
    }
    const a = weeklyGuildGoal(t0);
    const b = weeklyGuildGoal(tSame);
    expect(a.id).toBe(b.id);
    expect(guildGoalProgressKey(a.id, week)).toContain(a.id);
    expect(guildGoalProgressKey(a.id, week)).toContain(String(week));
  });
});
