// METROPHAGE — interior rooms modelled on the baked room art.
//
// THE RULE: the art is the room. Each plan here is traced from one `hf_int_*_room`
// texture — the room's tile dimensions match the texture's aspect, and every fixture
// painted into that texture (bar counter, clinic beds, shop aisles, booths) is mirrored
// as a `blocks` rect so you physically collide with the furniture you can see.
//
// This replaces the older arrangement, where the floor was a zone-HASHED pick from five
// generic VENUE_LAYOUTS and the venue's kind was carried only by loose furniture sprites
// scattered on seat tiles. Under that scheme a dive bar and a clinic could land the same
// 27×11 "hall" floor, and the ~1:1 room art was stretched to 2.45:1 to fit it.
//
// Pure data + pure functions — no Phaser — because the SERVER builds these grids too and
// collision is server-authoritative. Client and server must produce byte-identical grids,
// so the plan is resolved from the zone string alone (never from render state) and every
// resolver in this file is deterministic. Both sides call `buildVenueRoom(zone)`.
//
// Adding a kind: bake/trace the art, add a plan below, and venueLayouts.test.ts will hold
// you to the invariants (mat + spawn walkable, seats walkable and reachable, no sealed
// pockets, aspect close to the texture's). A kind with no plan falls back to the old
// hash-picked layout, so this rolls out one kind at a time.

import { DISTRICT_SCALE, TILE } from "../config";
import { bridgeWestTile, getBridge, travelSpawnTile } from "../game/bridges";
import type { DistrictDef } from "../game/districts";
import { districtBuildingKind, wildernessShackDef } from "../game/districtVenues";
import { ONLINE_CITY, type BuildingKind } from "./city";
import {
  HUB_SERVICE_ROOMS,
  SAFEHOUSE_SPAWN,
  buildVenueRoomFromLayout,
  gridH,
  gridW,
  hashVenueLayoutFor,
  isSafehouseSizedInterior,
  isVenueSizedZone,
  isWall,
  nearestWalkable,
  spawnPoint,
  venueSpawnForLayout,
  type TileGrid,
  type VenueLayout,
} from "./district";

const S = DISTRICT_SCALE;

/**
 * Per-kind room plans, traced from the baked art. Kinds absent here fall back to the
 * zone-hashed generic layout — that fallback is what makes this incremental.
 *
 * Tile coords are inclusive rects [x0, y0, x1, y1]. Row 0 and the last row/col are the
 * wall ring. `tag` only selects the generic floor plate if the art fails to load.
 */
