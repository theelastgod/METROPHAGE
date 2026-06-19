// METROPHAGE — district layout as pure data.
// No Phaser imports here: this is the "world model" the renderer consumes.
// Later AI/sim work can read this grid without touching draw code.

import { GRID_W, GRID_H, TILE } from "../config";

export const TILE_FLOOR = 0; // street, walkable
export const TILE_WALL = 1; // building, collides
export const TILE_PLAZA = 2; // open plaza, walkable
export const TILE_LANE = 3; // street lane marking, walkable

export type TileGrid = number[][];

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const BUILDINGS: Rect[] = [
  { x1: 3, y1: 3, x2: 10, y2: 8 },
  { x1: 16, y1: 3, x2: 24, y2: 8 },
  { x1: 29, y1: 3, x2: 36, y2: 9 },
  { x1: 3, y1: 12, x2: 9, y2: 18 },
  { x1: 30, y1: 13, x2: 36, y2: 20 },
  { x1: 3, y1: 22, x2: 12, y2: 26 },
  { x1: 27, y1: 23, x2: 36, y2: 26 },
  { x1: 16, y1: 22, x2: 23, y2: 26 },
];

// Central open plaza (walkable, visually distinct).
const PLAZA: Rect = { x1: 15, y1: 12, x2: 24, y2: 19 };

function fill(grid: TileGrid, r: Rect, tile: number) {
  for (let y = r.y1; y <= r.y2; y++) {
    for (let x = r.x1; x <= r.x2; x++) {
      if (y >= 0 && y < GRID_H && x >= 0 && x < GRID_W) grid[y][x] = tile;
    }
  }
}

/** Build the district grid deterministically. */
export function buildGrid(): TileGrid {
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

  // Buildings.
  for (const b of BUILDINGS) fill(grid, b, TILE_WALL);

  // Plaza (carve walkable, even if a building overlapped).
  fill(grid, PLAZA, TILE_PLAZA);

  // Lane markings down the main cross-streets (only over floor tiles).
  const midY = 10;
  const midX = 13;
  for (let x = 1; x < GRID_W - 1; x++) {
    if (grid[midY][x] === TILE_FLOOR) grid[midY][x] = TILE_LANE;
  }
  for (let y = 1; y < GRID_H - 1; y++) {
    if (grid[y][midX] === TILE_FLOOR) grid[y][midX] = TILE_LANE;
  }

  return grid;
}

export function isWall(tile: number): boolean {
  return tile === TILE_WALL;
}

/** A guaranteed-walkable spawn point, in world (pixel) coordinates, at tile center. */
export function spawnPoint(grid: TileGrid): { x: number; y: number } {
  // Prefer plaza centre; fall back to first floor tile found.
  const cx = Math.floor((PLAZA.x1 + PLAZA.x2) / 2);
  const cy = Math.floor((PLAZA.y1 + PLAZA.y2) / 2);
  if (!isWall(grid[cy][cx])) {
    return { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
  }
  for (let y = 1; y < GRID_H - 1; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      if (!isWall(grid[y][x])) {
        return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
      }
    }
  }
  return { x: TILE * 1.5, y: TILE * 1.5 };
}
