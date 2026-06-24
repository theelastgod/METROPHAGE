// METROPHAGE — procedural big-city generator for the explorable, RuneScape-style hub
// (CityScene). Produces a large tile grid: an avenue street-grid carving the map into
// blocks, each block holding a building footprint with a single walkable DOOR (so it
// can be entered, Step 2), plus plazas/parks and NPC/landmark spots. Pure data — no
// Phaser — so the sim/UI can reason about it; deterministic via a seed.

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

export const CITY_W = 120; // tiles  → 3840 px wide
export const CITY_H = 96; // tiles  → 3072 px tall

/** A cyberpunk environment/zone with its own ground + building palette. */
export type Env = "downtown" | "corporate" | "market" | "residential" | "industrial" | "slum" | "park";

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
  if (r < 0.15) return "downtown";
  if (r < 0.3) return dx < 0 ? "corporate" : "market";
  if (dy < -0.12) return dx < 0 ? "corporate" : "residential";
  if (dy > 0.12) return dx < 0 ? "industrial" : "slum";
  return dx < 0 ? "industrial" : "market";
}

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type BuildingKind = "home" | "shop" | "den" | "guild" | "clinic" | "bar";

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
export function buildCity(seed = 1337): CityMap {
  const w = CITY_W;
  const h = CITY_H;
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
  const central: Rect = { x1: cx - 6, y1: cy - 5, x2: cx + 6, y2: cy + 5 };
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
      if (roll < 0.16) {
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
      // NOT all buildings are enterable — ~60% get a door, the rest are scenery
      let door: [number, number] | undefined;
      if (rand() < 0.6) {
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

  return { grid, w, h, spawn: [cx, cy], buildings, plazas, npcSpots, zones, decorations };
}

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
  } else {
    add("bed", 3, 3); add("table", 14, 8); add("stool", 13, 8); add("stool", 15, 8);
    add("rug", ex, 8); add("shelf", 17, 3); add("plant", 2, 10);
  }
  return p;
}

const INTERIOR_NAMES: Record<BuildingKind, string> = {
  home: "RESIDENCE",
  shop: "GENERAL STORE",
  den: "BACK ROOM",
  guild: "RUNNERS' GUILD",
  clinic: "MED-CLINIC",
  bar: "THE FERAL CAT",
};

/** Build a small interior room for a building of the given kind. */
export function buildInterior(kind: BuildingKind): Interior {
  const w = 20;
  const h = 13;
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
  // a counter for service buildings: a wall row with a gap, NPC behind it
  if (kind === "shop" || kind === "bar" || kind === "clinic" || kind === "guild") {
    const cy = 4;
    for (let x = 3; x <= w - 4; x++) grid[cy][x] = TILE_INNER_WALL;
    grid[cy][ex] = TILE_INNER_FLOOR; // a gap to step behind, if needed
    npcSpots.push([ex, cy - 1]); // keeper / quest-giver behind the counter
    npcSpots.push([5, h - 4]); // a patron / second NPC
    npcSpots.push([w - 5, h - 4]); // a third NPC
  } else {
    // home / den — a lived-in room: an occupant + a visitor (furniture is decorative)
    npcSpots.push([ex, 3]); // occupant
    npcSpots.push([5, h - 4]); // a visitor
  }

  return { grid, w, h, spawn, exit, npcSpots, props: furnishInterior(kind, ex), name: INTERIOR_NAMES[kind] };
}
