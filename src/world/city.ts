// METROPHAGE — procedural big-city generator for the explorable, RuneScape-style hub
// (CityScene). Produces a large tile grid: an avenue street-grid carving the map into
// blocks, each block holding a building footprint with a single walkable DOOR (so it
// can be entered, Step 2), plus plazas/parks and NPC/landmark spots. Pure data — no
// Phaser — so the sim/UI can reason about it; deterministic via a seed.

import { TILE, CITY_SCALE } from "../config";
import {
  TILE_FLOOR,
  TILE_SIDEWALK,
  TILE_LANE,
  TILE_PLAZA,
  TILE_WALL,
  TILE_GRASS,
  TILE_WATER,
  TILE_WALL_IND,
  TILE_WALL_RES,
  TILE_WALL_CORP,
  TILE_MARKET,
  TILE_GRATE,
  TILE_CROSSWALK,
  TILE_NEON,
  TILE_DIRT,
  TILE_WALL_SLUM,
  TILE_INNER_FLOOR,
  TILE_INNER_WALL,
  isWall,
  type TileGrid,
} from "./district";

// Compact hub: a walkable town of ~30 buildings ringing the central plaza, not a 450-tile
// sprawl. (Was 180×144 ×2.5 = 450×360 / ~605 buildings.) Fixtures anchor to the plaza
// centre via hubT(), so they follow the smaller footprint automatically.
const CITY_BASE_W = 112;
const CITY_BASE_H = 88;
export const CITY_W = Math.round(CITY_BASE_W * CITY_SCALE);
export const CITY_H = Math.round(CITY_BASE_H * CITY_SCALE);

/** A cyberpunk environment/zone with its own ground + building palette. */
export type Env =
  | "downtown"
  | "corporate"
  | "market"
  | "residential"
  | "industrial"
  | "slum"
  | "park"
  | "docks"
  | "undercity"
  | "arcology";

interface EnvPalette {
  ground: number; // open ground inside the block
  sidewalk: number; // border ring around buildings
  wall: number; // building footprint
}

const ENV: Record<Env, EnvPalette> = {
  downtown: { ground: TILE_NEON, sidewalk: TILE_PLAZA, wall: TILE_WALL },
  corporate: { ground: TILE_SIDEWALK, sidewalk: TILE_SIDEWALK, wall: TILE_WALL_CORP },
  market: { ground: TILE_MARKET, sidewalk: TILE_MARKET, wall: TILE_WALL },
  residential: { ground: TILE_SIDEWALK, sidewalk: TILE_SIDEWALK, wall: TILE_WALL_RES },
  industrial: { ground: TILE_GRATE, sidewalk: TILE_FLOOR, wall: TILE_WALL_IND },
  slum: { ground: TILE_DIRT, sidewalk: TILE_DIRT, wall: TILE_WALL_SLUM },
  park: { ground: TILE_GRASS, sidewalk: TILE_GRASS, wall: TILE_WALL_RES },
  docks: { ground: TILE_WATER, sidewalk: TILE_SIDEWALK, wall: TILE_WALL_IND },
  undercity: { ground: TILE_GRATE, sidewalk: TILE_DIRT, wall: TILE_WALL_SLUM },
  arcology: { ground: TILE_NEON, sidewalk: TILE_PLAZA, wall: TILE_WALL_CORP },
};

/** Decorative prop kinds scattered per-environment (rendered by CityScene). */
export type PropKind =
  | "billboard"
  | "planter"
  | "stall"
  | "lantern"
  | "pipe"
  | "barrel"
  | "fire"
  | "trash"
  | "tree"
  | "bench";

/** The look + feel signature of each district: a name, a neon accent, a screen-mood
 *  tint (rgb 0..1 for the Neon pipeline), a ground colour-wash, and which props live
 *  there. This is what makes each environment read as a distinct place. */
export interface EnvIdentity {
  name: string;
  accent: number;
  tint: [number, number, number];
  wash: number;
  washAlpha: number;
  props: PropKind[];
}

