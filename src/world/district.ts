// METROPHAGE — district renderer: turns a DistrictDef (pure data) into a tile grid.
// No Phaser imports: this is the "world model" the renderer consumes. Later AI/sim
// work can read this grid without touching draw code.

import { GRID_W, GRID_H, TILE } from "../config";
import { DISTRICTS, type DistrictDef, type Rect } from "../game/districts";

// Indices into the code-authored tileset (textures.ts; 256×128, 32 cells of 32×32).
// Walkable ground 0–3,5,10–14; building/blocking tiles 4,6–9,15 (see isWall).
export const TILE_FLOOR = 0; // concrete, walkable (the default play surface)
export const TILE_SIDEWALK = 1; // paved walkway (borders buildings)
export const TILE_LANE = 2; // road / asphalt, walkable
export const TILE_PLAZA = 3; // neon plaza, walkable
export const TILE_WALL = 4; // DOWNTOWN building, collides
export const TILE_GRASS = 5; // park / green, walkable
export const TILE_WATER = 6; // canal — blocks movement
export const TILE_WALL_IND = 7; // INDUSTRIAL building
export const TILE_WALL_RES = 8; // RESIDENTIAL building
export const TILE_WALL_CORP = 9; // CORPORATE glass tower
export const TILE_MARKET = 10; // market ground, walkable
export const TILE_GRATE = 11; // industrial grating floor, walkable
export const TILE_CROSSWALK = 12; // road crossing, walkable
export const TILE_NEON = 13; // neon-strip floor (nightlife), walkable
export const TILE_DIRT = 14; // wasteland / slum ground, walkable
export const TILE_WALL_SLUM = 15; // shanty building
export const TILE_INNER_FLOOR = 16; // building interior floor (wood/tile), walkable
export const TILE_INNER_WALL = 17; // building interior wall

/** Tiles that block movement (buildings + water). */
const WALL_TILES = new Set<number>([
  TILE_WALL,
  TILE_WATER,
  TILE_WALL_IND,
  TILE_WALL_RES,
  TILE_WALL_CORP,
  TILE_WALL_SLUM,
  TILE_INNER_WALL,
]);

/** Every building/blocking tile index — scenes pass this to setCollision(). */
export const COLLIDING_TILES: number[] = [...WALL_TILES];

export type TileGrid = number[][];

function fill(grid: TileGrid, r: Rect, tile: number) {
  for (let y = r.y1; y <= r.y2; y++) {
    for (let x = r.x1; x <= r.x2; x++) {
      if (y >= 0 && y < GRID_H && x >= 0 && x < GRID_W) grid[y][x] = tile;
    }
  }
}

/** Carve a single tile (and its 4-neighbours) walkable — keeps key points reachable. */
function carve(grid: TileGrid, tx: number, ty: number, tile = TILE_FLOOR) {
  const pts: Array<[number, number]> = [
    [tx, ty],
    [tx - 1, ty],
    [tx + 1, ty],
    [tx, ty - 1],
    [tx, ty + 1],
  ];
  for (const [x, y] of pts) {
    if (x > 0 && x < GRID_W - 1 && y > 0 && y < GRID_H - 1 && isWall(grid[y][x])) {
      grid[y][x] = tile;
    }
  }
}

/** Build a district's tile grid deterministically from its DistrictDef. */
export function buildGrid(def: DistrictDef = DISTRICTS[0]): TileGrid {
  const grid: TileGrid = [];
  for (let y = 0; y < GRID_H; y++) {
    grid.push(new Array(GRID_W).fill(TILE_FLOOR));
  }

  // Outer wall ring.
  for (let x = 0; x < GRID_W; x++) {
    grid[0][x] = TILE_WALL;
    grid[GRID_H - 1][x] = TILE_WALL;
  }
  for (let y = 0; y < GRID_H; y++) {
    grid[y][0] = TILE_WALL;
    grid[y][GRID_W - 1] = TILE_WALL;
  }

  const { buildings, plaza, laneRows, laneCols } = def.layout;
  for (const b of buildings) fill(grid, b, TILE_WALL);
  if (plaza) fill(grid, plaza, TILE_PLAZA); // carve walkable, even over a building

  // Lane markings down the chosen cross-streets (only over floor tiles).
  for (const y of laneRows) {
    if (y <= 0 || y >= GRID_H - 1) continue;
    for (let x = 1; x < GRID_W - 1; x++) {
      if (grid[y][x] === TILE_FLOOR) grid[y][x] = TILE_LANE;
    }
  }
  for (const x of laneCols) {
    if (x <= 0 || x >= GRID_W - 1) continue;
    for (let y = 1; y < GRID_H - 1; y++) {
      if (grid[y][x] === TILE_FLOOR) grid[y][x] = TILE_LANE;
    }
  }

  // Safety: guarantee the player start, the dive entrance, and every territory
  // node (and neighbours) are walkable, regardless of how the layout was authored.
  carve(grid, def.spawnTile[0], def.spawnTile[1]);
  carve(grid, def.diveTile[0], def.diveTile[1]);
  carve(grid, def.boardTile[0], def.boardTile[1]);
  carve(grid, def.shopTile[0], def.shopTile[1]);
  for (const n of def.nodes) carve(grid, n.tile[0], n.tile[1]);

  return grid;
}