export const ROOM_PLANS: Partial<Record<BuildingKind, VenueLayout>> = {
  // DIVE BAR — hf_int_bar_room (178×180, ~1:1).
  // Art reads: long bar counter across the north-west, two booths against the east wall,
  // two booths across the south, open drinking floor in the middle, entrance south-centre.
  bar: {
    w: 15,
    h: 15,
    mat: [7, 13],
    tag: "studio",
    art: "hf_int_bar_room",
    blocks: [
      // Bar counter + back bar, flush to the west wall as the art paints it — leaving a
      // gap at x=1 would model a 1-tile dead-end corridor that isn't in the picture.
      [1, 1, 6, 3],
      [11, 6, 13, 7], // east booth, upper — row 8 is the aisle between the two
      [11, 9, 13, 10], // east booth, lower
      [4, 10, 6, 12], // south booth, west — x=7 stays clear as the entrance lane
      [8, 10, 10, 12], // south booth, east
    ],
    seats: [
      [4, 4], // barkeep, working the front of the counter
      [7, 6], // middle of the drinking floor
      [12, 8], // the aisle between the east booths
      [2, 7], // west wall
    ],
  },

  // CLINIC — hf_int_clinic_room (171×180, ~0.95).
  // Art reads: reception counter north-west, medbays lined down the east wall with an
  // aisle in front of them, supply cabinets on the west, green cross decal on the floor.
  clinic: {
    w: 15,
    h: 16,
    mat: [7, 14],
    tag: "studio",
    art: "hf_int_clinic_room",
    blocks: [
      [1, 1, 5, 3], // reception counter
      [11, 5, 13, 6], // medbay 1 — x=10 stays clear as the ward aisle
      [11, 8, 13, 9], // medbay 2
      [11, 11, 13, 12], // medbay 3
      [1, 6, 2, 7], // supply cabinets, west wall
    ],
    seats: [
      [4, 5], // medic at the counter
      [7, 7], // the cross on the floor
      [10, 6], // ward aisle
      [3, 10], // west of the floor
    ],
  },

  // MARKET STALL — hf_int_shop_room (162×180, ~0.90).
  // Art reads: three tall shelf aisles running north–south, stock shelving along both
  // side walls, a register island at the south, browsing space between the aisles.
  shop: {
    w: 15,
    h: 16,
    mat: [7, 14],
    tag: "studio",
    art: "hf_int_shop_room",
    blocks: [
      [3, 2, 3, 8], // shelf aisle, west   — row 1 and row 9+ stay open so aisles connect
      [7, 2, 7, 8], // shelf aisle, middle
      [11, 2, 11, 8], // shelf aisle, east
      [1, 2, 1, 9], // wall shelving, west
      [13, 2, 13, 9], // wall shelving, east
      [6, 11, 8, 12], // register island
    ],
    seats: [
      [7, 10], // vendor, in front of the register
      [5, 5], // between the west aisles
      [9, 5], // between the east aisles
      [2, 11], // south-west floor
    ],
  },

  // GUILD HALL — hf_int_guild_room (176×180, ~0.98).
  // Art reads: a lit war table dead centre, weapon racks paired along both side walls,
  // a banner/dais across the north, circulation space around the table.
  guild: {
    w: 15,
    h: 15,
    mat: [7, 13],
    tag: "studio",
    art: "hf_int_guild_room",
    blocks: [
      [5, 1, 9, 2], // dais / banner wall, north
      [6, 6, 9, 8], // the war table
      [1, 4, 2, 5], // weapon rack, west upper
      [1, 8, 2, 9], // weapon rack, west lower
      [12, 4, 13, 5], // weapon rack, east upper
      [12, 8, 13, 9], // weapon rack, east lower
    ],
    seats: [
      [7, 4], // quartermaster, north of the table
      [5, 7], // west side of the table
      [10, 7], // east side of the table
      [7, 10], // south of the table
    ],
  },

  // THE DEN — hf_int_den_room (150×160, ~0.94).
  // Art reads: crate stacks in the north-west, terminal bank in the north-east, cargo
  // piled against both side walls, a low table south of centre.
  den: {
    w: 15,
    h: 16,
    mat: [7, 14],
    tag: "studio",
    art: "hf_int_den_room",
    blocks: [
      [1, 1, 4, 3], // crate stacks, north-west
      [10, 1, 13, 3], // terminal bank, north-east
      [1, 7, 3, 9], // cargo, west wall
      [11, 7, 13, 9], // cargo, east wall
      [5, 11, 9, 12], // low table, south of centre
    ],
    seats: [
      [7, 5], // fixer, mid-floor
      [4, 8], // west of the floor
      [10, 5], // by the terminals
      [7, 9], // centre
    ],
  },

  // TENEMENT — hf_int_home_room (143×160, ~0.89). NOTE: district `home` venues only.
  // est{K} player estates never resolve a kind (see venueKindForZone) and stay bare, so
  // this art can't leak into a home the player is meant to decorate themselves.
  // Art reads: kitchen counter north-west, storage north-east, couch against the east
  // wall, shelving on the west, an open rug in the middle.
  home: {
    w: 15,
    h: 16,
    mat: [7, 14],
    tag: "studio",
    art: "hf_int_home_room",
    blocks: [
      [1, 1, 3, 3], // kitchen counter
      [11, 1, 13, 3], // storage
      [1, 6, 2, 8], // shelving, west wall
      [11, 6, 13, 8], // couch, east wall
    ],
    seats: [
      [7, 6], // on the rug
      [4, 4], // by the kitchen
      [10, 4], // by the storage
      [3, 10], // south-west floor
    ],
  },

  // CIVIC SPIRE — hf_int_citycenter_room (179×180, ~0.99).
  // Art reads: a glowing civic emblem inlaid in the floor dead centre (walkable — it is
  // a floor inlay, not a fixture) ringed by four support columns, open plaza around it.
  citycenter: {
    w: 15,
    h: 15,
    mat: [7, 13],
    tag: "studio",
    art: "hf_int_citycenter_room",
    blocks: [
      [3, 3, 4, 4], // column, north-west
      [10, 3, 11, 4], // column, north-east
      [3, 10, 4, 11], // column, south-west
      [10, 10, 11, 11], // column, south-east
    ],
    seats: [
      [7, 6], // north of the emblem
      [7, 9], // south of the emblem
      [4, 7], // west of the emblem
      [10, 7], // east of the emblem
    ],
  },

  // THE CRUCIBLE — hf_int_stadium_room (173×180, ~0.96).
  // Art reads: an octagonal fight floor with chevron markings, stands packed around the
  // outside. The corners are cut to read as the octagon; the centre stays clear to fight in.
  stadium: {
    w: 15,
    h: 16,
    mat: [7, 14],
    tag: "studio",
    art: "hf_int_stadium_room",
    blocks: [
      [1, 1, 3, 2], // corner cut, north-west
      [11, 1, 13, 2], // corner cut, north-east
      [1, 13, 3, 14], // corner cut, south-west
      [11, 13, 13, 14], // corner cut, south-east
    ],
    seats: [
      [7, 4], // north of the fight floor
      [4, 8], // west
      [10, 8], // east
      [7, 11], // south
    ],
  },
};

