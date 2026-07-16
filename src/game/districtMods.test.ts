import { describe, expect, it } from "vitest";
import { dailyDistrictMod, districtBarIntelLine } from "./districtMods";

describe("district bar intelligence", () => {
  it("reports the exact deterministic daily payout condition in character", () => {
    for (let district = 0; district < 8; district++) {
      for (const day of [0, 1, 37]) {
        const mod = dailyDistrictMod(district, day);
        const line = districtBarIntelLine(district, day);
        const pct = Math.round(Math.abs(mod.creditMult - 1) * 100);
        expect(line).toContain(`${pct}%`);
        expect(line.length).toBeGreaterThan(35);
      }
    }
  });
});
