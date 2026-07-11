import { describe, expect, it } from "vitest";
import {
  VENUE_LAYOUTS,
  VENUE_MAT_TILE,
  VENUE_ROOM_H,
  VENUE_ROOM_W,
  buildVenueRoom,
  buildVenueRoomFromLayout,
  isWall,
  venueLayoutFor,
  venueSpawnFor,
} from "./district";
import { TILE } from "../config";

/** Flood fill from a tile; returns the set of reachable floor tiles. */
function reachable(grid: number[][], sx: number, sy: number): Set<string> {
  const seen = new Set<string>();
  const stack: Array<[number, number]> = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const k = x + "," + y;
    if (seen.has(k)) continue;
    if (grid[y]?.[x] === undefined || isWall(grid[y][x])) continue;
    seen.add(k);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}

describe("venue floor plans (shared client/server geometry)", () => {
  it("every layout: mat + spawn + all seats walkable and mat-reachable", () => {
    for (const L of VENUE_LAYOUTS) {
      const g = buildVenueRoomFromLayout(L);
      expect(g.length).toBe(L.h);
      expect(g[0].length).toBe(L.w);
      const [mx, my] = L.mat;
      expect(isWall(g[my][mx]), `${L.tag}: mat is a wall`).toBe(false);
      expect(isWall(g[my - 1][mx]), `${L.tag}: spawn tile is a wall`).toBe(false);
      const region = reachable(g, mx, my);
      for (const [sx, sy] of L.seats) {
        expect(isWall(g[sy][sx]), `${L.tag}: seat ${sx},${sy} is a wall`).toBe(false);
        expect(region.has(sx + "," + sy), `${L.tag}: seat ${sx},${sy} unreachable from mat`).toBe(true);
      }
      // no sealed pockets: every floor tile is reachable from the mat
      let floors = 0;
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (!isWall(g[y][x])) floors++;
      expect(region.size, `${L.tag}: sealed-off floor pocket`).toBe(floors);
      // keeper's side of the counter reachable via the gap
      expect(region.has(L.counter.gap + "," + (L.counter.y - 1)), `${L.tag}: counter far side sealed`).toBe(true);
    }
  });

  it("STUDIO reproduces the legacy 15×11 room byte-for-byte (est furniture safety)", () => {
    const legacy: number[][] = [];
    for (let y = 0; y < VENUE_ROOM_H; y++) {
      const row: number[] = [];
      for (let x = 0; x < VENUE_ROOM_W; x++) {
        row.push(x === 0 || x === VENUE_ROOM_W - 1 || y === 0 || y === VENUE_ROOM_H - 1 ? 1 : 0);
      }
      legacy.push(row);
    }
    for (let x = 4; x <= 10; x++) legacy[3][x] = 1;
    legacy[3][7] = 0;
    const studio = buildVenueRoomFromLayout(VENUE_LAYOUTS[0]);
    for (let y = 0; y < VENUE_ROOM_H; y++) {
      for (let x = 0; x < VENUE_ROOM_W; x++) {
        expect(isWall(studio[y][x]), `tile ${x},${y}`).toBe(legacy[y][x] === 1);
      }
    }
  });

  it("est{K} homes are pinned to the classic plan + spawn", () => {
    for (const z of ["est0", "est7", "est19"]) {
      expect(venueLayoutFor(z).tag).toBe("studio");
      expect(venueLayoutFor(z).mat).toEqual(VENUE_MAT_TILE);
      expect(venueSpawnFor(z)).toEqual({
        x: VENUE_MAT_TILE[0] * TILE + TILE / 2,
        y: (VENUE_MAT_TILE[1] - 1) * TILE + TILE / 2,
      });
    }
  });

  it("layout choice is deterministic per zone and varied across zones", () => {
    const zones = ["d0i1", "d0i2", "d1i1", "d2i3", "h1", "h5", "h7", "h12", "h20", "h29"];
    const tags = new Set(zones.map((z) => venueLayoutFor(z).tag));
    for (const z of zones) {
      expect(venueLayoutFor(z).tag).toBe(venueLayoutFor(z).tag); // stable across calls
      expect(JSON.stringify(buildVenueRoom(z))).toBe(JSON.stringify(buildVenueRoom(z)));
    }
    expect(tags.size, "hash should spread zones over several plans").toBeGreaterThanOrEqual(3);
  });
});
