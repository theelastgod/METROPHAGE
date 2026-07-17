import { describe, expect, it } from "vitest";
import { TERRITORY_FLIP_CAP, decodeTerritoryLegacy, encodeTerritoryLegacy, residentTerritoryLegacyLine, territoryLegacyKey, territoryLegacyLine } from "./territoryLegacy";
import { DISTRICT_CAST } from "./residentLife";

describe("daily territory legacy", () => {
  it("reuses one bounded row per district and expires logically by day", () => {
    expect(territoryLegacyKey(4)).toBe("territory_daily_d4");
    expect(decodeTerritoryLegacy(encodeTerritoryLegacy(20, 2, 500), 4, 20)).toEqual({ district: 4, controller: 2, flips: TERRITORY_FLIP_CAP });
    expect(decodeTerritoryLegacy(encodeTerritoryLegacy(19, 2, 7), 4, 20)).toEqual({ district: 4, controller: -1, flips: 0 });
  });

  it("preserves the latest controller independently from bounded flip count", () => {
    for (let faction = 0; faction < 4; faction++) {
      const record = decodeTerritoryLegacy(encodeTerritoryLegacy(30, faction, faction + 2), 1, 30);
      expect(record.controller).toBe(faction);
      expect(record.flips).toBe(faction + 2);
      expect(territoryLegacyLine(record, 30)).toMatch(/THE STACKS|charter changes/);
    }
  });

  it("lets every recurring resident critique all four Cell charters", () => {
    for (const resident of DISTRICT_CAST) {
      for (let controller = 0; controller < 4; controller++) {
        const line = residentTerritoryLegacyLine(resident.id, { district: resident.district, controller, flips: 1 });
        expect(line, `${resident.id}:${controller}`).toBeTruthy();
        expect(line!.length, `${resident.id}:${controller}`).toBeGreaterThan(90);
      }
    }
    expect(residentTerritoryLegacyLine("res_nix", { district: 1, controller: 0, flips: 1 })).toBeNull();
  });
});
