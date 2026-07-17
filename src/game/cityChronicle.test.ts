import { describe, expect, it } from "vitest";
import { CHRONICLE_BOSS_KEY, CHRONICLE_CIVIC_CAP, buildCityChronicle, chronicleCivicKey, decodeChronicleBosses, decodeChronicleCivic, encodeChronicleBosses, encodeChronicleCivic } from "./cityChronicle";

describe("city chronicle", () => {
  it("reuses one bounded boss row across weeks", () => {
    expect(CHRONICLE_BOSS_KEY).toBe("chronicle_bosses");
    expect(decodeChronicleBosses(encodeChronicleBosses(120, 20_000), 120)).toBe(9_999);
    expect(decodeChronicleBosses(encodeChronicleBosses(119, 8), 120)).toBe(0);
  });

  it("reuses one bounded weekly civic row per district", () => {
    expect(chronicleCivicKey(3)).toBe("chronicle_civic_d3");
    expect(decodeChronicleCivic(encodeChronicleCivic(120, 20_000), 120)).toBe(CHRONICLE_CIVIC_CAP);
    expect(decodeChronicleCivic(encodeChronicleCivic(119, 8), 120)).toBe(0);
  });

  it("turns war, civic, boss, and Cell activity into sourced weekly copy", () => {
    const c = buildCityChronicle({ now: 1_700_000_000_000, warScores: [2, 7, 3, 1], civicMomentum: [1, 0, 4, 0, 0, 0, 0, 0], bossKills: 3, cellGoalsClaimed: 2, cellGoalProgress: 410, territory: [{ district: 0, controller: 2, flips: 3 }] });
    expect(c.lines).toHaveLength(4);
    expect(c.lines.join(" ")).toMatch(/QUIET PROTOCOL|UNFINISHED WAR/);
    expect(c.lines.join(" ")).toMatch(/public-operation/);
    expect(c.lines.join(" ")).toMatch(/this week/);
    expect(c.civic).toEqual([1, 0, 4, 0, 0, 0, 0, 0]);
    expect(c.territory[0]).toEqual({ district: 0, controller: 2, flips: 3 });
    expect(c.lines[0]).toMatch(/relay ledger|changed charter 3 times/);
    expect(c.lines.join(" ")).toMatch(/3 command/);
    expect(c.lines.join(" ")).toMatch(/2 Cells/);
  });
});