/**
 * The venue KIND a zone holds, derived from the zone id alone.
 *
 * Must stay pure and side-effect free: the server calls this to build collision and the
 * client calls it to build its local mirror. Anything that isn't an enterable venue
 * (est{K} homes, w{N}s{K} shacks, named service zones) returns null and takes the
 * hash-picked fallback plan.
 */
export function venueKindForZone(zone?: string | null): BuildingKind | null {
  if (!zone) return null;
  const district = /^d\d+i(\d+)$/.exec(zone);
  if (district) return districtBuildingKind(Number(district[1]));
  const hub = /^h(\d+)$/.exec(zone);
  if (hub) return ONLINE_CITY.buildings[Number(hub[1])]?.kind ?? null;
  // The hub's named service venues are just that kind of venue: THE FERAL CAT is a bar.
  if (HUB_SERVICE_ROOMS.has(zone)) return zone as BuildingKind;
  return null;
}

/**
 * THE floor plan for a zone: the kind's art-traced room when it has one, else the
 * legacy hash-picked layout. Every grid/spawn/seat consumer must route through here so
 * the client and server never build different rooms for the same zone.
 */
export function venueLayoutFor(zone?: string | null): VenueLayout {
  const kind = venueKindForZone(zone);
  return (kind && ROOM_PLANS[kind]) || hashVenueLayoutFor(zone);
}

/** Server-authoritative interior collision for a venue zone. */
export function buildVenueRoom(zone?: string): TileGrid {
  return buildVenueRoomFromLayout(venueLayoutFor(zone));
}

/** Arrival point for a venue zone — one step inside that plan's exit mat. */
export function venueSpawnFor(zone?: string | null, grid?: TileGrid): { x: number; y: number } {
  return venueSpawnForLayout(venueLayoutFor(zone), grid);
}

/** Spawn at a trail gate when entering from another zone; falls back to the zone's
 *  canonical spawn (when the caller knows it), then the district spawn.
 *  Always returns a candidate — callers MUST run resolveOpenSpawn (net/sim) for
 *  player-radius safety; server login does this as a hard guarantee. */
