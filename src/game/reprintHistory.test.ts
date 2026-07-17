import { describe, expect, it } from "vitest";
import { DISTRICT_CAST } from "./residentLife";
import { MAX_REPRINT_MEMORY, MAX_REPRINT_STAMPS, REPRINT_MEMORY_KEY, REPRINT_STAMP_KEY, nextReprintMemory, reprintMemorialLine, reprintMemoryCount, reprintMemoryTier, reprintStampCount, reprintStampTier, residentReprintWitnessLine } from "./reprintHistory";

describe("durable reprint memory", () => {
  it("caps one fixed stat at the final authored threshold", () => {
    expect(reprintMemoryCount({})).toBe(0);
    expect(reprintMemoryCount({ [REPRINT_MEMORY_KEY]: 500 })).toBe(MAX_REPRINT_MEMORY);
    expect([0, 2, 3, 9, 10, 24, 25, 500].map(reprintMemoryTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(nextReprintMemory(0)).toBe(1);
    expect(nextReprintMemory(24)).toBe(25);
    expect(nextReprintMemory(25)).toBe(25);
  });

  it("gives every recurring resident authored threshold-aware recognition", () => {
    for (const resident of DISTRICT_CAST) {
      expect(residentReprintWitnessLine(resident.id, 2), resident.id).toBeNull();
      const lines = [3, 10, 25].map((count) => residentReprintWitnessLine(resident.id, count));
      expect(lines.every(Boolean), resident.id).toBe(true);
      expect(new Set(lines).size, resident.id).toBe(3);
    }
  });

  it("turns the voluntary sink into a bounded, visible memorial record", () => {
    expect(reprintStampCount({ [REPRINT_STAMP_KEY]: 500 })).toBe(MAX_REPRINT_STAMPS);
    expect([0, 1, 2, 3, 6, 7, 9].map(reprintStampTier)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    for (const id of ["marek", ...DISTRICT_CAST.map((resident) => resident.id)]) {
      const lines = [1, 3, 7].map((count) => reprintMemorialLine(id, count));
      expect(lines.every(Boolean), id).toBe(true);
      expect(new Set(lines).size, id).toBe(3);
    }
  });
});