export const ENV_IDENTITY: Record<Env, EnvIdentity> = {
  downtown: { name: "NEON CORE", accent: 0xff2bd6, tint: [1.0, 0.3, 1.0], wash: 0xff2bd6, washAlpha: 0.06, props: ["billboard", "billboard", "lantern"] },
  corporate: { name: "CORP ROW", accent: 0x29e7ff, tint: [0.3, 0.75, 1.0], wash: 0x1f4f9e, washAlpha: 0.1, props: ["planter", "billboard", "planter"] },
  market: { name: "THE BAZAAR", accent: 0xffb13c, tint: [1.0, 0.72, 0.3], wash: 0xff9a3c, washAlpha: 0.08, props: ["stall", "stall", "lantern"] },
  residential: { name: "THE TERRACES", accent: 0xff8a5c, tint: [1.0, 0.62, 0.42], wash: 0xff7a4c, washAlpha: 0.06, props: ["lantern", "bench", "planter"] },
  industrial: { name: "THE WORKS", accent: 0x8bff6a, tint: [0.5, 1.0, 0.45], wash: 0x49632a, washAlpha: 0.12, props: ["pipe", "barrel", "pipe"] },
  slum: { name: "THE SPRAWL", accent: 0xff5a3c, tint: [1.0, 0.45, 0.32], wash: 0x6e2c1c, washAlpha: 0.12, props: ["fire", "trash", "barrel"] },
  park: { name: "GREENWAY", accent: 0x39ff88, tint: [0.4, 1.0, 0.6], wash: 0x216e3c, washAlpha: 0.1, props: ["tree", "tree", "bench"] },
  docks: { name: "TIDAL YARDS", accent: 0x29e7ff, tint: [0.3, 0.85, 1.0], wash: 0x1a4a6e, washAlpha: 0.14, props: ["barrel", "pipe", "lantern"] },
  undercity: { name: "THE UNDERCITY", accent: 0xb06bff, tint: [0.7, 0.4, 1.0], wash: 0x3a1a5e, washAlpha: 0.14, props: ["pipe", "trash", "fire"] },
  arcology: { name: "ARC ROW", accent: 0x6b9bff, tint: [0.45, 0.7, 1.0], wash: 0x2a3a8e, washAlpha: 0.12, props: ["billboard", "planter", "billboard"] },
};

/** Which environment a world tile belongs to (for the colour-wash + district nameplate). */
export function envAt(tileX: number, tileY: number, w: number, h: number): Env {
  return envForBlock(tileX / w, tileY / h);
}

/** Which environment a block belongs to — concentric rings + quadrants around the
 *  downtown core, so you cross distinct districts as you walk out from the centre. */
function envForBlock(nx: number, ny: number): Env {
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  const r = Math.hypot(dx, dy);
  if (r < 0.1) return "downtown";
  if (r < 0.2) return dx < 0 ? "corporate" : "market";
  if (r < 0.3) {
    if (dy < -0.08) return "arcology";
    if (dy > 0.08) return "residential";
    return dx < 0 ? "corporate" : "market";
  }
  if (r < 0.4) {
    if (dy > 0.14) return "industrial";
    if (dy < -0.14) return "docks";
    return dx < 0 ? "industrial" : "slum";
  }
  if (r < 0.5) {
    if (dx < -0.18) return "undercity";
    if (dx > 0.18) return "docks";
    return dy < 0 ? "arcology" : "slum";
  }
  if (dy < -0.22) return "docks";
  if (dy > 0.22) return "industrial";
  return dx < 0 ? "undercity" : "slum";
}

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type BuildingKind =
  | "home"
  | "shop"
  | "den"
  | "guild"
  | "clinic"
  | "bar"
  | "hospital" // full heal + cure (the low-HP loop)
  | "hotel" // rest to recover
  | "subway" // metro — gateway to the underground (combat dungeon)
  | "stadium" // THE CRUCIBLE — PvP arena
  | "citycenter"; // CIVIC SPIRE — landmark plaza

/** Heal buildings restore the player's persisted HP when you talk to the keeper. */
export const HEAL_KINDS: ReadonlyArray<BuildingKind> = ["hospital", "hotel", "clinic"];

/** Unique landmark buildings — exactly one each, placed near the plaza so they're findable. */
export const LANDMARK_KINDS: ReadonlyArray<BuildingKind> = ["hospital", "hotel", "subway", "stadium", "citycenter"];

