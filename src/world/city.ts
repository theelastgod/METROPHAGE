// METROPHAGE — procedural big-city generator for the explorable, RuneScape-style hub
// (CityScene). Produces a large tile grid: an avenue street-grid carving the map into
// blocks, each block holding a building footprint with a single walkable DOOR (so it
// can be entered, Step 2), plus plazas/parks and NPC/landmark spots. Pure data — no
// Phaser — so the sim/UI can reason about it; deterministic via a seed.

import { TILE_FLOOR, TILE_WALL, TILE_PLAZA, TILE_LANE, isWall, type TileGrid } from "./district";

export const CITY_W = 96; // tiles  → 3072 px wide
export const CITY_H = 72; // tiles  → 2304 px tall

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type BuildingKind = "home" | "shop" | "den" | "guild" | "clinic" | "bar";

export interface CityBuilding {
  rect: Rect; // wall footprint
  door: [number, number]; // walkable opening, in tile coords
  kind: BuildingKind;
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

/** Build the big city grid + metadata. */
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

  // avenue grid — roads at regular intervals (ROAD_W wide), the rest are blocks
  const roadCols = new Set<number>();
  const roadRows = new Set<number>();
  for (let x = BLOCK; x < w - 2; x += BLOCK) for (let i = 0; i < ROAD_W; i++) roadCols.add(x + i);
  for (let y = BLOCK; y < h - 2; y += BLOCK) for (let i = 0; i < ROAD_W; i++) roadRows.add(y + i);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) if (roadCols.has(x) || roadRows.has(y)) grid[y][x] = TILE_LANE;

  // central plaza (spawn) — clear a generous open square at the city centre
  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);
  const plazas: Rect[] = [];
  const central: Rect = { x1: cx - 5, y1: cy - 4, x2: cx + 5, y2: cy + 4 };
  fill(grid, central, TILE_PLAZA);
  plazas.push(central);

  // blocks: between each pair of avenues, place one building (or a plaza/park)
  const buildings: CityBuilding[] = [];
  let bid = 0;
  for (let by = 2; by < h - 2; by += BLOCK) {
    for (let bx = 2; bx < w - 2; bx += BLOCK) {
      // the block interior, inset by a 1-tile sidewalk from the surrounding roads
      const x1 = bx + 1;
      const y1 = by + 1;
      const x2 = Math.min(w - 3, bx + BLOCK - ROAD_W - 2);
      const y2 = Math.min(h - 3, by + BLOCK - ROAD_W - 2);
      if (x2 - x1 < 3 || y2 - y1 < 3) continue;
      // keep the central plaza block open
      if (x1 <= central.x2 && x2 >= central.x1 && y1 <= central.y2 && y2 >= central.y1) continue;

      const roll = rand();
      if (roll < 0.18) {
        // a park / plaza block
        fill(grid, { x1, y1, x2, y2 }, TILE_PLAZA);
        plazas.push({ x1, y1, x2, y2 });
        continue;
      }

      // a building footprint with a door on the side that faces a road
      const rect: Rect = { x1, y1, x2, y2 };
      fill(grid, rect, TILE_WALL);
      // door: middle of the bottom edge (faces the road below), carved walkable +
      // a 1-tile threshold so you can step into it.
      const doorX = Math.round((x1 + x2) / 2);
      const doorY = y2;
      grid[doorY][doorX] = TILE_FLOOR;
      if (doorY + 1 < h) grid[doorY + 1][doorX] = TILE_LANE; // threshold onto the street
      const kind = KINDS[(bid + Math.floor(roll * 100)) % KINDS.length];
      buildings.push({ rect, door: [doorX, doorY], kind, id: `bldg_${bid}` });
      bid++;
    }
  }

  // NPC / prop spots — scatter walkable points around the central plaza and a few
  // building doorsteps, so Step 3 can place quest-givers in a lively city.
  const npcSpots: [number, number][] = [
    [cx - 3, cy - 2],
    [cx + 3, cy - 2],
    [cx - 3, cy + 2],
    [cx + 3, cy + 2],
    [cx, cy - 3],
  ];
  for (const b of buildings.slice(0, 12)) {
    const [dx, dy] = b.door;
    if (dy + 1 < h && !isWall(grid[dy + 1][dx])) npcSpots.push([dx, dy + 1]);
  }

  return { grid, w, h, spawn: [cx, cy], buildings, plazas, npcSpots };
}