export function spawnPointForTravel(
  grid: TileGrid,
  zone: string,
  fromZone: string | undefined,
  def?: DistrictDef,
  zoneSpawn?: { x: number; y: number },
): { x: number; y: number } {
  let raw: { x: number; y: number };

  // Compact venue rooms (district buildings, hub buildings, estate homes) — always the
  // mat-adjacent entry tile OF THAT ZONE'S FLOOR PLAN. Using district/safehouse coords
  // here put runners outside the walls after walking in.
  if (isVenueSizedZone(zone)) {
    raw = venueSpawnFor(zone, grid);
  } else if (isSafehouseSizedInterior(zone)) {
    // Named hub service interiors (clinic/bar/den/shop/vault) use the large safehouse plan.
    const open = nearestWalkable(
      grid,
      Math.floor(SAFEHOUSE_SPAWN.x / TILE),
      Math.floor(SAFEHOUSE_SPAWN.y / TILE),
      16,
    );
    raw = open
      ? { x: open[0] * TILE + TILE / 2, y: open[1] * TILE + TILE / 2 }
      : { x: SAFEHOUSE_SPAWN.x, y: SAFEHOUSE_SPAWN.y };
  } else {
    raw = { x: TILE * 1.5, y: TILE * 1.5 };
    let found = false;
    // stepping OUT of a district building interior ("d{N}i{K}") — arrive at that building's
    // doorstep, the same street tile its door portal occupies (mirrors the client's door math)
    const bm = fromZone ? /^d(\d+)i(\d+)$/.exec(fromZone) : null;
    if (bm && def && zone === `d${bm[1]}`) {
      const b = def.layout.buildings[parseInt(bm[2], 10)];
      if (b) {
        const tx = Math.round((b.x1 + b.x2) / 2) * S;
        const ty = b.y2 * S + 1;
        // Prefer a walkable tile SOUTH of the building — never inside the footprint.
        const candidates: Array<[number, number]> = [
          [tx, ty + 1],
          [tx, ty + 2],
          [tx - 1, ty + 1],
          [tx + 1, ty + 1],
          [tx, ty],
          [tx, ty + 3],
        ];
        for (const [cx, cy] of candidates) {
          if (grid[cy]?.[cx] !== undefined && !isWall(grid[cy][cx])) {
            raw = { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
            found = true;
            break;
          }
        }
        if (!found) {
          const near = nearestWalkable(grid, tx, ty + 1, 16);
          if (near) {
            raw = { x: near[0] * TILE + TILE / 2, y: near[1] * TILE + TILE / 2 };
            found = true;
          }
        }
      }
    }
    // Leaving a wilderness trail shack ("w{N}s{K}") — land on that shack's doorstep.
    const wsm = fromZone ? /^w(\d+)s(\d+)$/.exec(fromZone) : null;
    if (!found && wsm && zone === `w${wsm[1]}`) {
      const sh = wildernessShackDef(parseInt(wsm[1], 10), parseInt(wsm[2], 10));
      if (sh) {
        const tx = sh.door[0] * S;
        const ty = sh.door[1] * S;
        const candidates: Array<[number, number]> = [
          [tx, ty],
          [tx, ty + 1],
          [tx - 1, ty],
          [tx + 1, ty],
          [tx, ty + 2],
        ];
        for (const [cx, cy] of candidates) {
          if (grid[cy]?.[cx] !== undefined && !isWall(grid[cy][cx])) {
            raw = { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
            found = true;
            break;
          }
        }
        if (!found) {
          const near = nearestWalkable(grid, tx, ty, 16);
          if (near) {
            raw = { x: near[0] * TILE + TILE / 2, y: near[1] * TILE + TILE / 2 };
            found = true;
          }
        }
      }
    }
    if (!found) {
      const tile = travelSpawnTile(zone, fromZone);
      if (tile) {
        // Authored entry can land on a building roof — snap to nearest open street.
        const open = nearestWalkable(grid, tile[0], tile[1], 28);
        if (open) {
          raw = { x: open[0] * TILE + TILE / 2, y: open[1] * TILE + TILE / 2 };
          found = true;
        }
      }
    }
    if (!found && zoneSpawn) {
      const tx = Math.floor(zoneSpawn.x / TILE);
      const ty = Math.floor(zoneSpawn.y / TILE);
      const open = nearestWalkable(grid, tx, ty, 28);
      if (open) {
        raw = { x: open[0] * TILE + TILE / 2, y: open[1] * TILE + TILE / 2 };
        found = true;
      } else {
        raw = { x: zoneSpawn.x, y: zoneSpawn.y };
        found = true;
      }
    }
    if (!found && def) {
      raw = spawnPoint(grid, def);
      found = true;
    }
    if (!found) {
      // Last resort: first walkable tile on this grid.
      const gw = gridW(grid);
      const gh = gridH(grid);
      outer: for (let y = 1; y < gh - 1; y++) {
        for (let x = 1; x < gw - 1; x++) {
          if (!isWall(grid[y][x])) {
            raw = { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
            found = true;
            break outer;
          }
        }
      }
    }
    if (!found) {
      const [wx, wy] = bridgeWestTile(getBridge(0));
      const open = nearestWalkable(grid, wx, wy, 12);
      raw = open
        ? { x: open[0] * TILE + TILE / 2, y: open[1] * TILE + TILE / 2 }
        : { x: wx * TILE + TILE / 2, y: wy * TILE + TILE / 2 };
    }
  }

  return raw;
}