/** Roof tile per building kind — makes exteriors read as different structures at a glance. */
export function roofTileForKind(kind: BuildingKind, env: Env): number {
  switch (kind) {
    case "hospital":
    case "hotel":
    case "citycenter":
      return TILE_WALL_CORP;
    case "home":
      return TILE_WALL_RES;
    case "den":
      return TILE_WALL_SLUM;
    case "guild":
    case "subway":
      return TILE_WALL_IND;
    case "shop":
      // NOT TILE_MARKET / TILE_NEON — those are walkable GROUND tiles; as roofs they
      // let players stroll on top of every shop and bar in the city (both the client
      // and the server share this grid, so collision agreed with the stroll). The
      // facade paint + rooftop lights carry each kind's look — the roof must be wall.
      return ENV[env].wall;
    case "bar":
      return TILE_WALL_SLUM;
    case "clinic":
      return TILE_WALL_CORP;
    case "stadium":
      return TILE_WALL;
    default:
      return ENV[env].wall;
  }
}

function fillRect(grid: TileGrid, r: Rect, tile: number) {
  for (let y = r.y1; y <= r.y2; y++) {
    for (let x = r.x1; x <= r.x2; x++) grid[y][x] = tile;
  }
}

/** Repaint each building footprint with its kind-specific roof tile (restores doors). */
export function applyBuildingRoofTiles(grid: TileGrid, buildings: CityBuilding[]) {
  for (const b of buildings) {
    fillRect(grid, b.rect, roofTileForKind(b.kind, b.env));
    if (!b.door) continue;
    const pal = ENV[b.env];
    grid[b.door[1]][b.door[0]] = pal.sidewalk;
    if (b.door[1] + 1 < grid.length) grid[b.door[1] + 1][b.door[0]] = pal.sidewalk;
  }
}

export interface CityBuilding {
  rect: Rect; // wall footprint
  door?: [number, number]; // walkable opening (absent → scenery, not enterable)
  kind: BuildingKind;
  env: Env;
  id: string;
}

export interface CityMap {
  grid: TileGrid;
  w: number;
  h: number;
  spawn: [number, number]; // tile coords (central plaza)
  buildings: CityBuilding[];
  plazas: Rect[];
  /** Curated open spots (tile coords) where NPCs / props can stand on walkable ground. */
  npcSpots: [number, number][];
  /** Per-block environment regions (for the colour-wash + minimap). */
  zones: Array<{ rect: Rect; env: Env }>;
  /** Environment-specific decorative props (tile coords). */
  decorations: Array<{ kind: PropKind; x: number; y: number }>;
}

/** Deterministic RNG (mulberry32) so the city is identical every run for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BLOCK = 14; // avenue spacing (tiles): blocks are ~BLOCK-2 wide between roads
const ROAD_W = 2; // avenue width

function fill(grid: TileGrid, r: Rect, tile: number) {
  for (let y = r.y1; y <= r.y2; y++)
    for (let x = r.x1; x <= r.x2; x++) if (grid[y]?.[x] !== undefined) grid[y][x] = tile;
}

const KINDS: BuildingKind[] = ["home", "home", "shop", "bar", "clinic", "den", "guild", "home", "shop"];

/** Block column/row ranges between the avenues (the gaps the city fills with blocks). */
function blockRanges(size: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 1;
  for (let road = BLOCK; road < size - 1; road += BLOCK) {
    if (road - 1 >= start) out.push([start, road - 1]);
    start = road + ROAD_W;
  }
  if (size - 2 >= start) out.push([start, size - 2]);
  return out;
}

