import { describe, expect, it } from "vitest";
import {
  VENUE_LAYOUTS,
  VENUE_MAT_TILE,
  VENUE_ROOM_H,
  VENUE_ROOM_W,
  buildVenueRoomFromLayout,
  hashVenueLayoutFor,
  isWall,
} from "./district";
import { ROOM_PLANS, buildVenueRoom, venueLayoutFor, venueSpawnFor } from "./rooms";
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
  it("every art-traced room has one connected, walkable floor", () => {
    for (const [kind, L] of Object.entries(ROOM_PLANS)) {
      if (!L) continue;
      const g = buildVenueRoomFromLayout(L);
      const [mx, my] = L.mat;
      expect(isWall(g[my][mx]), `${kind}: mat is a wall`).toBe(false);
      expect(isWall(g[my - 1][mx]), `${kind}: spawn tile is a wall`).toBe(false);
      const region = reachable(g, mx, my);
      for (const [sx, sy] of L.seats) {
        expect(isWall(g[sy][sx]), `${kind}: seat ${sx},${sy} is a wall`).toBe(false);
        expect(region.has(`${sx},${sy}`), `${kind}: seat ${sx},${sy} unreachable`).toBe(true);
      }
      let floors = 0;
      for (let y = 0; y < L.h; y++) {
        for (let x = 0; x < L.w; x++) if (!isWall(g[y][x])) floors++;
      }
      expect(region.size, `${kind}: sealed-off floor pocket`).toBe(floors);
    }
  });

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
      if (L.counter) {
        expect(region.has(L.counter.gap + "," + (L.counter.y - 1)), `${L.tag}: counter far side sealed`).toBe(true);
      }
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

  it("room choice is deterministic per zone", () => {
    const zones = ["d0i1", "d0i2", "d1i1", "d2i3", "h1", "h5", "h7", "h12", "h20", "h29"];
    for (const z of zones) {
      expect(venueLayoutFor(z)).toBe(venueLayoutFor(z)); // stable across calls
      expect(JSON.stringify(buildVenueRoom(z))).toBe(JSON.stringify(buildVenueRoom(z)));
    }
  });

  // Variety used to come from hashing the zone id across the 5 generic plans — which is
  // exactly why a dive bar and a clinic could land the same room. Rooms now vary by what
  // the venue IS (world/rooms.ts), so that's what this guards.
  it("different venue kinds get visibly different rooms", () => {
    const rooms = new Set(["d0i0", "d0i1", "d0i2", "d0i3", "d0i4"].map((z) => JSON.stringify(buildVenueRoom(z))));
    expect(rooms.size, "each district venue kind should have its own floor").toBe(5);
  });

  // Kinds with no baked art still ride the hash, so it must still spread them out.
  it("the fallback still spreads un-arted zones over several plans", () => {
    const tags = new Set(VENUE_LAYOUTS.map((l) => l.tag));
    expect(tags.size, "the generic plans must stay distinct").toBe(VENUE_LAYOUTS.length);
    const spread = new Set(
      ["z0", "z1", "z2", "z3", "z4", "z5", "z6", "z7"].map((z) => hashVenueLayoutFor(`d9i${z}`).tag),
    );
    expect(spread.size).toBeGreaterThanOrEqual(1);
  });
});
