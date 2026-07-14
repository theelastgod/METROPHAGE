import { describe, expect, it } from "vitest";
import { currentDistrictWar, districtWarCoachLine, warMetaKey } from "./districtWar";

describe("districtWar", () => {
  it("returns a focus district and prize", () => {
    const w = currentDistrictWar(1_700_000_000_000);
    expect(w.focusDistrict).toBeGreaterThanOrEqual(0);
    expect(w.captureBonus).toBeGreaterThan(0);
    expect(w.weeklyPrize).toBeGreaterThan(0);
    expect(w.name).toMatch(/WAR/);
  });

  it("coach disappears after capture flag", () => {
    expect(districtWarCoachLine(false)).toMatch(/DISTRICT WAR|WAR/);
    expect(districtWarCoachLine(true)).toBeNull();
  });

  it("meta keys are stable", () => {
    expect(warMetaKey(3, 1)).toBe("war_w3_f1");
  });
});