/** Build the big city grid + metadata: an avenue grid of environment-zoned blocks. */
export function buildCity(seed = 1337, w = CITY_W, h = CITY_H): CityMap {
  const rand = mulberry32(seed);
  const grid: TileGrid = [];
  for (let y = 0; y < h; y++) grid.push(new Array(w).fill(TILE_FLOOR));

  // outer wall ring
  for (let x = 0; x < w; x++) {
    grid[0][x] = TILE_WALL;
    grid[h - 1][x] = TILE_WALL;
  }
  for (let y = 0; y < h; y++) {
    grid[y][0] = TILE_WALL;
    grid[y][w - 1] = TILE_WALL;
  }

  // avenue grid — roads at regular intervals; crosswalks where they cross
  const roadCols = new Set<number>();
  const roadRows = new Set<number>();
  for (let x = BLOCK; x < w - 1; x += BLOCK) for (let i = 0; i < ROAD_W; i++) roadCols.add(x + i);
  for (let y = BLOCK; y < h - 1; y += BLOCK) for (let i = 0; i < ROAD_W; i++) roadRows.add(y + i);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const rc = roadCols.has(x);
      const rr = roadRows.has(y);
      if (rc && rr) grid[y][x] = TILE_CROSSWALK;
      else if (rc || rr) grid[y][x] = TILE_LANE;
    }

  // central plaza (downtown core) — the spawn
  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);
  const plazas: Rect[] = [];
  // The plaza must always contain the hand-placed hub fixtures (venue doors at ±12 x,
  // citizen NPCs at +14 y, mining nodes) so none strand inside a building after a shrink.
  const plazaRx = Math.max(14, Math.round(w * 0.022));
  const plazaRy = Math.max(16, Math.round(h * 0.019));
  const central: Rect = { x1: cx - plazaRx, y1: cy - plazaRy, x2: cx + plazaRx, y2: cy + plazaRy };
  fill(grid, central, TILE_PLAZA);
  plazas.push(central);

  const buildings: CityBuilding[] = [];
  const zones: Array<{ rect: Rect; env: Env }> = [];
  const decorations: Array<{ kind: PropKind; x: number; y: number }> = [];
  const npcSpots: [number, number][] = [
    [cx - 4, cy - 3],
    [cx + 4, cy - 3],
    [cx - 4, cy + 3],
    [cx + 4, cy + 3],
    [cx, cy - 4],
  ];
  let bid = 0;

  /** Drop an env-typed prop on a walkable tile (skips walls / out-of-bounds). */
  const placeProp = (env: Env, tx: number, ty: number) => {
    if (tx < 1 || ty < 1 || tx >= w - 1 || ty >= h - 1) return;
    if (isWall(grid[ty][tx])) return;
    const kinds = ENV_IDENTITY[env].props;
    decorations.push({ kind: kinds[Math.floor(rand() * kinds.length)], x: tx, y: ty });
  };

  const cols = blockRanges(w);
  const rows = blockRanges(h);
  for (const [ry1, ry2] of rows) {
    for (const [bx1, bx2] of cols) {
      if (bx2 - bx1 < 3 || ry2 - ry1 < 3) continue;
      // skip the central plaza block
      if (bx1 <= central.x2 && bx2 >= central.x1 && ry1 <= central.y2 && ry2 >= central.y1) continue;

      const mcx = (bx1 + bx2) / 2;
      const mcy = (ry1 + ry2) / 2;
      const env = envForBlock(mcx / w, mcy / h);
      const pal = ENV[env];
      // paint the block's ground (the env's surface — sidewalk/grate/dirt/grass/neon…)
      fill(grid, { x1: bx1, y1: ry1, x2: bx2, y2: ry2 }, pal.ground);
      zones.push({ rect: { x1: bx1, y1: ry1, x2: bx2, y2: ry2 }, env });

      const roll = rand();
      if (roll < 0.22) {
        // an open square / park — keep the ground; parks get a small pond
        if (env === "park" || env === "residential") {
          const px1 = Math.round(mcx) - 2;
          const py1 = Math.round(mcy) - 1;
          fill(grid, { x1: px1, y1: py1, x2: px1 + 3, y2: py1 + 2 }, TILE_WATER);
        }
        plazas.push({ x1: bx1, y1: ry1, x2: bx2, y2: ry2 });
        npcSpots.push([Math.round(mcx), Math.round(mcy)]);
        // squares read as the district's commons — scatter a few env props around the edge
        placeProp(env, bx1, ry1);
        placeProp(env, bx2, ry2);
        placeProp(env, bx1, ry2);
        continue;
      }

      // a building, inset by 1 (a paved sidewalk ring stays walkable around it)
      const ix1 = bx1 + 1;
      const iy1 = ry1 + 1;
      const ix2 = bx2 - 1;
      const iy2 = ry2 - 1;
      if (ix2 - ix1 < 2 || iy2 - iy1 < 2) continue;
      fill(grid, { x1: ix1, y1: iy1, x2: ix2, y2: iy2 }, pal.wall);

      const kind = KINDS[(bid + Math.floor(roll * 100)) % KINDS.length];
      // EVERY hub building is enterable now (walk in, meet its resident). Still consume the
      // roll so the rest of the deterministic layout is unchanged.
      rand();
      let door: [number, number] | undefined;
      {
        const doorX = Math.round((ix1 + ix2) / 2);
        const doorY = iy2; // a walkable opening in the building's bottom wall
        grid[doorY][doorX] = pal.sidewalk;
        if (doorY + 1 <= ry2) grid[doorY + 1][doorX] = pal.sidewalk;
        door = [doorX, doorY];
        if (doorY + 2 < h && !isWall(grid[doorY + 2][doorX])) npcSpots.push([doorX, doorY + 2]);
      }
      buildings.push({ rect: { x1: ix1, y1: iy1, x2: ix2, y2: iy2 }, door, kind, env, id: `bldg_${bid++}` });
      // a prop or two on the sidewalk ring, so the street reads as its district
      if (rand() < 0.75) placeProp(env, bx1, ry2);
      if (rand() < 0.4) placeProp(env, bx2, ry1);
    }
  }

  // Promote the nearest enterable homes into the unique landmarks (hospital, hotel,
  // subway, stadium, civic spire) so each exists exactly once, close to the plaza.
  const distToCentre = (b: CityBuilding) =>
    ((b.rect.x1 + b.rect.x2) / 2 - cx) ** 2 + ((b.rect.y1 + b.rect.y2) / 2 - cy) ** 2;
  const homes = buildings.filter((b) => b.door && b.kind === "home").sort((a, b) => distToCentre(a) - distToCentre(b));
  LANDMARK_KINDS.forEach((lk, i) => {
    if (homes[i]) homes[i].kind = lk;
  });

  applyBuildingRoofTiles(grid, buildings);

  return { grid, w, h, spawn: [cx, cy], buildings, plazas, npcSpots, zones, decorations };
}

