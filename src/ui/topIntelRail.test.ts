import { describe, expect, it } from "vitest";
import { topIntelRailGeometry } from "./topIntelRail";

describe("topIntelRailGeometry", () => {
  it("keeps the quest/event rail in the top band on an 844x390 phone backing buffer", () => {
    // Low tier at 844/390: 1558x720 backing buffer, UI scale 4/3.
    const rail = topIntelRailGeometry({
      viewW: 1558,
      top: 16,
      screenPad: 16,
      statusRight: 590,
      statusBottom: 126,
      laneGap: 11,
      fallbackGap: 11,
      minTopWidth: 293,
      maxWidth: 747,
    });

    expect(rail.topLane).toBe(true);
    expect(rail.y).toBe(16);
    expect(rail.x).toBeGreaterThan(590);
    expect(rail.x + rail.w).toBeLessThanOrEqual(1558 - 16);
  });

  it("keeps the desktop rail beside status", () => {
    const rail = topIntelRailGeometry({
      viewW: 2560,
      top: 32,
      screenPad: 32,
      statusRight: 900,
      statusBottom: 250,
      laneGap: 32,
      fallbackGap: 21,
      minTopWidth: 587,
      maxWidth: 1707,
    });

    expect(rail).toMatchObject({ x: 932, y: 32, topLane: true });
    expect(rail.x + rail.w).toBeLessThanOrEqual(2560 - 32);
  });

  it("falls below status only when the remaining top lane is genuinely too narrow", () => {
    const rail = topIntelRailGeometry({
      viewW: 960,
      top: 12,
      screenPad: 12,
      statusRight: 760,
      statusBottom: 96,
      laneGap: 12,
      fallbackGap: 8,
      minTopWidth: 220,
      maxWidth: 640,
    });

    expect(rail).toEqual({ x: 12, y: 104, w: 640, topLane: false });
  });
});
