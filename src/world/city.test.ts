import { describe, expect, it } from "vitest";
import { ONLINE_CITY } from "./city";
import { isWall } from "./district";

describe("city hub collision (shared client/server grid)", () => {
  it("no building roof is walkable — only its door opening", () => {
    const { grid, buildings } = ONLINE_CITY;
    for (const b of buildings) {
      for (let y = b.rect.y1; y <= b.rect.y2; y++) {
        for (let x = b.rect.x1; x <= b.rect.x2; x++) {
          const isDoor = !!b.door && b.door[0] === x && b.door[1] === y;
          if (isDoor) continue; // the one carved opening
          expect(
            isWall(grid[y][x]),
            `${b.id} (${b.kind}) walkable roof tile at ${x},${y}`,
          ).toBe(true);
        }
      }
    }
  });

  it("spawn and every building door step onto walkable ground", () => {
    const { grid, buildings, spawn } = ONLINE_CITY;
    expect(isWall(grid[spawn[1]][spawn[0]])).toBe(false);
    for (const b of buildings) {
      if (!b.door) continue;
      const [dx, dy] = b.door;
      expect(isWall(grid[dy][dx]), `${b.id} door blocked`).toBe(false);
      expect(isWall(grid[dy + 1]?.[dx]), `${b.id} doorstep blocked`).toBe(false);
    }
  });
});
