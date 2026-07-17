import { describe, expect, it } from "vitest";
import { DISTRICTS } from "./districts";
import {
  DISTRICT_LIFE,
  dailyDistrictOperation,
  districtDossier,
  districtCivicRoleLine,
  districtMapSummary,
  districtRumorLine,
  civicMomentumFromMeta,
  civicMomentumKey,
  decodeCivicMomentum,
  districtAftermath,
  districtEventContext,
  encodeCivicMomentum,
  districtOperationKey,
  districtSituationLine,
} from "./districtLife";

describe("districtLife", () => {
  it("keeps one authored dossier and three operations per district", () => {
    expect(DISTRICT_LIFE).toHaveLength(DISTRICTS.length);
    for (const life of DISTRICT_LIFE) {
      expect(life.history.length).toBeGreaterThan(40);
      expect(life.operations).toHaveLength(3);
      expect(new Set(life.operations.map((o) => o.id)).size).toBe(3);
    }
  });

  it("encodes bounded daily civic momentum in one reusable meta row", () => {
    expect(decodeCivicMomentum(encodeCivicMomentum(20_000, 99), 20_000)).toBe(9);
    expect(decodeCivicMomentum(encodeCivicMomentum(19_999, 7), 20_000)).toBe(0);
    expect(civicMomentumFromMeta({ [civicMomentumKey(2)]: encodeCivicMomentum(20_000, 4) }, 2, 20_000)).toBe(4);
  });

  it("turns repeated completions into aftermath that shortens, but does not remove, events", () => {
    expect(districtAftermath(0, 20_000, 0).stage).toBe("need");
    expect(districtAftermath(0, 20_000, 3).stage).toBe("network");
    expect(districtAftermath(0, 20_000, 9).eventDurationMult).toBe(0.85);
    expect(districtEventContext(0, "BLACKOUT", 20_000, 3)).toMatch(/cuts the crisis window 10%/);
    expect(districtCivicRoleLine("field_medic_patch", 0, 20_000, 3)).toMatch(/treating defenders/);
    expect(districtCivicRoleLine("field_medic_patch", 0, 20_000, 0)).toBeNull();
  });

  it("rotates deterministically and produces stable persistence keys", () => {
    const a = dailyDistrictOperation(3, 20_000);
    expect(dailyDistrictOperation(3, 20_000)).toEqual(a);
    expect(districtOperationKey(3, 20_000)).toContain(`civic_d3_20000_${a.id}`);
    expect(dailyDistrictOperation(3, 20_001).id).not.toBe(a.id);
  });

  it("joins authored stakes to the mechanical daily condition", () => {
    expect(districtSituationLine(0, 20_000)).toMatch(/PUBLIC OP:/);
    const dossier = districtDossier(7, 20_000);
    expect(dossier).toMatch(/POWER:/);
    expect(dossier).toMatch(/TODAY:/);
    expect(dossier).toMatch(/Reward ₵/);
    expect(districtMapSummary(7, 20_000)).toMatch(/PUBLIC OP/);
    expect(districtRumorLine(7, 20_000, 3)).toBe(DISTRICT_LIFE[7].hiddenTruth);
    expect(districtRumorLine(7, 20_000, 1, 3)).toBe(districtAftermath(7, 20_000, 3).line);
  });
});
