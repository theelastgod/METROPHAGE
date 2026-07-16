import { describe, expect, it } from "vitest";
import { districtFieldMedic, FIELD_MEDICS, npcDef } from "./cityNpcs";

describe("district field medics", () => {
  it("rotates authored medics across every campaign district", () => {
    expect(new Set(Array.from({ length: 8 }, (_, i) => districtFieldMedic(i).id)).size).toBe(FIELD_MEDICS.length);
    for (let district = 0; district < 8; district++) {
      const medic = districtFieldMedic(district);
      expect(npcDef(medic.id)).toEqual(medic);
      expect(medic.lines.length).toBeGreaterThanOrEqual(2);
    }
  });
});
