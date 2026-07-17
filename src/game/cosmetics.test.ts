import { describe, expect, it } from "vitest";
import { COSMETICS, cosmeticAcknowledgement } from "./cosmetics";

describe("cosmetic provenance", () => {
  it("gives every cosmetic authored history and three trust-sensitive street reads", () => {
    for (const cosmetic of COSMETICS) {
      expect(cosmetic.provenance.length, cosmetic.id).toBeGreaterThan(60);
      expect(cosmetic.streetRead).toHaveLength(3);
      for (const line of cosmetic.streetRead) expect(line.length, cosmetic.id).toBeGreaterThan(55);
      expect(new Set(cosmetic.streetRead).size, cosmetic.id).toBe(3);
    }
  });

  it("acknowledges only a known contact's equipped authored cosmetic", () => {
    expect(cosmeticAcknowledgement("ghost_visor", 0)).toBeNull();
    expect(cosmeticAcknowledgement("ghost_visor", 1)).toMatch(/station doors/);
    expect(cosmeticAcknowledgement("ghost_visor", 3)).toMatch(/Hollow/);
    expect(cosmeticAcknowledgement("missing", 3)).toBeNull();
  });
});