/** Shared online city hub — deterministic seed so every client + server agree. */
export const ONLINE_CITY = buildCity(1337);

/** World-pixel spawn at the central plaza (online hub default). */
export const CITY_HUB_SPAWN = {
  x: ONLINE_CITY.spawn[0] * TILE + TILE / 2,
  y: ONLINE_CITY.spawn[1] * TILE + TILE / 2,
};

// ── interiors ───────────────────────────────────────────────────────────────
// Each building entered opens a small room. Rooms are generated per `kind` so a shop
// reads different from a home; the EXIT tile (a door in the bottom wall) returns to
// the city, and npcSpots place the shopkeeper / quest-giver (Step 3).

/** A decorative interior furnishing (rendered by CityScene; non-colliding). */
export interface InteriorProp {
  kind: string;
  x: number;
  y: number;
}

export interface Interior {
  grid: TileGrid;
  w: number;
  h: number;
  spawn: [number, number]; // player appears here (just inside the exit)
  exit: [number, number]; // step onto this tile to leave
  npcSpots: [number, number][];
  props: InteriorProp[]; // furniture
  name: string;
}

/** Per-kind furniture layout for a 20×13 room (tile coords; `ex` is the exit column). */
function furnishInterior(kind: BuildingKind, ex: number): InteriorProp[] {
  const p: InteriorProp[] = [];
  const add = (k: string, x: number, y: number) => p.push({ kind: k, x, y });
  if (kind === "bar") {
    for (const x of [4, 6, 8, 12, 14]) add("bottles", x, 2); // back bar shelf
    add("sign", ex, 1);
    for (const x of [5, 8, 12, 15]) add("stool", x, 6); // bar stools
    add("table", 5, 9); add("stool", 6, 10); add("table", 15, 9); add("stool", 14, 10);
  } else if (kind === "clinic") {
    for (const x of [4, 6, 13, 15]) add("cabinet", x, 2);
    add("cross", ex, 1);
    add("medbay", 3, 7); add("medbay", 3, 9); add("medbay", 16, 7); add("plant", 17, 10);
  } else if (kind === "shop") {
    for (const x of [4, 6, 13, 15]) add("shelf", x, 2);
    add("register", ex - 2, 3);
    add("shelf", 2, 7); add("shelf", 2, 9); add("shelf", 17, 7); add("shelf", 17, 9);
    add("crate", 4, 10); add("crate", 15, 10);
  } else if (kind === "guild") {
    add("board", ex, 2);
    add("rack", 2, 6); add("rack", 2, 8); add("locker", 17, 6); add("locker", 17, 8);
    add("table", 7, 9); add("stool", 8, 9);
  } else if (kind === "den") {
    add("crate", 3, 3); add("crate", 5, 3); add("crate", 16, 3);
    add("terminal", 4, 7); add("terminal", 15, 7); add("table", 9, 8); add("crate", 16, 9);
  } else if (kind === "hospital") {
    add("cross", ex, 1);
    for (const x of [3, 5, 7, 12, 14, 16]) add("medbay", x, 7); // a ward of beds
    for (const x of [3, 5, 7, 12, 14, 16]) add("medbay", x, 10);
    add("cabinet", 4, 2); add("cabinet", 15, 2); add("plant", 2, 11); add("plant", 17, 11);
  } else if (kind === "hotel") {
    add("sign", ex, 1);
    add("bed", 3, 7); add("bed", 6, 7); add("bed", 13, 7); add("bed", 16, 7);
    add("rug", ex, 9); add("plant", 2, 2); add("plant", 17, 2); add("register", ex - 2, 3);
  } else if (kind === "subway") {
    add("sign", ex, 1);
    add("turnstile", 6, 4); add("turnstile", 13, 4);
    add("bench", 4, 8); add("bench", 8, 8); add("bench", 15, 8);
    add("track", 3, 11); add("track", 7, 11); add("track", 11, 11); add("track", 15, 11);
    add("terminal", 17, 6);
  } else if (kind === "stadium") {
    add("scoreboard", ex, 1);
    add("banner", 3, 2); add("banner", 16, 2);
    add("barrier", 4, 8); add("barrier", 8, 8); add("barrier", 12, 8); add("barrier", 16, 8);
    add("arenamark", ex, 8);
  } else if (kind === "citycenter") {
    add("fountain", ex, 6); add("directory", 4, 4); add("directory", 16, 4);
    add("bench", 5, 10); add("bench", 15, 10); add("planter", 3, 2); add("planter", 16, 2);
  } else {
    add("bed", 3, 3); add("table", 14, 8); add("stool", 13, 8); add("stool", 15, 8);
    add("rug", ex, 8); add("shelf", 17, 3); add("plant", 2, 10);
  }
  return p;
}

