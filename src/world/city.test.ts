import { describe, expect, it } from "vitest";
import { ONLINE_CITY } from "./city";
import { ESTATES } from "./estates";
import { isWall } from "./district";

describe("city hub collision (shared client/server grid)", () => {
  it("shows a real building ring inside the mobile spawn viewport", () => {
    const [sx, sy] = ONLINE_CITY.spawn;
    const nearest = Math.min(...ONLINE_CITY.buildings.map((b) =>
      Math.hypot(
        Math.max(b.rect.x1 - sx, 0, sx - b.rect.x2),
        Math.max(b.rect.y1 - sy, 0, sy - b.rect.y2),
      ),
    ));
    expect(nearest).toBeLessThanOrEqual(7);
  });
  it("does not repeat a business kind inside the same city environment", () => {
    const seen = new Set<string>();
    for (const b of ONLINE_CITY.buildings) {
      if (["hospital", "hotel", "subway", "stadium", "citycenter"].includes(b.kind)) continue;
      const key = `${b.env}:${b.kind}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
    }
  });
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

  it("estate house plots are solid except their carved doorway", () => {
    const { grid, plots } = ESTATES;
    for (const p of plots) {
      const cx = p.door[0];
      for (let y = p.rect.y1; y <= p.rect.y2; y++) {
        for (let x = p.rect.x1; x <= p.rect.x2; x++) {
          if (x === cx && !isWall(grid[y][x])) continue; // the doorway column carve
          expect(isWall(grid[y][x]), `plot ${p.id} walkable roof at ${x},${y}`).toBe(true);
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
