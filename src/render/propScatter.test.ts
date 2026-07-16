import { describe, expect, it } from "vitest";
import { TILE_FLOOR, TILE_WALL } from "../world/district";
import { hasPropWallClearance } from "./propClearance";

describe("world prop building clearance", () => {
  it("rejects anchors whose cutout could overlap a nearby building", () => {
    const grid = Array.from({ length: 9 }, () => new Array(9).fill(TILE_FLOOR));
    grid[4][6] = TILE_WALL;
    expect(hasPropWallClearance(grid, 4, 4, 2)).toBe(false);
    expect(hasPropWallClearance(grid, 2, 2, 2)).toBe(true);
  });
});