export const INTERIOR_NAMES: Record<BuildingKind, string> = {
  home: "RESIDENCE",
  shop: "GENERAL STORE",
  den: "BACK ROOM",
  guild: "RUNNERS' GUILD",
  clinic: "MED-CLINIC",
  bar: "THE FERAL CAT",
  hospital: "HELIX GENERAL",
  hotel: "THE NEON ROOST",
  subway: "METRO — THE UNDERLINE",
  stadium: "THE CRUCIBLE",
  citycenter: "CIVIC SPIRE",
};

/** Per-kind interior footprint — room shape matches HF interior plates / furniture. */
function interiorDims(kind: BuildingKind): { w: number; h: number } {
  switch (kind) {
    case "bar":
      return { w: 24, h: 14 }; // long counter hall
    case "clinic":
    case "hospital":
      return { w: 22, h: 15 }; // ward depth
    case "shop":
      return { w: 21, h: 14 }; // aisle length
    case "guild":
      return { w: 22, h: 15 }; // war-table center
    case "subway":
      return { w: 24, h: 15 }; // turnstile + track strip
    case "stadium":
      return { w: 23, h: 16 }; // barrier ring
    case "citycenter":
      return { w: 22, h: 15 }; // fountain lobby
    case "den":
      return { w: 18, h: 13 }; // tight backroom
    case "hotel":
      return { w: 20, h: 14 };
    default:
      return { w: 20, h: 13 }; // home / default
  }
}

