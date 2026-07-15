import { describe, expect, it } from "vitest";
import { TILE } from "../config";
import { DISTRICTS } from "../game/districts";
import { collides, resolveOpenSpawn } from "../net/sim";
import {
  buildGrid,
  buildVenueRoom,
  buildSafehouse,
  buildSubway,
  buildDive,
  buildTutorial,
  buildBridgeGrid,
  isWall,
  spawnPoint,
  spawnPointForTravel,
  venueSpawnFor,
  SAFEHOUSE_SPAWN,
  SUBWAY_SPAWN,
  DIVE_SPAWN,
  districtBuildings,
} from "./district";
import { buildHomeRoom } from "./estates";
import { BRIDGES } from "../game/bridges";
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
});
