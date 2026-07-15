// METROPHAGE shared movement simulation — the SINGLE source of truth for how a
// player moves, run identically on the client (prediction) and the server
// (authority). Phaser-free and deterministic: given the same start state, input,
// grid and dt, it always produces the same result — which is what makes
// client-side prediction reconcile cleanly against the server.
//
// NOTE: this replaces Phaser arcade physics for networked movement. It models the
// player as an axis-aligned box (half-extent PLAYER_RADIUS) and resolves walls per
// axis so you slide along them. Both sides must import THIS — never reimplement.

import { TILE, DISTRICT_GRID_W, DISTRICT_GRID_H, PLAYER } from "../config";
import { isWall, type TileGrid } from "../world/district";

/** Fixed network tick — the simulation step size on both client and server. */
export const NET_TICK_MS = 50; // 20 Hz
/** Player collision half-extent (px). Matches the old arcade body's ~9px radius. */
export const PLAYER_RADIUS = 9;

/** Default combat-district world size (largest common zone type). */
export const WORLD_W = DISTRICT_GRID_W * TILE;
export const WORLD_H = DISTRICT_GRID_H * TILE;

/** Per-zone bounds derived from the authoritative tile grid. */
export function gridDims(grid: TileGrid) {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  return { w, h, worldW: w * TILE, worldH: h * TILE };
}

export interface MoveInput {
  mx: number; // -1..1 intent on X
  my: number; // -1..1 intent on Y
}

export interface MoveState {
  x: number;
  y: number;
}

const clampUnit = (n: number) => (n > 1 ? 1 : n < -1 ? -1 : Number.isFinite(n) ? n : 0);
const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

/**
 * Wrap ANY number into a real angle in [-π, π]. Non-finite → 0.
 *
 * Every aim that arrives from a client must pass through this. `Number.isFinite`
 * alone is not enough: at |aim| ≥ ~1e16 the classic `while (diff > π) diff -= 2π`
 * normalizer stops converging (2π is below the float64 ulp at that magnitude, so
 * `diff - 2π === diff`) and spins forever — one crafted message would wedge a
 * whole zone. Trig-wrapping is O(1) and exact for sane angles.
 */
export function normAngle(a: number): number {
  if (!Number.isFinite(a)) return 0;
  if (a >= -Math.PI && a <= Math.PI) return a; // common case: already normal
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** True if a PLAYER_RADIUS box centred at (x,y) overlaps any wall tile or the edge. */
export function collides(x: number, y: number, grid: TileGrid): boolean {
  const { w: gw, h: gh } = gridDims(grid);
  const minTx = Math.floor((x - PLAYER_RADIUS) / TILE);
  const maxTx = Math.floor((x + PLAYER_RADIUS) / TILE);
  const minTy = Math.floor((y - PLAYER_RADIUS) / TILE);
  const maxTy = Math.floor((y + PLAYER_RADIUS) / TILE);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (tx < 0 || ty < 0 || tx >= gw || ty >= gh) return true;
      const row = grid[ty];
      if (!row || isWall(row[tx])) return true;
    }
  }
  return false;
}

/**
 * Advance one fixed tick. Mutates `s` in place (cheap, called every tick on both
 * sides). Movement intent is normalised to a unit vector, integrated at the game's
 * fixed PLAYER.speed, and resolved per axis against the wall grid.
 */
export function stepMove(
  s: MoveState,
  input: MoveInput,
  grid: TileGrid,
  dtMs: number,
  speed: number = PLAYER.speed,
): void {
  let mx = clampUnit(input.mx);
  let my = clampUnit(input.my);
  const len = Math.hypot(mx, my);
  if (len > 1e-4) {
    mx /= Math.max(1, len); // normalise diagonals; a unit-or-shorter vector is kept
    my /= Math.max(1, len);
  } else {
    return; // no intent, no move
  }
  const dt = dtMs / 1000;
  const dist = speed * dt;
  const { worldW, worldH } = gridDims(grid);

  // Axis-separated resolution → slides along walls instead of sticking.
  const nx = clamp(s.x + mx * dist, PLAYER_RADIUS, worldW - PLAYER_RADIUS);
  if (!collides(nx, s.y, grid)) s.x = nx;
  const ny = clamp(s.y + my * dist, PLAYER_RADIUS, worldH - PLAYER_RADIUS);
  if (!collides(s.x, ny, grid)) s.y = ny;
}