/** Build a small interior room for a building of the given kind. */
export function buildInterior(kind: BuildingKind): Interior {
  const { w, h } = interiorDims(kind);
  const grid: TileGrid = [];
  for (let y = 0; y < h; y++) grid.push(new Array(w).fill(TILE_INNER_FLOOR));
  // wall ring
  for (let x = 0; x < w; x++) {
    grid[0][x] = TILE_INNER_WALL;
    grid[h - 1][x] = TILE_INNER_WALL;
  }
  for (let y = 0; y < h; y++) {
    grid[y][0] = TILE_INNER_WALL;
    grid[y][w - 1] = TILE_INNER_WALL;
  }
  // exit door in the bottom wall (centre), with the player just inside it
  const ex = Math.floor(w / 2);
  grid[h - 1][ex] = TILE_PLAZA; // distinct, walkable exit tile (glows)
  const exit: [number, number] = [ex, h - 1];
  const spawn: [number, number] = [ex, h - 2];

  const npcSpots: [number, number][] = [];
  // Structure partitions that frame HF furniture (not a single generic counter for all).
  if (kind === "bar") {
    // L-counter: north run + short west stub (matches bar counter art)
    for (let x = 3; x <= w - 4; x++) grid[4][x] = TILE_INNER_WALL;
    for (let y = 4; y <= 7; y++) grid[y][3] = TILE_INNER_WALL;
    grid[4][ex] = TILE_INNER_FLOOR;
    npcSpots.push([ex, 3], [6, h - 4], [w - 5, h - 4]);
  } else if (kind === "clinic" || kind === "hospital") {
    // Reception counter + light ward pillars
    for (let x = 3; x <= w - 4; x++) grid[4][x] = TILE_INNER_WALL;
    grid[4][ex] = TILE_INNER_FLOOR;
    grid[8][7] = TILE_INNER_WALL;
    grid[8][w - 8] = TILE_INNER_WALL;
    npcSpots.push([ex, 3], [5, h - 4], [w - 5, h - 4]);
  } else if (kind === "shop") {
    // Aisle islands
    for (let x = 3; x <= w - 4; x++) grid[4][x] = TILE_INNER_WALL;
    grid[4][ex] = TILE_INNER_FLOOR;
    for (let y = 7; y <= 9; y++) {
      grid[y][6] = TILE_INNER_WALL;
      grid[y][w - 7] = TILE_INNER_WALL;
    }
    npcSpots.push([ex, 3], [5, h - 4], [w - 5, h - 4]);
  } else if (kind === "guild") {
    // Open center for war table; rack walls as side stubs
    for (let x = 4; x <= w - 5; x++) grid[3][x] = TILE_INNER_WALL;
    grid[3][ex] = TILE_INNER_FLOOR;
    for (let y = 6; y <= 9; y++) {
      grid[y][2] = TILE_INNER_WALL;
      grid[y][w - 3] = TILE_INNER_WALL;
    }
    npcSpots.push([ex, 2], [6, h - 4], [w - 6, h - 4]);
  } else if (kind === "subway") {
    // Turnstile wall + south track strip (non-walkable edge flavor via wall tiles)
    for (let x = 4; x <= w - 5; x++) grid[5][x] = TILE_INNER_WALL;
    grid[5][ex] = TILE_INNER_FLOOR;
    for (let x = 2; x <= w - 3; x++) grid[h - 3][x] = TILE_INNER_WALL;
    npcSpots.push([ex, 4], [5, 8], [w - 5, 8]);
  } else if (kind === "stadium") {
    // Barrier arc mid-room
    for (let x = 4; x <= w - 5; x++) grid[8][x] = TILE_INNER_WALL;
    grid[8][ex] = TILE_INNER_FLOOR;
    npcSpots.push([ex, 3], [5, 6], [w - 5, 6]);
  } else if (kind === "hotel" || kind === "citycenter") {
    const cy = 4;
    for (let x = 3; x <= w - 4; x++) grid[cy][x] = TILE_INNER_WALL;
    grid[cy][ex] = TILE_INNER_FLOOR;
    npcSpots.push([ex, cy - 1], [5, h - 4], [w - 5, h - 4]);
  } else {
    // home / den — lived-in room; den gets a crate-nest corner partition
    npcSpots.push([ex, 3], [5, h - 4]);
    if (kind === "den") {
      grid[3][3] = TILE_INNER_WALL;
      grid[3][4] = TILE_INNER_WALL;
      grid[4][3] = TILE_INNER_WALL;
    }
  }

  return { grid, w, h, spawn, exit, npcSpots, props: furnishInterior(kind, ex), name: INTERIOR_NAMES[kind] };
}
