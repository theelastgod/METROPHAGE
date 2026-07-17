import { describe, expect, it } from "vitest";
import { DISTRICT_CAST } from "./residentLife";
import { MAX_REPRINT_MEMORY, REPRINT_MEMORY_KEY, reprintMemoryCount, reprintMemoryTier, residentReprintWitnessLine } from "./reprintHistory";

describe("durable reprint memory", () => {
  it("caps one fixed stat at the final authored threshold", () => {
    expect(reprintMemoryCount({})).toBe(0);
    expect(reprintMemoryCount({ [REPRINT_MEMORY_KEY]: 500 })).toBe(MAX_REPRINT_MEMORY);
    expect([0, 2, 3, 9, 10, 24, 25, 500].map(reprintMemoryTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it("gives every recurring resident authored threshold-aware recognition", () => {
    for (const resident of DISTRICT_CAST) {
      expect(residentReprintWitnessLine(resident.id, 2), resident.id).toBeNull();
      const lines = [3, 10, 25].map((count) => residentReprintWitnessLine(resident.id, count));
      expect(lines.every(Boolean), resident.id).toBe(true);
      expect(new Set(lines).size, resident.id).toBe(3);
    }
  });
});
