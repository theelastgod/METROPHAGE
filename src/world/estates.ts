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
  VENUE_MAT_TILE,
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
  glyph: string; // 1-2 chars drawn on the placed piece (name initials collide at 24 kinds)
  color: number;
  w: number; // footprint in tiles (for the editor palette + render size)
  h: number;
  price: number; // credits to place (a light sink)
}

export const FURNITURE: FurnitureKind[] = [
  // ids are persisted in saved layouts — never rename, only append
  { id: "bed", name: "Bed", glyph: "BD", color: 0x4d8cff, w: 2, h: 1, price: 40 },
  { id: "sofa", name: "Sofa", glyph: "SF", color: 0xff79c6, w: 2, h: 1, price: 60 },
  { id: "table", name: "Table", glyph: "TB", color: 0xffb13c, w: 1, h: 1, price: 30 },
  { id: "chair", name: "Chair", glyph: "CH", color: 0xf7ff3c, w: 1, h: 1, price: 15 },
  { id: "rug", name: "Rug", glyph: "RG", color: 0xb06bff, w: 2, h: 2, price: 35 },
  { id: "plant", name: "Plant", glyph: "PL", color: 0x39ff88, w: 1, h: 1, price: 20 },
  { id: "lamp", name: "Lamp", glyph: "LP", color: 0xffe08a, w: 1, h: 1, price: 25 },
  { id: "shelf", name: "Shelf", glyph: "SH", color: 0x9dff3c, w: 1, h: 1, price: 30 },
  { id: "locker", name: "Locker", glyph: "LK", color: 0x8dfff0, w: 1, h: 1, price: 45 },
  { id: "terminal", name: "Terminal", glyph: "TM", color: 0x00e5ff, w: 1, h: 1, price: 70 },
  { id: "poster", name: "Poster", glyph: "PS", color: 0xff3b6b, w: 1, h: 1, price: 18 },
  { id: "crate", name: "Crate", glyph: "CR", color: 0x9aa3b2, w: 1, h: 1, price: 12 },
  { id: "holo_tv", name: "Holo-TV", glyph: "TV", color: 0x29e7ff, w: 2, h: 1, price: 90 },
  { id: "bar_counter", name: "Bar counter", glyph: "BA", color: 0x9dff3c, w: 2, h: 1, price: 80 },
  { id: "bookcase", name: "Bookcase", glyph: "BK", color: 0xd9a066, w: 1, h: 1, price: 45 },
  { id: "desk", name: "Desk", glyph: "DK", color: 0x8fb8ff, w: 2, h: 1, price: 55 },
  { id: "aquarium", name: "Aquarium", glyph: "AQ", color: 0x66e0ff, w: 2, h: 1, price: 110 },
  { id: "neon_sign", name: "Neon sign", glyph: "NS", color: 0xff2bd6, w: 1, h: 1, price: 65 },
  { id: "arcade", name: "Arcade cab", glyph: "AR", color: 0xf7ff3c, w: 1, h: 1, price: 95 },
  { id: "jukebox", name: "Jukebox", glyph: "JB", color: 0xff79c6, w: 1, h: 1, price: 85 },
  { id: "vending", name: "Vending unit", glyph: "VN", color: 0x39ff88, w: 1, h: 1, price: 60 },
  { id: "weapon_rack", name: "Weapon rack", glyph: "WR", color: 0xff3b6b, w: 1, h: 1, price: 75 },
  { id: "trophy", name: "Trophy case", glyph: "TR", color: 0xffd24a, w: 1, h: 1, price: 120 },
  { id: "server_rack", name: "Server rack", glyph: "SV", color: 0x00e5ff, w: 1, h: 1, price: 100 },
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

// ── guestbook ────────────────────────────────────────────────────────────────
/** One signature in a home's visitor book. */
export interface GuestEntry {
  n: string; // visitor name
  at: number; // ms timestamp
  s: string; // stamp — one of GUEST_STAMPS, chosen server-side (no free text)
}

/** Canned signature stamps — server picks one, so nothing player-written is stored. */
export const GUEST_STAMPS = [
  "was here",
  "nice place",
  "cozy",
  "rent?",
  "left a fingerprint",
  "borrowed a chair",
  "the neon suits you",
  "10/10 would trespass again",
] as const;

/** Validate + clamp a guestbook coming out of D1 (bound it like the furniture). */
export function sanitizeGuestbook(raw: unknown): GuestEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: GuestEntry[] = [];
  for (const e of raw) {
    if (out.length >= 24) break;
    if (!e || typeof e !== "object") continue;
    const n = String((e as GuestEntry).n ?? "").slice(0, 16);
    const at = Number((e as GuestEntry).at ?? 0);
    const s = String((e as GuestEntry).s ?? "").slice(0, 32);
    if (!n || !Number.isFinite(at)) continue;
    out.push({ n, at, s });
  }
  return out;
}

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
    if (x === VENUE_MAT_TILE[0] && y === VENUE_MAT_TILE[1]) continue; // never bury the exit mat
    out.push({ k, x, y });
  }
  return out;
}