export function isWall(tile: number): boolean {
  return WALL_TILES.has(tile);
}

/**
 * The SAFEHOUSE interior — a walled room of warm interior floor: a server-authoritative,
 * no-combat social hub (+ vendor) players enter from any district. Shared by the client
 * (renders it) and the server (sims zone "safe"). Same world bounds as a district so the
 * camera/physics need no special-casing.
 */
export function buildSafehouse(): TileGrid {
  const g: TileGrid = [];
  for (let y = 0; y < GRID_H; y++) {
    const row: number[] = [];
    for (let x = 0; x < GRID_W; x++) {
      const border = x < 4 || x >= GRID_W - 4 || y < 3 || y >= GRID_H - 3;
      row.push(border ? TILE_INNER_WALL : TILE_INNER_FLOOR);
    }
    g.push(row);
  }
  // interior pillars for character (all collide)
  for (const [px, py] of [[12, 10], [27, 10], [12, 20], [27, 20]] as const) {
    g[py][px] = TILE_INNER_WALL;
    g[py][px + 1] = TILE_INNER_WALL;
  }
  return g;
}

/** Centre of the safehouse (open floor) — the spawn / return point, in world pixels. */
export const SAFEHOUSE_SPAWN = {
  x: Math.floor(GRID_W / 2) * TILE + TILE / 2,
  y: Math.floor(GRID_H / 2) * TILE + TILE / 2,
};

/**
 * THE UNDERLINE — the subway dungeon as an online COMBAT interior: three parallel platforms
 * joined by vertical connectors (a subway-track feel), walls elsewhere. Shared by the client
 * (renders it) and the server (sims zone "subway" with a tough HSS garrison + a boss).
 */
export function buildSubway(): TileGrid {
  const g: TileGrid = [];
  for (let y = 0; y < GRID_H; y++) {
    const row: number[] = [];
    for (let x = 0; x < GRID_W; x++) row.push(TILE_INNER_WALL);
    g.push(row);
  }
  const carveRow = (ry: number, x0: number, x1: number) => {
    for (let x = x0; x <= x1; x++) g[ry][x] = TILE_INNER_FLOOR;
  };
  const carveCol = (cx: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) g[y][cx] = TILE_INNER_FLOOR;
  };
  for (const ry of [7, 8, 15, 16, 23, 24]) carveRow(ry, 3, 36); // three platforms
  for (const cx of [8, 9, 20, 21, 32, 33]) carveCol(cx, 7, 24); // connectors
  return g;
}
export const SUBWAY_SPAWN = { x: 4 * TILE + TILE / 2, y: 7 * TILE + TILE / 2 };

/** Player start in world (pixel) coordinates, at tile center, from the district def. */
export function spawnPoint(grid: TileGrid, def: DistrictDef = DISTRICTS[0]): { x: number; y: number } {
  const [sx, sy] = def.spawnTile;
  if (grid[sy]?.[sx] !== undefined && !isWall(grid[sy][sx])) {
    return { x: sx * TILE + TILE / 2, y: sy * TILE + TILE / 2 };
  }
  // Fallback: first walkable interior tile.
  for (let y = 1; y < GRID_H - 1; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      if (!isWall(grid[y][x])) {
        return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
      }
    }
  }
  return { x: TILE * 1.5, y: TILE * 1.5 };
}
