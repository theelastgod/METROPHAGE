import { describe, expect, it } from "vitest";
import { FRAGMENTS, MEMORY_INTERPRETATIONS, districtMemoryInterpretation, memoryInterpretations, newlyUnlockedMemoryInterpretations, normalizeFragmentSequence } from "./fragments";

describe("authoritative memory sequence", () => {
  it("normalizes unknown and duplicate ids without losing recovery order", () => {
    expect(normalizeFragmentSequence(["bad", "frag_the_wake", "frag_first_boot", "frag_the_wake"]))
      .toEqual(["frag_the_wake", "frag_first_boot"]);
  });

  it("authors one valid order-sensitive synthesis for every district", () => {
    expect(MEMORY_INTERPRETATIONS).toHaveLength(8);
    expect(new Set(MEMORY_INTERPRETATIONS.map((i) => i.district)).size).toBe(8);
    const valid = new Set(FRAGMENTS.map((f) => f.id));
    for (const i of MEMORY_INTERPRETATIONS) {
      expect(valid.has(i.requires[0]), i.id).toBe(true);
      expect(valid.has(i.requires[1]), i.id).toBe(true);
      expect(i.forward.length, i.id).toBeGreaterThan(90);
      expect(i.reverse.length, i.id).toBeGreaterThan(90);
      expect(i.forward, i.id).not.toBe(i.reverse);
    }
  });

  it("uses the first recovered record as the interpretation lens", () => {
    const forward = memoryInterpretations(["frag_first_boot", "frag_the_wake"])[0];
    const reverse = memoryInterpretations(["frag_the_wake", "frag_first_boot"])[0];
    expect(forward.id).toBe("memory_paper_ghost");
    expect(forward.line).not.toBe(reverse.line);
    expect(forward.positions).toEqual([1, 2]);
    expect(reverse.positions).toEqual([2, 1]);
    expect(districtMemoryInterpretation(0, ["frag_first_boot", "frag_the_wake"])?.title).toBe("PAPER GHOST");
  });

  it("reports only combinations completed by the newest recovery", () => {
    const before = ["frag_first_boot"];
    const after = [...before, "frag_the_wake"];
    expect(newlyUnlockedMemoryInterpretations(before, after).map((i) => i.id)).toEqual(["memory_paper_ghost"]);
    expect(newlyUnlockedMemoryInterpretations(after, after)).toEqual([]);
  });
});
