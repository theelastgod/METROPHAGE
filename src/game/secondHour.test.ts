import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetSecondHourForTests,
  dismissSecondHour,
  getSecondHour,
  noteSecondBossTouch,
  noteSecondBuyCache,
  noteSecondCapture,
  noteSecondForge,
  noteSecondBountyDone,
  secondHourLine,
} from "./secondHour";

beforeEach(() => {
  __resetSecondHourForTests();
});

describe("secondHour", () => {
  it("requires boss touch before allDone (line null)", () => {
    noteSecondBountyDone();
    noteSecondBuyCache();
    noteSecondForge();
    noteSecondCapture();
    // Without boss touch, still coaching.
    expect(secondHourLine(true)).toMatch(/boss/i);
    noteSecondBossTouch();
    expect(secondHourLine(true)).toBeNull();
  });

  it("exposes state via getSecondHour", () => {
    const s = getSecondHour();
    expect(typeof s.buyCache).toBe("boolean");
  });

  it("dismiss stops coaching", () => {
    dismissSecondHour();
    expect(secondHourLine(true)).toBeNull();
  });
});
