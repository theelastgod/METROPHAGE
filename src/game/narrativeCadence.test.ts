import { describe, expect, it } from "vitest";
import { rotatingContextLine } from "./narrativeCadence";

describe("durable narrative cadence", () => {
  it("skips absent layers and exposes every available context before repeating", () => {
    const layers = [null, "casefile", undefined, "judgment", "memory", "civic"];
    expect([0, 1, 2, 3, 4].map((i) => rotatingContextLine(layers, i)))
      .toEqual(["casefile", "judgment", "memory", "civic", "casefile"]);
  });

  it("handles no context and normalizes negative cadence safely", () => {
    expect(rotatingContextLine([], 0)).toBeNull();
    expect(rotatingContextLine(["a", "b"], -1)).toBe("b");
  });
});
