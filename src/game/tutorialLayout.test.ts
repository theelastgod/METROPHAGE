import { describe, expect, it } from "vitest";
import {
  TUTORIAL_FULL_SYSTEMS_X1,
  TUTORIAL_FULL_SYSTEMS_X2,
  tutorialChambers,
  tutorialGridW,
  tutorialInstructorsFor,
  tutorialPortalTile,
} from "./tutorialLayout";

describe("tutorialLayout full training hall", () => {
  it("full yard is wider with a longer systems hall", () => {
    expect(tutorialGridW("full")).toBeGreaterThan(tutorialGridW("quick"));
    const full = tutorialChambers("full").find((c) => c.id === "systems")!;
    const quick = tutorialChambers("quick").find((c) => c.id === "systems")!;
    expect(full.x2 - full.x1).toBeGreaterThan(quick.x2 - quick.x1);
    expect(full.x1).toBe(TUTORIAL_FULL_SYSTEMS_X1);
    expect(full.x2).toBe(TUTORIAL_FULL_SYSTEMS_X2);
    expect(tutorialPortalTile("full")[0]).toBeGreaterThan(tutorialPortalTile("quick")[0]);
  });

  it("full instructors are spaced and stay inside systems hall", () => {
    const list = tutorialInstructorsFor("full").filter((i) => i.chamber === "systems");
    expect(list.length).toBeGreaterThan(10);
    const tiles = list.map((i) => i.tile);
    for (const [tx, ty] of tiles) {
      expect(tx).toBeGreaterThanOrEqual(TUTORIAL_FULL_SYSTEMS_X1);
      expect(tx).toBeLessThanOrEqual(TUTORIAL_FULL_SYSTEMS_X2);
      expect(ty).toBeGreaterThanOrEqual(5);
      expect(ty).toBeLessThanOrEqual(25);
    }
    // No two instructors on the same tile
    const keys = new Set(tiles.map(([x, y]) => `${x},${y}`));
    expect(keys.size).toBe(tiles.length);
    // Min chebyshev spacing of 2 between any pair (not stacked)
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const dx = Math.abs(tiles[i][0] - tiles[j][0]);
        const dy = Math.abs(tiles[i][1] - tiles[j][1]);
        expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
