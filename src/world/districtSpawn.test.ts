import { describe, expect, it } from "vitest";
import { TILE, DISTRICT_SCALE } from "../config";
import { DISTRICTS } from "../game/districts";
import { BRIDGES } from "../game/bridges";
import { buildGrid, districtBuildings, isWall } from "./district";
import { spawnPointForTravel } from "./rooms";
import type { DistrictDef } from "../game/districts";

/** Every way a runner can walk into a district: the bridge below it (arriving as the
 *  bridge's toDistrict) and the bridge above it (arriving as its fromDistrict). */
function bridgeEntriesFor(di: number): string[] {
  const ids: string[] = [];
  if (di - 1 >= 0 && di - 1 < BRIDGES.length) ids.push(BRIDGES[di - 1].id); // from the west
  if (di < BRIDGES.length) ids.push(BRIDGES[di].id); // from the east
  return ids;
}

/** Inside a placed building footprint? (scaled, inclusive — matches how the grid fills them.)
 *  Independent of the tile's current value, so it still catches a spot the old code carved
 *  a walkable pocket into. */
function insideBuilding(def: DistrictDef, tx: number, ty: number): boolean {
  const S = DISTRICT_SCALE;
  return districtBuildings(def).some(
    (b) => tx >= b.x1 * S && tx <= b.x2 * S && ty >= b.y1 * S && ty <= b.y2 * S,
  );
}

describe("district travel spawns never land on/inside a building", () => {
  DISTRICTS.forEach((def, di) => {
    const zone = `d${di}`;
    for (const bridgeId of bridgeEntriesFor(di)) {
      it(`${def.name} (${zone}) entered from ${bridgeId} lands on open ground`, () => {
        const grid = buildGrid(def);
        const p = spawnPointForTravel(grid, zone, bridgeId, def, undefined);
        const tx = Math.floor(p.x / TILE);
        const ty = Math.floor(p.y / TILE);
        expect(grid[ty]?.[tx]).toBeDefined();
        expect(isWall(grid[ty][tx])).toBe(false);
        expect(insideBuilding(def, tx, ty)).toBe(false);
      });
    }
  });
});
