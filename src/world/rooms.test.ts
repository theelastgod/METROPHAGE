import { describe, expect, it } from "vitest";
import { ROOM_PLANS, buildVenueRoom, venueKindForZone, venueLayoutFor, venueSpawnFor } from "./rooms";
import { buildVenueRoomFromLayout, isWall } from "./district";
import { DISTRICT_VENUE_KINDS } from "../game/districtVenues";
import { ONLINE_CITY } from "./city";
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

const entries = Object.entries(ROOM_PLANS) as Array<[string, NonNullable<(typeof ROOM_PLANS)[keyof typeof ROOM_PLANS]>]>;

describe("art-traced room plans", () => {
  it.each(entries)("%s: mat, spawn and every seat are walkable and reachable", (kind, L) => {
    const g = buildVenueRoomFromLayout(L);
    expect(g.length).toBe(L.h);
    expect(g[0].length).toBe(L.w);

    const [mx, my] = L.mat;
    expect(isWall(g[my][mx]), `${kind}: exit mat is a wall`).toBe(false);
    expect(isWall(g[my - 1][mx]), `${kind}: arrival tile is a wall`).toBe(false);

    const region = reachable(g, mx, my);
    for (const [sx, sy] of L.seats) {
      expect(isWall(g[sy][sx]), `${kind}: seat ${sx},${sy} is inside a fixture`).toBe(false);
      expect(region.has(sx + "," + sy), `${kind}: seat ${sx},${sy} unreachable from the door`).toBe(true);
    }
  });

  // The Argus Spire bug in miniature: a tile can be open, have open neighbours, and still
  // be walled off from the door. Sealed pockets are how you get trapped in a room.
  it.each(entries)("%s: no sealed-off floor pocket", (kind, L) => {
    const g = buildVenueRoomFromLayout(L);
    const region = reachable(g, L.mat[0], L.mat[1]);
    let floors = 0;
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (!isWall(g[y][x])) floors++;
    expect(region.size, `${kind}: floor tiles are cut off from the door`).toBe(floors);
  });

  it.each(entries)("%s: every fixture sits inside the walls", (kind, L) => {
    for (const [x0, y0, x1, y1] of L.blocks ?? []) {
      expect(x0 >= 1 && y0 >= 1, `${kind}: block ${x0},${y0} overlaps the wall ring`).toBe(true);
      expect(x1 <= L.w - 2 && y1 <= L.h - 2, `${kind}: block ${x1},${y1} overlaps the wall ring`).toBe(true);
      expect(x0 <= x1 && y0 <= y1, `${kind}: block rect is inverted`).toBe(true);
    }
  });

  // The whole point: the room's shape must match the picture, or the art stretches.
  // hf_int_bar_room is 178×180 (~0.99). A 27×11 "hall" would distort it 2.5×.
  it("bar's aspect tracks its art", () => {
    const bar = ROOM_PLANS.bar!;
    expect(bar.art).toBe("hf_int_bar_room");
    expect(Math.abs(bar.w / bar.h - 178 / 180)).toBeLessThan(0.15);
  });
});

describe("venue kind resolution (client and server must agree)", () => {
  it("district venue zones resolve to the authored kind per index", () => {
    DISTRICT_VENUE_KINDS.forEach((kind, i) => {
      expect(venueKindForZone(`d0i${i}`)).toBe(kind);
      expect(venueKindForZone(`d3i${i}`)).toBe(kind);
    });
  });

  it("hub zones resolve to that building's kind", () => {
    const i = ONLINE_CITY.buildings.findIndex((b) => !!b.kind);
    expect(venueKindForZone(`h${i}`)).toBe(ONLINE_CITY.buildings[i].kind);
  });

  // THE FERAL CAT (bar), the clinic, the market stall and the den used to run on the
  // 40×30 buildSafehouse grid while being dressed with a 20×13 floor plate — the art
  // covered a quadrant and the NPC tiles sat outside it entirely.
  it("the hub's named service venues resolve to their kind's art room", () => {
    for (const [zone, kind] of [["bar", "bar"], ["clinic", "clinic"], ["shop", "shop"], ["den", "den"]] as const) {
      expect(venueKindForZone(zone), `${zone} should resolve a kind`).toBe(kind);
      const L = venueLayoutFor(zone);
      expect(L.art, `${zone} should be art-traced`).toBeTruthy();
      // The hub venue and its district counterpart are literally the same room.
      const districtIdx = DISTRICT_VENUE_KINDS.indexOf(kind as never);
      if (districtIdx >= 0) expect(venueLayoutFor(`d0i${districtIdx}`)).toBe(L);
      // and the grid must be the room's size, not the 40×30 safehouse
      const g = buildVenueRoom(zone);
      expect(g.length).toBe(L.h);
      expect(g[0].length).toBe(L.w);
    }
  });

  it("non-venue zones have no kind and keep the legacy plan", () => {
    for (const z of ["est0", "est19", "w0s1", "safe", "subway", "", null, undefined]) {
      expect(venueKindForZone(z), `${z} should not resolve a venue kind`).toBe(null);
    }
    // est{K} homes stay pinned to the classic 15×11 studio — placed furniture
    // persists tile coordinates, so this plan can never move.
    expect(venueLayoutFor("est7").tag).toBe("studio");
    expect(venueLayoutFor("est7").w).toBe(15);
    expect(venueLayoutFor("est7").h).toBe(11);
    expect(venueLayoutFor("est7").art).toBeUndefined();
  });

  it("a kind with an art room gets it, identically in every district", () => {
    const barIdx = DISTRICT_VENUE_KINDS.indexOf("bar");
    expect(venueLayoutFor(`d0i${barIdx}`).art).toBe("hf_int_bar_room");
    // Same kind across districts = same room, regardless of zone hash. This is the
    // whole point: the room follows what the venue IS, not what its id hashes to.
    expect(venueLayoutFor(`d5i${barIdx}`)).toBe(venueLayoutFor(`d0i${barIdx}`));
  });

  it("every district venue kind now has an art room", () => {
    DISTRICT_VENUE_KINDS.forEach((kind, i) => {
      expect(venueLayoutFor(`d0i${i}`).art, `${kind} should be art-traced`).toBeTruthy();
    });
  });

  it("the hotel resolves to its dedicated sleep-pod interior", () => {
    const hotelIdx = ONLINE_CITY.buildings.findIndex((b) => b.kind === "hotel");
    expect(hotelIdx, "expected a hotel in the hub").toBeGreaterThanOrEqual(0);
    expect(venueLayoutFor(`h${hotelIdx}`).art).toBe("hf_int_hotel_room");
    expect(venueLayoutFor(`h${hotelIdx}`).counter).toBeUndefined();
  });

  it("grids are deterministic — the server's build equals the client's", () => {
    for (const z of ["d0i4", "d2i4", "h3", "est0", "w0s1"]) {
      expect(JSON.stringify(buildVenueRoom(z))).toBe(JSON.stringify(buildVenueRoom(z)));
    }
  });

  it("spawns land a runner on open floor, never inside a fixture", () => {
    for (const z of ["d0i0", "d0i1", "d0i2", "d0i3", "d0i4", "est0"]) {
      const grid = buildVenueRoom(z);
      const s = venueSpawnFor(z, grid);
      const tx = Math.floor(s.x / TILE);
      const ty = Math.floor(s.y / TILE);
      expect(isWall(grid[ty]?.[tx]), `${z}: spawned inside a wall/fixture`).toBe(false);
    }
  });
});
