// METROPHAGE — THE ESTATES: a no-combat residential section off the hub where players
// buy homes from one another and furnish them. The overworld is a quiet street of home
// plots; each plot's door opens a private interior (zone "est{K}") that is EMPTY except
// for the owner's placed furniture. Shared by the client (renders it) and the Worker
// (sims the zones + owns ownership/furniture in D1) so both agree on geometry.

import {
  TILE_FLOOR,
  TILE_WALL,
  TILE_WALL_RES,
  TILE_INNER_FLOOR,
  TILE_INNER_WALL,
  VENUE_ROOM_W,
  VENUE_ROOM_H,
  type TileGrid,
} from "./district";
import type { Rect } from "../game/districts";

/** How many purchasable homes line the estates street. */
export const ESTATE_COUNT = 12;

export interface EstatePlot {
  id: number;
  rect: Rect; // the facade block on the street
  door: [number, number]; // walkable doorstep tile (street side) → enters est{id}
}

const STREET_W = 62;
const STREET_H = 26;
const PLOTS_PER_ROW = 6;
const PLOT_W = 8; // facade width
const PLOT_GAP = 2;
const PLOT_X0 = 3;

/** The estates overworld — a horizontal street with two rows of home facades facing it. */
export function buildEstatesStreet(): { grid: TileGrid; w: number; h: number; spawn: [number, number]; plots: EstatePlot[] } {
  const w = STREET_W;
  const h = STREET_H;
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

  const plots: EstatePlot[] = [];
  const fill = (r: Rect, t: number) => {
    for (let y = r.y1; y <= r.y2; y++) for (let x = r.x1; x <= r.x2; x++) if (grid[y]?.[x] !== undefined) grid[y][x] = t;
  };
  // top row — facades y2..8, doors face SOUTH into the street
  // bottom row — facades y17..23, doors face NORTH into the street (street band y9..16 walkable)
  const rowDefs = [
    { y1: 2, y2: 8, doorY: 9, openY: 8 },
    { y1: 17, y2: 23, doorY: 16, openY: 17 },
  ];
  rowDefs.forEach((row, ri) => {
    for (let k = 0; k < PLOTS_PER_ROW; k++) {
      const x1 = PLOT_X0 + k * (PLOT_W + PLOT_GAP);
      const x2 = x1 + PLOT_W - 1;
      const cx = Math.round((x1 + x2) / 2);
      fill({ x1, y1: row.y1, x2, y2: row.y2 }, TILE_WALL_RES);
      grid[row.openY][cx] = TILE_FLOOR; // carve the doorway in the facade
      grid[row.doorY][cx] = TILE_FLOOR; // the street-side doorstep stays walkable
      plots.push({ id: ri * PLOTS_PER_ROW + k, rect: { x1, y1: row.y1, x2, y2: row.y2 }, door: [cx, row.doorY] });
    }
  });

  return { grid, w, h, spawn: [Math.floor(w / 2), 12], plots };
}

/** Cached deterministic estates layout — client + server agree. */
export const ESTATES = buildEstatesStreet();

/** A private home interior — an EMPTY venue-sized room. Furniture is layered on top from the
 *  owner's saved layout; the room itself ships bare. */
export function buildHomeRoom(): TileGrid {
  const g: TileGrid = [];
  for (let y = 0; y < VENUE_ROOM_H; y++) {
    const row: number[] = [];
    for (let x = 0; x < VENUE_ROOM_W; x++) {
      const border = x === 0 || x === VENUE_ROOM_W - 1 || y === 0 || y === VENUE_ROOM_H - 1;
      row.push(border ? TILE_INNER_WALL : TILE_INNER_FLOOR);
    }
    g.push(row);
  }
  return g;
}

/** Estate overworld zone id + private interior id parsing (mirrored client/server). */
export const ESTATES_ZONE = "estates";
export const parseEstateInterior = (z: string | null): number | null => {
  const m = z ? /^est(\d+)$/.exec(z) : null;
  if (!m) return null;
  const i = parseInt(m[1], 10);
  return i >= 0 && i < ESTATE_COUNT ? i : null;
};

// ── furniture ────────────────────────────────────────────────────────────────
/** A furniture catalogue entry the owner can place. Purely cosmetic; non-colliding. */
export interface FurnitureKind {
  id: string;
  name: string;
  color: number;
  w: number; // footprint in tiles (for the editor palette + render size)
  h: number;
  price: number; // credits to place (a light sink)
}

export const FURNITURE: FurnitureKind[] = [
  { id: "bed", name: "Bed", color: 0x4d8cff, w: 2, h: 1, price: 40 },
  { id: "sofa", name: "Sofa", color: 0xff79c6, w: 2, h: 1, price: 60 },
  { id: "table", name: "Table", color: 0xffb13c, w: 1, h: 1, price: 30 },
  { id: "chair", name: "Chair", color: 0xf7ff3c, w: 1, h: 1, price: 15 },
  { id: "rug", name: "Rug", color: 0xb06bff, w: 2, h: 2, price: 35 },
  { id: "plant", name: "Plant", color: 0x39ff88, w: 1, h: 1, price: 20 },
  { id: "lamp", name: "Lamp", color: 0xffe08a, w: 1, h: 1, price: 25 },
  { id: "shelf", name: "Shelf", color: 0x9dff3c, w: 1, h: 1, price: 30 },
  { id: "locker", name: "Locker", color: 0x8dfff0, w: 1, h: 1, price: 45 },
  { id: "terminal", name: "Terminal", color: 0x00e5ff, w: 1, h: 1, price: 70 },
  { id: "poster", name: "Poster", color: 0xff3b6b, w: 1, h: 1, price: 18 },
  { id: "crate", name: "Crate", color: 0x9aa3b2, w: 1, h: 1, price: 12 },
];

export const furnitureKind = (id: string): FurnitureKind | undefined => FURNITURE.find((f) => f.id === id);

/** One placed furniture item in a home. */
export interface FurniturePiece {
  k: string; // FurnitureKind id
  x: number; // tile x within the room
  y: number; // tile y within the room
}

/** Default asking price for a never-owned estate (credits). */
export const ESTATE_BASE_PRICE = 2500;

/** Validate + clamp a furniture layout coming off the wire (owner-supplied, so bound it). */
export function sanitizeFurniture(raw: unknown): FurniturePiece[] {
  if (!Array.isArray(raw)) return [];
  const out: FurniturePiece[] = [];
  for (const p of raw) {
    if (out.length >= 40) break; // cap pieces per home
    if (!p || typeof p !== "object") continue;
    const k = (p as FurniturePiece).k;
    const x = Math.round((p as FurniturePiece).x);
    const y = Math.round((p as FurniturePiece).y);
    if (!furnitureKind(k)) continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < 1 || x > VENUE_ROOM_W - 2 || y < 1 || y > VENUE_ROOM_H - 2) continue; // inside the walls
    out.push({ k, x, y });
  }
  return out;
}
