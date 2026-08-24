import { describe, expect, it } from "vitest";
import { cubicSouthPx, cubicStories } from "./cubicMassing";

describe("cubic massing", () => {
  it("makes civic landmarks taller than homes", () => {
    expect(cubicStories("citycenter", "downtown")).toBeGreaterThan(cubicStories("home", "residential"));
    expect(cubicStories("hotel", "corporate")).toBeGreaterThan(cubicStories("den", "slum"));
  });

  it("keeps every footprint in a readable storey range", () => {
    for (const kind of ["home", "shop", "bar", "citycenter", "garage", "stadium"]) {
      const n = cubicStories(kind, "downtown", 0);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(7);
      expect(cubicSouthPx(n)).toBeGreaterThanOrEqual(13);
    }
  });

  it("spire / core blocks rise above slum blocks of the same kind", () => {
    expect(cubicStories("shop", "spire")).toBeGreaterThan(cubicStories("shop", "slum"));
  });
});
