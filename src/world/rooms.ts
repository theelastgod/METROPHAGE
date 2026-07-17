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
import { ESTATES, ESTATES_ZONE } from "./estates";
import {
  DIVE_SPAWN,
  HUB_SERVICE_ROOMS,
  buildVenueRoomFromLayout,
  gridH,
  gridW,
  hashVenueLayoutFor,
  isDivePlanInterior,
  isVenueSizedZone,
  isWall,
  nearestWalkable,
  spawnPoint,
  venueSpawnForLayout,
  type TileGrid,
  type VenueLayout,
} from "./district";

const S = DISTRICT_SCALE;

/** Named venue portals around the central hub, relative to ONLINE_CITY.spawn.
 *  Keep these aligned with CITY_HUB_DOORS in scenes/online/sceneConfig.ts. */
const HUB_SERVICE_DOOR_OFFSETS: Readonly<Record<string, readonly [number, number]>> = {
  clinic: [-4, -6],
  shop: [4, -6],
  bar: [-4, 6],
  den: [4, 6],
  vault: [12, 0],
};

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
      [1, 1, 7, 6], // kitchen + U-shaped bar counter
      [10, 1, 13, 5], // raised north-east lounge
      [10, 7, 13, 9], // east booth, middle
      [10, 11, 13, 13], // east booth, south
      [1, 9, 2, 13], // west storage bay
      [4, 11, 6, 13], // south booth, west
      [8, 11, 9, 13], // south booth, east; x=7 is the entrance lane
    ],
    seats: [
      [8, 4], // barkeep at the open end of the counter
      [7, 8], // middle of the drinking floor
      [9, 8], // aisle beside the east booth
      [3, 8], // west aisle
    ],
  },

  // MAMA TSE'S NOODLES — hf_int_noodle_room (576x576, square).
  // Art reads: a broad cooking counter in the north-west, booth banks along the east
  // and south walls, a storage bay to the west, and a clear south-centre entrance aisle.
  noodle: {
    w: 18,
    h: 18,
    mat: [9, 16],
    tag: "studio",
    art: "hf_int_noodle_room",
    blocks: [
      [1, 1, 8, 7], // kitchen, back bar, and L-shaped cooking counter
      [12, 1, 16, 6], // north-east booth bank
      [13, 8, 16, 11], // east booth, middle
      [13, 12, 16, 15], // east booth, south
      [1, 9, 3, 15], // west storage bay
      [5, 13, 8, 15], // south booth, west
      [10, 13, 12, 15], // south booth, east; x=9 remains the entry aisle
    ],
    seats: [
      [9, 7], // cook at the open end of the counter
      [11, 7], // aisle beside the north-east booths
      [12, 10], // middle booth aisle
      [9, 11], // open central dining floor
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
      [1, 1, 13, 5], // reception work area + north cabinets (staff-only back line)
      [10, 6, 13, 8], // medbay 1
      [10, 10, 13, 12], // medbay 2
      [1, 12, 4, 14], // south-west diagnostics terminal
    ],
    seats: [
      [9, 6], // medic at the open end of reception
      [7, 8], // the cross on the floor
      [9, 11], // ward aisle
      [3, 10], // west side of the floor
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
      [1, 1, 13, 2], // north stock wall
      [1, 3, 2, 10], // west wall shelving
      [4, 3, 5, 10], // shelf aisle, west
      [9, 3, 10, 10], // shelf aisle, east
      [12, 3, 13, 11], // east wall shelving and crates
      [5, 12, 6, 13], // register island, west half
      [8, 12, 9, 13], // register island, east half; x=7 keeps the door lane clear
    ],
    seats: [
      [7, 11], // vendor behind the register
      [3, 6], // west browsing aisle
      [7, 6], // central browsing aisle
      [11, 6], // east browsing aisle
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
      [4, 1, 10, 2], // command dais / banner wall
      [1, 1, 3, 2], // north-west equipment alcove (not a walkable pocket)
      [5, 4, 10, 10], // full raised holo war table
      [1, 3, 3, 9], // west weapon and equipment bank
      [12, 3, 13, 9], // east weapon and equipment bank
      [1, 11, 4, 13], // south-west console, flush to the walls
      [12, 11, 13, 13], // south-east workbench; x=11 remains a circulation lane
    ],
    seats: [
      [7, 3], // quartermaster at the north end
      [4, 7], // west side of the table
      [11, 7], // east side of the table
      [7, 11], // south of the table
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
      [1, 1, 13, 3], // terminal bank across the north wall
      [1, 4, 3, 7], // west cargo stack, upper
      [1, 10, 4, 13], // west cargo stack, lower
      [11, 4, 13, 10], // east couch and cargo bank
      [11, 12, 13, 14], // south-east equipment
      [7, 6, 9, 10], // central low table
    ],
    seats: [
      [7, 4], // fixer below the terminals
      [4, 8], // west aisle
      [10, 5], // beside the couch
      [7, 11], // south of the table
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
      [5, 1, 10, 3], // north console
      [1, 1, 4, 3], // closed north-west end of the couch alcove
      [1, 4, 4, 12], // long west couch
      [12, 5, 13, 12], // east storage console
      [6, 6, 8, 10], // coffee table on the rug
      [11, 1, 13, 3], // north-east plant / cabinet
    ],
    seats: [
      [9, 8], // east side of the rug
      [5, 4], // by the north console
      [11, 4], // by the storage
      [5, 11], // south-west floor
    ],
  },

  // CIVIC SPIRE — hf_int_citycenter_room (179×180, ~0.99).
  // Art reads: a raised circular civic emitter in the centre, reception across the north,
  // and a freestanding access terminal on the south approach.
  citycenter: {
    w: 15,
    h: 15,
    mat: [7, 13],
    tag: "studio",
    art: "hf_int_citycenter_room",
    blocks: [
      [3, 1, 11, 3], // north reception desk
      [5, 5, 9, 9], // raised civic emitter
      [8, 11, 9, 12], // south access terminal; centre-left approach stays open
    ],
    seats: [
      [7, 4], // north of the emitter
      [6, 11], // south-west approach
      [4, 7], // west of the emitter
      [10, 7], // east of the emitter
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

// Second-pass Higgsfield venues. Each square plan is traced from its own 576px plate;
// the south-centre entrance and central aisle stay clear in every room.
ROOM_PLANS.ripperdoc = {
  w: 18, h: 18, mat: [9, 16], tag: "studio", art: "hf_int_ripperdoc_room",
  blocks: [
    [1, 1, 7, 7], [11, 1, 16, 7], // surgery and diagnostics bays
    [1, 10, 7, 15], [11, 10, 16, 15], // fabrication and consultation bays
  ],
  seats: [[9, 5], [9, 9], [8, 12], [10, 12]],
};
ROOM_PLANS.pawn = {
  w: 18, h: 18, mat: [9, 16], tag: "studio", art: "hf_int_pawn_room",
  blocks: [
    [1, 1, 8, 7], [13, 1, 16, 6], // counter and secure appraisal booth
    [1, 10, 3, 15], [12, 8, 16, 14], // stock wall and display islands
  ],
  seats: [[9, 6], [11, 5], [7, 10], [10, 12]],
};
ROOM_PLANS.arcade = {
  w: 18, h: 18, mat: [9, 16], tag: "studio", art: "hf_int_arcade_room",
  blocks: [
    [1, 1, 8, 7], [13, 1, 16, 6], // prize counter and simulator stage
    [2, 10, 6, 15], [8, 10, 8, 15], [10, 10, 12, 15], [14, 9, 16, 14], // cabinet banks; x=9 is the entry lane
  ],
  seats: [[9, 7], [11, 8], [7, 9], [13, 8]],
};
ROOM_PLANS.garage = {
  w: 18, h: 18, mat: [9, 16], tag: "studio", art: "hf_int_garage_room",
  blocks: [
    [1, 1, 8, 7], [12, 1, 16, 6], // machine bench and parts store
    [1, 11, 6, 15], [10, 9, 16, 15], // tool bench and vehicle lift
  ],
  seats: [[9, 6], [10, 8], [8, 11], [7, 8]],
};
ROOM_PLANS.radio = {
  w: 18, h: 18, mat: [9, 16], tag: "studio", art: "hf_int_radio_room",
  blocks: [
    [1, 1, 8, 7], [12, 1, 16, 6], // broadcast desk and listening booth
    [11, 8, 16, 11], [11, 13, 16, 15], // isolation pods
    [4, 12, 7, 15], // south studio island, leaving the door lane clear
  ],
  seats: [[9, 6], [10, 9], [8, 11], [9, 13]],
};
ROOM_PLANS.hotel = {
  w: 18, h: 18, mat: [9, 16], tag: "studio", art: "hf_int_hotel_room",
  blocks: [
    [1, 1, 8, 7], // reception and key counter
    [12, 1, 16, 6], [12, 8, 16, 11], [12, 13, 16, 15], // sleep pods
    [1, 10, 3, 15], // service/storage wall
  ],
  seats: [[9, 6], [10, 9], [10, 12], [8, 12]],
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
  const district = /^d(\d+)i(\d+)$/.exec(zone);
  if (district) return districtBuildingKind(Number(district[2]), Number(district[1]));
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
  } else if (isDivePlanInterior(zone)) {
    // THE PROVING is handed a dive grid, so it must seed from the dive's entry pad.
    // Seeding from SAFEHOUSE_SPAWN (20,15) dropped runners mid-corridor, past the entry
    // hall and away from the surface exit the plan puts at DIVE_SPAWN.
    const open = nearestWalkable(
      grid,
      Math.floor(DIVE_SPAWN.x / TILE),
      Math.floor(DIVE_SPAWN.y / TILE),
      16,
    );
    raw = open
      ? { x: open[0] * TILE + TILE / 2, y: open[1] * TILE + TILE / 2 }
      : { x: DIVE_SPAWN.x, y: DIVE_SPAWN.y };
  } else {
    raw = { x: TILE * 1.5, y: TILE * 1.5 };
    let found = false;
    // Every hub building has its own interior ("h{K}"). Return to that exact façade,
    // one tile south of its carved doorway, instead of the city-wide spawn pad.
    const hm = fromZone ? /^h(\d+)$/.exec(fromZone) : null;
    if (hm && zone === "safe") {
      const b = ONLINE_CITY.buildings[parseInt(hm[1], 10)];
      const door = b?.door;
      if (door) {
        const [tx, ty] = door;
        const candidates: Array<[number, number]> = [
          [tx, ty + 1],
          [tx, ty + 2],
          [tx - 1, ty + 1],
          [tx + 1, ty + 1],
          [tx, ty],
        ];
        for (const [cx, cy] of candidates) {
          if (grid[cy]?.[cx] !== undefined && !isWall(grid[cy][cx])) {
            raw = { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
            found = true;
            break;
          }
        }
      }
    }
    // Legacy named hub venues use freestanding portals around the plaza rather than
    // ONLINE_CITY building indices. They still return to the portal that was entered.
    const serviceOffset = fromZone ? HUB_SERVICE_DOOR_OFFSETS[fromZone] : undefined;
    if (!found && serviceOffset && zone === "safe") {
      const tx = ONLINE_CITY.spawn[0] + serviceOffset[0];
      const ty = ONLINE_CITY.spawn[1] + serviceOffset[1];
      const open = nearestWalkable(grid, tx, ty, 12);
      if (open) {
        raw = { x: open[0] * TILE + TILE / 2, y: open[1] * TILE + TILE / 2 };
        found = true;
      }
    }
    // Private estate interiors ("est{K}") return to their own street-side doorstep.
    const em = fromZone ? /^est(\d+)$/.exec(fromZone) : null;
    if (!found && em && zone === ESTATES_ZONE) {
      const plot = ESTATES.plots[parseInt(em[1], 10)];
      if (plot) {
        const [tx, ty] = plot.door;
        const open = nearestWalkable(grid, tx, ty, 12);
        if (open) {
          raw = { x: open[0] * TILE + TILE / 2, y: open[1] * TILE + TILE / 2 };
          found = true;
        }
      }
    }
    // stepping OUT of a district building interior ("d{N}i{K}") — arrive at that building's
    // doorstep, the same street tile its door portal occupies (mirrors the client's door math)
    const bm = fromZone ? /^d(\d+)i(\d+)$/.exec(fromZone) : null;
    if (!found && bm && def && zone === `d${bm[1]}`) {
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