// ── Combat constants (server-authoritative; client renders + sends fire intent) ──
// 2026-07-11 difficulty pass: player up (hp 100→140, dmg 25→32), patrols down
// (hp 75→60, dmg 10→7, slower fire) — deaths should be mistakes, not attrition.
export const PLAYER_HP = 140;
export const COP_HP = 60;
export const PLAYER_DMG = 32;
export const ENEMY_DMG = 7;
export const PLAYER_FIRE_MS = 170; // min gap between player shots
export const COP_FIRE_MS = 1400;
export const PROJ_SPEED = 540; // player projectile px/s
export const ENEMY_PROJ_SPEED = 300;
export const PROJ_TTL_MS = 900;
export const ENEMY_PROJ_TTL_MS = 1700;
export const PROJ_HIT_RADIUS = 12; // projectile-vs-entity hit distance
export const ENEMY_SPEED = 110; // cop chase speed px/s
export const ENEMY_AGGRO = 300; // start chasing within this
export const ENEMY_FIRE_RANGE = 240;
export const RESPAWN_MS = 2600;

// ── Progression / loot / shared meta (all server-authoritative) ──
export const XP_PER_KILL = 20; // early levels should feel — first-hour progression
export const levelForXp = (xp: number) => 1 + Math.floor(xp / 100);
export const xpIntoLevel = (xp: number) => xp % 100; // 0..99 toward the next level
export const CREDITS_PER_KILL = 10; // emit side; sinks (vendor/forge/death tax) must outpace this (was 14; live sink eff ~2%)
export const LOOT_DROP_CHANCE = 0.55; // chance a cop drops a pickup
export const PICKUP_RADIUS = 18; // walk within this to collect
export const PICKUP_TTL_MS = 15000;
/** Pickup kinds: 0 = credit cache, 1 = data core (rarer, worth more + bonus XP). */
export const PICKUP_CREDIT = 0;
export const PICKUP_CORE = 1;

/** Area-of-interest radius — the server only sends a client the entities within
 *  this distance of its player. Bigger than the ~960×540 view so nothing pops in
 *  at the edge; the mechanism is what matters (it's what makes scale possible). */
/** AOI for entity snapshots — sized for superscaled zones (city + districts).
 *  Slightly larger on Workers Paid bandwidth budget so edge pop-in is rarer. */
export const AOI_RADIUS = 1200;

// ── Territory control + faction war (Step 4a) ──
/** The four cells = the four classes. A player fights for one of them. */
export const FACTION_NAMES = ["METROPHAGE", "K-GUERILLA", "WINTERMUTE", "SWARM"];
export const FACTION_COLORS = [0x39ff88, 0xff2bd6, 0x00e5ff, 0xb06bff];
export const FACTION_COUNT = 4;
export const NEUTRAL = -1;
export const NODE_CHANNEL_RANGE = 84; // stand within this to channel a node
export const NODE_CAPTURE_PER_SEC = 0.5; // capture progress/sec while channeling
export const NODE_DECAY_PER_SEC = 0.1; // progress bleeds when uncontested → loses ground
export const FACTION_CAPTURE_SCORE = 10; // contribution awarded on a flip
export const NODE_HOLD_SCORE_PER_SEC = 0.25; // contribution per held node, per second

