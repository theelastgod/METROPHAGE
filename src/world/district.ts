// METROPHAGE — district renderer: turns a DistrictDef (pure data) into a tile grid.
// No Phaser imports: this is the "world model" the renderer consumes. Later AI/sim
// work can read this grid without touching draw code.

import { GRID_W, GRID_H, TILE } from "../config";
import { DistrictDef, DISTRICTS, Rect } from "../game/districts";

// Indices into the drop-in tileset (256×64, sixteen 32×32 cells):
// 0 floor · 2 road · 3 plaza · 4 wall (see ART_NOTES).
export const TILE_FLOOR = 0; // floor, walkable
export const TILE_WALL = 4; // wall/building, collides
export const TILE_PLAZA = 3; // open plaza, walkable
export const TILE_LANE = 2; // road, walkable

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
  for (const n of def.nodes) carve(grid, n.tile[0], n.tile[1]);

  return grid;
}

export function isWall(tile: number): boolean {
  return tile === TILE_WALL;
}

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
