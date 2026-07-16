import { describe, expect, it } from "vitest";
import { DISTRICT_SCALE, TILE } from "../config";
import { DISTRICTS } from "../game/districts";
import { collides, resolveOpenSpawn } from "../net/sim";
import { buildVenueRoom, spawnPointForTravel, venueSpawnFor } from "./rooms";
import {
  buildGrid,
  buildSafehouse,
  buildSubway,
  buildDive,
  buildTutorial,
  buildBridgeGrid,
  isDivePlanInterior,
  isVenueSizedZone,
  parseDiveZone,
  isWall,
  spawnPoint,
  SAFEHOUSE_SPAWN,
  SUBWAY_SPAWN,
  DIVE_SPAWN,
  districtBuildings,
  TILE_NEON,
  TILE_PLAZA,
} from "./district";
import { buildHomeRoom, ESTATES, ESTATES_ZONE } from "./estates";
import { BRIDGES, bridgeEastTile, bridgeWestTile } from "../game/bridges";
import { ONLINE_CITY, CITY_HUB_SPAWN } from "./city";
import { TUTORIAL_SPAWN } from "../game/tutorialLayout";

function assertOpen(grid: number[][], p: { x: number; y: number }, label: string) {
  const tx = Math.floor(p.x / TILE);
  const ty = Math.floor(p.y / TILE);
  expect(grid[ty]?.[tx], `${label} tile exists`).toBeDefined();
  expect(isWall(grid[ty][tx]), `${label} not wall tile`).toBe(false);
  expect(collides(p.x, p.y, grid), `${label} no radius collision`).toBe(false);
}

