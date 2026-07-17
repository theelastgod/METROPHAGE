import { describe, expect, it } from "vitest";
import { cityPulseAt, cityPulseLines } from "./cityPulse";

describe("cityPulse", () => {
  it("exposes war + goal lines", () => {
    const lines = cityPulseLines(1_700_000_000_000);
    expect(lines.length).toBeGreaterThan(4);
    expect(lines.some((l) => /WAR|war|pulse/i.test(l))).toBe(true);
    expect(lines.some((l) => /street reprints never take ₵/.test(l))).toBe(true);
    expect(lines.some((l) => /carried bag also survives reprint/.test(l))).toBe(true);
    expect(lines.some((l) => /death tax/i.test(l))).toBe(false);
  });

  it("rotates by seed", () => {
    expect(cityPulseAt(0)).not.toBe(cityPulseAt(1));
  });
});
