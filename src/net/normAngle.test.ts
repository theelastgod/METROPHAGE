import { describe, it, expect } from "vitest";
import { normAngle } from "./sim";

describe("normAngle", () => {
  it("leaves already-normal angles exactly as they are", () => {
    for (const a of [0, 1.5, -3.1, Math.PI, -Math.PI, Math.PI / 2]) {
      expect(normAngle(a)).toBe(a);
    }
  });

  it("wraps out-of-range angles into [-π, π]", () => {
    expect(normAngle(Math.PI * 2)).toBeCloseTo(0, 10);
    expect(normAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 10);
    expect(normAngle(-Math.PI * 3)).toBeCloseTo(-Math.PI, 10);
    expect(normAngle(Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5, 10);
  });

  it("maps non-finite input to 0 rather than propagating NaN", () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined as unknown as number]) {
      expect(normAngle(bad)).toBe(0);
    }
  });

  /**
   * The zone-wedging DoS: a finite-but-huge aim passed `Number.isFinite` and
   * reached `while (diff > π) diff -= 2π`. Past ~1e16, 2π is below the float64
   * ulp — `diff - 2π === diff` — so the loop never advanced and one crafted
   * message hung the Durable Object for every player in the zone.
   */
  describe("hostile aim values (zone-hang regression)", () => {
    const HOSTILE = [1e308, -1e308, 1e17, 1e12, Number.MAX_VALUE, 1e16];

    it.each(HOSTILE)("returns a real angle for aim=%p", (bad) => {
      const out = normAngle(bad);
      expect(Number.isFinite(out)).toBe(true);
      expect(out).toBeGreaterThanOrEqual(-Math.PI);
      expect(out).toBeLessThanOrEqual(Math.PI);
    });

    it("output always terminates the classic wrap loop", () => {
      // Pin the actual invariant the sim needs: after normAngle, a difference of
      // two angles is always small enough that subtracting 2π makes progress.
      for (const bad of HOSTILE) {
        const diff = normAngle(Math.atan2(1, 1) - normAngle(bad));
        expect(Number.isFinite(diff)).toBe(true);
        expect(Math.abs(diff)).toBeLessThanOrEqual(Math.PI);
        // The float64 trap that caused the hang, asserted directly.
        expect(diff - 2 * Math.PI).not.toBe(diff);
      }
    });

    it("demonstrates the raw value WOULD have hung the old loop", () => {
      // Guards the reasoning: 1e308 really is a non-terminating input.
      const diff = 0 - 1e308;
      expect(Number.isFinite(diff)).toBe(true); // passed the old isFinite check
      expect(diff + 2 * Math.PI).toBe(diff); // ...and never converged
    });
  });
});