describe("resolveOpenSpawn never places inside walls", () => {
  it("fixes a position inside a solid wall block", () => {
    const grid = buildVenueRoom("d0i0");
    // Force preferred into a known wall (border).
    const bad = { x: 0.5 * TILE, y: 0.5 * TILE };
    expect(isWall(grid[0][0])).toBe(true);
    const open = resolveOpenSpawn(grid, bad);
    assertOpen(grid, open, "resolved border");
  });

  it("snaps preferred mid-building footprints on every combat district", () => {
    DISTRICTS.forEach((def) => {
      const grid = buildGrid(def);
      for (const b of districtBuildings(def).slice(0, 4)) {
        // Centre of a building roof — classic trap for bad travel math.
        const cx = ((b.x1 + b.x2) / 2) * 3; // DISTRICT_SCALE
        const cy = ((b.y1 + b.y2) / 2) * 3;
        const bad = { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
        const open = resolveOpenSpawn(grid, bad);
        assertOpen(grid, open, `roof ${def.id} @${cx},${cy}`);
      }
    });
  });

  it("venue spawns for many zone ids are open", () => {
    for (let i = 0; i < 24; i++) {
      for (const prefix of ["d0i", "d2i", "h", "est"] as const) {
        const z = `${prefix}${i}`;
        const grid = prefix === "est" ? buildHomeRoom() : buildVenueRoom(z);
        const s = venueSpawnFor(z, grid);
        const open = resolveOpenSpawn(grid, s);
        assertOpen(grid, open, z);
      }
    }
  });

  it("district canonical + travel spawns are open", () => {
    DISTRICTS.forEach((def, di) => {
      const grid = buildGrid(def);
      const sp = spawnPoint(grid, def);
      assertOpen(grid, resolveOpenSpawn(grid, sp), `spawn ${def.id}`);
      for (const b of BRIDGES) {
        if (b.fromDistrict === di || b.toDistrict === di) {
          const p = spawnPointForTravel(grid, `d${di}`, b.id, def, undefined);
          assertOpen(grid, resolveOpenSpawn(grid, p), `travel d${di} from ${b.id}`);
        }
      }
      // Leaving a building into the district
      const buildings = districtBuildings(def);
      if (buildings.length) {
        const p = spawnPointForTravel(grid, `d${di}`, `d${di}i0`, def, undefined);
        assertOpen(grid, resolveOpenSpawn(grid, p), `exit building d${di}`);
      }
    });
  });

  it("returns hub building exits to the exact façade doorway", () => {
    ONLINE_CITY.buildings.forEach((b, i) => {
      if (!b.door) return;
      const p = spawnPointForTravel(ONLINE_CITY.grid, "safe", `h${i}`, undefined, CITY_HUB_SPAWN);
      assertOpen(ONLINE_CITY.grid, resolveOpenSpawn(ONLINE_CITY.grid, p), `hub building h${i}`);
      expect(Math.floor(p.x / TILE), `h${i} doorway x`).toBe(b.door[0]);
      expect(Math.floor(p.y / TILE), `h${i} just south of doorway`).toBe(b.door[1] + 1);
    });
  });

  it("returns estate interiors to their own doorstep", () => {
    for (const plot of ESTATES.plots) {
      const p = spawnPointForTravel(ESTATES.grid, ESTATES_ZONE, `est${plot.id}`);
      assertOpen(ESTATES.grid, resolveOpenSpawn(ESTATES.grid, p), `estate ${plot.id}`);
      expect([Math.floor(p.x / TILE), Math.floor(p.y / TILE)]).toEqual(plot.door);
    }
  });

  it("returns named hub venues to their plaza portal", () => {
    const [cx, cy] = ONLINE_CITY.spawn;
    const entries: Array<[string, [number, number]]> = [
      ["clinic", [cx - 4, cy - 6]],
      ["shop", [cx + 4, cy - 6]],
      ["bar", [cx - 4, cy + 6]],
      ["den", [cx + 4, cy + 6]],
      ["vault", [cx + 12, cy]],
    ];
    for (const [from, door] of entries) {
      const p = spawnPointForTravel(ONLINE_CITY.grid, "safe", from, undefined, CITY_HUB_SPAWN);
      assertOpen(ONLINE_CITY.grid, resolveOpenSpawn(ONLINE_CITY.grid, p), `hub venue ${from}`);
      expect([Math.floor(p.x / TILE), Math.floor(p.y / TILE)]).toEqual(door);
    }
  });

  it("keeps the city spawn plaza compact and visually multi-surface", () => {
    const plaza = ONLINE_CITY.plazas[0];
    expect(plaza.x2 - plaza.x1 + 1).toBeLessThanOrEqual(19);
    expect(plaza.y2 - plaza.y1 + 1).toBeLessThanOrEqual(17);
    const tiles = new Set<number>();
    for (let y = plaza.y1; y <= plaza.y2; y++) {
      for (let x = plaza.x1; x <= plaza.x2; x++) tiles.add(ONLINE_CITY.grid[y][x]);
    }
    expect(tiles.size).toBeGreaterThanOrEqual(4);
    expect(tiles.has(TILE_PLAZA)).toBe(false);
    expect(tiles.has(TILE_NEON)).toBe(false);
  });

  /**
   * "Not a wall" is NOT enough. ARGUS SPIRE and ORBITAL RELAY both shipped a spawnTile
   * sitting inside a building footprint: buildGrid filled the tower, carve() opened the
   * spawn tile and its 4 neighbours, and the runner arrived boxed in a 5-tile pocket
   * inside the building. Every open-tile assertion passed — the pocket centre is open,
   * has open neighbours, and clears the player radius. Only reachability catches it.
   */
  it("every district spawn can actually reach its plaza", () => {
    DISTRICTS.forEach((def) => {
      const grid = buildGrid(def);
      const s = resolveOpenSpawn(grid, spawnPoint(grid, def));
      const sx = Math.floor(s.x / TILE);
      const sy = Math.floor(s.y / TILE);

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

      const plaza = def.layout.plaza;
      if (plaza) {
        const px = Math.round((plaza.x1 + plaza.x2) / 2) * DISTRICT_SCALE;
        const py = Math.round((plaza.y1 + plaza.y2) / 2) * DISTRICT_SCALE;
        expect(seen.has(px + "," + py), `${def.id}: spawn is sealed off from the plaza`).toBe(true);
      }
      // A pocket is tiny; a real district floor is thousands of tiles.
      expect(seen.size, `${def.id}: spawn region is a pocket (${seen.size} tiles)`).toBeGreaterThan(500);
    });
  });

  it("every combat arrival has an open field-medic post", () => {
    DISTRICTS.forEach((def) => {
      const grid = buildGrid(def);
      const [sx, sy] = def.spawnTile;
      const spots: Array<[number, number]> = [
        [sx * DISTRICT_SCALE + 7, sy * DISTRICT_SCALE - 4],
        [sx * DISTRICT_SCALE - 7, sy * DISTRICT_SCALE - 4],
        [sx * DISTRICT_SCALE + 7, sy * DISTRICT_SCALE + 4],
        [sx * DISTRICT_SCALE - 7, sy * DISTRICT_SCALE + 4],
      ];
      expect(spots.some(([x, y]) => grid[y]?.[x] !== undefined && !isWall(grid[y][x])), `${def.id}: medic post`).toBe(true);
    });
  });

  it("every combat arrival court is free of purple plaza/neon tiles", () => {
    DISTRICTS.forEach((def) => {
      const grid = buildGrid(def);
      const sx = def.spawnTile[0] * DISTRICT_SCALE;
      const sy = def.spawnTile[1] * DISTRICT_SCALE;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const tile = grid[sy + dy]?.[sx + dx];
          if (tile === undefined || isWall(tile)) continue;
          expect([TILE_PLAZA, TILE_NEON], `${def.id}: purple tile at ${dx},${dy}`).not.toContain(tile);
        }
      }
    });
  });

  it("no district's authored key tiles sit inside a building footprint", () => {
    DISTRICTS.forEach((def) => {
      const inside = (t: [number, number]) =>
        def.layout.buildings.findIndex((b) => t[0] >= b.x1 && t[0] <= b.x2 && t[1] >= b.y1 && t[1] <= b.y2);
      for (const [name, tile] of [
        ["spawnTile", def.spawnTile],
        ["diveTile", def.diveTile],
      ] as Array<[string, [number, number]]>) {
        const i = inside(tile);
        expect(i, `${def.id}: ${name} ${tile} is inside building #${i}`).toBe(-1);
      }
    });
  });

  it("named zone spawns are open", () => {
    const cases: Array<[string, number[][], { x: number; y: number }]> = [
      ["safehouse", buildSafehouse(), SAFEHOUSE_SPAWN],
      ["subway", buildSubway(), SUBWAY_SPAWN],
      ["dive", buildDive(), DIVE_SPAWN],
      ["tutorial", buildTutorial("quick"), TUTORIAL_SPAWN],
      ["tutorial_full", buildTutorial("full"), TUTORIAL_SPAWN],
      ["hub", ONLINE_CITY.grid, CITY_HUB_SPAWN],
    ];
    for (const [name, grid, pref] of cases) {
      assertOpen(grid, resolveOpenSpawn(grid, pref), name);
    }
  });

  it("bridge spawns are open", () => {
    for (const b of BRIDGES) {
      const grid = buildBridgeGrid(b);
      const p = spawnPointForTravel(grid, b.id, undefined);
      assertOpen(grid, resolveOpenSpawn(grid, p), b.id);
    }
  });

  // THE PROVING is an interior whose plan is the dive maze. The client once resolved it to
  // buildSafehouse() while WorldDO.initZone bound buildDive(), so the two sides disagreed
  // about every wall in the zone. Both sides read the plan through isDivePlanInterior now.
  it("routes THE PROVING to the dive plan the server builds, not the safehouse", () => {
    expect(isDivePlanInterior("vault")).toBe(true);
    // It must not be mistaken for a v0–v6 dive instance or a compact venue room.
    expect(parseDiveZone("vault")).toBe(-1);
    expect(isVenueSizedZone("vault")).toBe(false);

    const dive = buildDive();
    const safehouse = buildSafehouse();
    const differs = dive.some((row, y) => row.some((t, x) => isWall(t) !== isWall(safehouse[y][x])));
    expect(differs, "dive and safehouse must differ, else this test proves nothing").toBe(true);

    // Arrive on the dive's entry pad, never the safehouse centre out in the maze.
    const spawn = spawnPointForTravel(dive, "vault", "safe", undefined, DIVE_SPAWN);
    assertOpen(dive, spawn, "vault travel spawn");
    const entry = { x: DIVE_SPAWN.x / TILE, y: DIVE_SPAWN.y / TILE };
    const at = { x: spawn.x / TILE, y: spawn.y / TILE };
    expect(Math.hypot(at.x - entry.x, at.y - entry.y), "spawn must land near the dive entry pad").toBeLessThan(6);
  });

  it("both ends of every wilderness bridge have purple-free arrival courts", () => {
    for (const b of BRIDGES) {
      const grid = buildBridgeGrid(b);
      for (const [label, [sx, sy]] of [
        ["west", bridgeWestTile(b)],
        ["east", bridgeEastTile(b)],
      ] as const) {
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const tile = grid[sy + dy]?.[sx + dx];
            if (tile === undefined || isWall(tile)) continue;
            expect([TILE_PLAZA, TILE_NEON], `${b.id} ${label}: purple tile at ${dx},${dy}`).not.toContain(tile);
          }
        }
      }
    }
  });
});
