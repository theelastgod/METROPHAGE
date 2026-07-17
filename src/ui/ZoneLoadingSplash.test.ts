import { describe, expect, it } from "vitest";
import { zoneLoadingArtFor } from "./ZoneLoadingSplash";

describe("zone loading art routing", () => {
  it("routes the first-hours city, subway, and hotel art", () => {
    expect(zoneLoadingArtFor("safe")).toContain("early_city");
    expect(zoneLoadingArtFor("d0")).toContain("early_city");
    expect(zoneLoadingArtFor("subway")).toContain("subway");
    expect(zoneLoadingArtFor("h7")).toContain("hotel");
  });

  it("does not flash unrelated art in unmapped environments", () => {
    expect(zoneLoadingArtFor("w5")).toBeNull();
  });
});