/** Map a signature colour to the nearest faction (so a customized look picks a cell). */
export function factionForColor(color: number): number {
  let best = 0;
  let bestD = Infinity;
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  for (let i = 0; i < FACTION_COLORS.length; i++) {
    const fc = FACTION_COLORS[i];
    const dr = r - ((fc >> 16) & 0xff);
    const dg = g - ((fc >> 8) & 0xff);
    const db = b - (fc & 0xff);
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// ── PvP arenas (free-for-all combat zones) ──
// Designated rectangles away from story spawns / nodes. Everywhere else is PvE-safe.
// Entering costs a $METRO buy-in (see game/pvp.ts); eliminations claim the victim's pot.
// Hub, tutorial, and subway have no arenas — players interact there, they don't fight.
export interface PvpZone {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
}

const PVP_FREE_ZONES = new Set(["safe", "tutorial", "subway"]);

/** True when this zone allows PvP arenas at all. */
export function pvpEnabledForZone(zone: string): boolean {
  if (PVP_FREE_ZONES.has(zone)) return false;
  if (zone.startsWith("int_")) return false;
  if (isVenueSizedZoneName(zone)) return false;
  return /^d\d+$/.test(zone);
}

function isVenueSizedZoneName(zone: string): boolean {
  return /^d\d+i\d+$/.test(zone) || /^h\d+$/.test(zone) || /^est\d+$/.test(zone);
}

/** PvP arenas scaled to the zone's world size — tucked in the southeast, away from the
 *  central story lanes where nodes, spawns, and FIXER beats concentrate. */
export function pvpZonesFor(worldW: number, worldH: number, zone = ""): PvpZone[] {
  if (!pvpEnabledForZone(zone)) return [];
  const sx = worldW / WORLD_W;
  const sy = worldH / WORLD_H;
  const margin = 72 * sx;
  const w = Math.min(520 * sx, worldW * 0.26);
  const h = Math.min(380 * sy, worldH * 0.26);
  return [
    {
      x: worldW - w - margin,
      y: worldH - h - margin,
      w,
      h,
      name: "THE CRUCIBLE",
    },
  ];
}

/** Index of the PvP arena containing (x,y), or -1 if outside all arenas. */
export function pvpZoneAt(x: number, y: number, zones = pvpZonesFor(WORLD_W, WORLD_H, "d0")): number {
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return i;
  }
  return -1;
}

/** True if (x,y) is inside any PvP arena. */
export const inPvpZone = (x: number, y: number, zones = pvpZonesFor(WORLD_W, WORLD_H, "d0")): boolean =>
  pvpZoneAt(x, y, zones) >= 0;

/** True if the point (x,y) is inside a wall tile or out of bounds. */
export function tileIsWall(x: number, y: number, grid: TileGrid): boolean {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  const gw = grid[0]?.length ?? 0;
  const gh = grid.length;
  if (tx < 0 || ty < 0 || tx >= gw || ty >= gh) return true;
  const row = grid[ty];
  return !row || isWall(row[tx]);
}

/**
 * Guaranteed open spawn: if `preferred` collides with walls (player radius), spiral-search
 * tile centres until a free spot is found. Used on every zone enter / building interior
 * so runners never load inside geometry, on roofs, or in 1-tile pockets.
 *
 * Prefers tiles with a walkable neighbour (escape route) so we don't park the player
 * in a sealed courtyard / furniture pocket that looks open but can't be left.
 */
export function resolveOpenSpawn(
  grid: TileGrid,
  preferred: { x: number; y: number },
  maxR?: number,
): { x: number; y: number } {
  const { w: gw, h: gh } = gridDims(grid);
  const searchR = maxR ?? Math.max(28, Math.min(96, Math.ceil(Math.max(gw, gh) / 3)));
  const px = Number.isFinite(preferred.x) ? preferred.x : TILE * 1.5;
  const py = Number.isFinite(preferred.y) ? preferred.y : TILE * 1.5;

  const openTile = (tx: number, ty: number) =>
    tx > 0 && ty > 0 && tx < gw - 1 && ty < gh - 1 && grid[ty]?.[tx] !== undefined && !isWall(grid[ty][tx]);
  const hasEscape = (tx: number, ty: number) =>
    openTile(tx - 1, ty) || openTile(tx + 1, ty) || openTile(tx, ty - 1) || openTile(tx, ty + 1);
  const tryAt = (tx: number, ty: number, needEscape: boolean): { x: number; y: number } | null => {
    if (!openTile(tx, ty)) return null;
    if (needEscape && !hasEscape(tx, ty)) return null;
    const x = tx * TILE + TILE / 2;
    const y = ty * TILE + TILE / 2;
    if (collides(x, y, grid)) return null;
    return { x, y };
  };

  // Preferred already free and escapable → keep it (resume mid-street).
  {
    const ptx = Math.floor(px / TILE);
    const pty = Math.floor(py / TILE);
    if (!collides(px, py, grid) && openTile(ptx, pty) && hasEscape(ptx, pty)) {
      return { x: px, y: py };
    }
    if (!collides(px, py, grid) && openTile(ptx, pty)) {
      // Free but pocketed — still try to find a better neighbour before accepting.
      const better = tryAt(ptx, pty, true);
      if (better) return better;
    }
  }

  const ptx = Math.floor(px / TILE);
  const pty = Math.floor(py / TILE);

  // Pass 1: spiral for free + escapable tiles (player can actually walk out).
  for (let r = 0; r <= searchR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const hit = tryAt(ptx + dx, pty + dy, true);
        if (hit) return hit;
      }
    }
  }

  // Pass 2: any non-colliding tile centre near preferred.
  for (let r = 0; r <= searchR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const hit = tryAt(ptx + dx, pty + dy, false);
        if (hit) return hit;
      }
    }
  }

  // Pass 3: first free escapable tile on the whole map.
  for (let ty = 1; ty < gh - 1; ty++) {
    for (let tx = 1; tx < gw - 1; tx++) {
      const hit = tryAt(tx, ty, true);
      if (hit) return hit;
    }
  }
  for (let ty = 1; ty < gh - 1; ty++) {
    for (let tx = 1; tx < gw - 1; tx++) {
      const hit = tryAt(tx, ty, false);
      if (hit) return hit;
    }
  }

  // Absolute fallback — still return preferred (better than NaN); caller may wall-lock.
  return { x: px, y: py };
}

export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

/** Closest distance² from point P to segment AB — for swept projectile-vs-entity
 *  hits, so a fast shot can't tunnel past a close target in one tick. */
export function segPointDist2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return dist2(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return dist2(px, py, ax + t * dx, ay + t * dy);
}
