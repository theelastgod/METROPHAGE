import { describe, expect, it } from "vitest";
import { furnitureHomeBuffs, type FurniturePiece } from "./estates";

describe("furnitureHomeBuffs", () => {
  it("sums and soft-caps furniture buffs", () => {
    const pieces: FurniturePiece[] = [
      { k: "bed", x: 1, y: 1 },
      { k: "sofa", x: 3, y: 1 },
      { k: "plant", x: 5, y: 1 },
      { k: "server_rack", x: 6, y: 1 },
      { k: "trophy", x: 7, y: 1 },
      { k: "weapon_rack", x: 8, y: 1 },
    ];
    const b = furnitureHomeBuffs(pieces);
    expect(b.regenPerSec).toBeGreaterThan(3);
    expect(b.regenPerSec).toBeLessThanOrEqual(6);
    expect(b.heatDecayPct).toBeGreaterThan(0.1);
    expect(b.heatDecayPct).toBeLessThanOrEqual(0.35);
    expect(b.shieldHome).toBeGreaterThan(10);
    expect(b.shieldHome).toBeLessThanOrEqual(40);
    expect(b.movePct).toBeGreaterThan(0);
    expect(b.movePct).toBeLessThanOrEqual(0.12);
  });

  it("returns zeros for empty layout", () => {
    expect(furnitureHomeBuffs([])).toEqual({
      regenPerSec: 0,
      heatDecayPct: 0,
      shieldHome: 0,
      movePct: 0,
    });
  });
});
