// METROPHAGE shared movement simulation — the SINGLE source of truth for how a
// player moves, run identically on the client (prediction) and the server
// (authority). Phaser-free and deterministic: given the same start state, input,
// grid and dt, it always produces the same result — which is what makes
// client-side prediction reconcile cleanly against the server.
//
// NOTE: this replaces Phaser arcade physics for networked movement. It models the
// player as an axis-aligned box (half-extent PLAYER_RADIUS) and resolves walls per
// axis so you slide along them. Both sides must import THIS — never reimplement.

import { TILE, GRID_W, GRID_H, PLAYER } from "../config";
import { isWall, type TileGrid } from "../world/district";

/** Fixed network tick — the simulation step size on both client and server. */
export const NET_TICK_MS = 50; // 20 Hz
/** Player collision half-extent (px). Matches the old arcade body's ~9px radius. */
export const PLAYER_RADIUS = 9;

export const WORLD_W = GRID_W * TILE;
export const WORLD_H = GRID_H * TILE;

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

/** True if a PLAYER_RADIUS box centred at (x,y) overlaps any wall tile or the edge. */
export function collides(x: number, y: number, grid: TileGrid): boolean {
  const minTx = Math.floor((x - PLAYER_RADIUS) / TILE);
  const maxTx = Math.floor((x + PLAYER_RADIUS) / TILE);
  const minTy = Math.floor((y - PLAYER_RADIUS) / TILE);
  const maxTy = Math.floor((y + PLAYER_RADIUS) / TILE);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return true;
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

  // Axis-separated resolution → slides along walls instead of sticking.
  const nx = clamp(s.x + mx * dist, PLAYER_RADIUS, WORLD_W - PLAYER_RADIUS);
  if (!collides(nx, s.y, grid)) s.x = nx;
  const ny = clamp(s.y + my * dist, PLAYER_RADIUS, WORLD_H - PLAYER_RADIUS);
  if (!collides(s.x, ny, grid)) s.y = ny;
}

// ── Combat constants (server-authoritative; client renders + sends fire intent) ──
export const PLAYER_HP = 100;
export const COP_HP = 75;
export const PLAYER_DMG = 25;
export const ENEMY_DMG = 10;
export const PLAYER_FIRE_MS = 170; // min gap between player shots
export const COP_FIRE_MS = 1100;
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
export const XP_PER_KILL = 14;
export const levelForXp = (xp: number) => 1 + Math.floor(xp / 100);
export const xpIntoLevel = (xp: number) => xp % 100; // 0..99 toward the next level
export const CREDITS_PER_KILL = 12;
export const LOOT_DROP_CHANCE = 0.55; // chance a cop drops a pickup
export const PICKUP_RADIUS = 18; // walk within this to collect
export const PICKUP_TTL_MS = 15000;
/** Pickup kinds: 0 = credit cache, 1 = data core (rarer, worth more + bonus XP). */
export const PICKUP_CREDIT = 0;
export const PICKUP_CORE = 1;
export const SING_PER_KILL = 0.6; // every kill (any player) pushes the shared meter
export const SING_MAX = 100;
/** When the Singularity hits SING_MAX a server-wide meltdown runs for this long,
 *  then the era resets (Singularity → 0, season++). During it the HSS goes berserk. */
export const MELTDOWN_DURATION_MS = 8000;
export const MELTDOWN_ENEMY_SPEED_MULT = 1.6;
export const MELTDOWN_FIRE_FASTER = 0.5; // cop fire cooldown × this

/** Area-of-interest radius — the server only sends a client the entities within
 *  this distance of its player. Bigger than the ~960×540 view so nothing pops in
 *  at the edge; the mechanism is what matters (it's what makes scale possible). */
export const AOI_RADIUS = 720;

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
// Designated rectangles (world px) where the server lets players damage each other.
// Everywhere else is PvE-safe. The SAME arenas exist in every district/zone, so each
// district has a known battlefield. Shared here so client (rendering + warnings) and
// server (the only place damage is actually applied) use one definition.
export interface PvpZone {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
}
export const PVP_ZONES: PvpZone[] = [
  // THE CRUCIBLE — a big central arena. Centred so it's an obvious landmark; the
  // server gives a respawn-protection window so it can't be spawn-camped.
  { x: WORLD_W / 2 - 280, y: WORLD_H / 2 - 200, w: 560, h: 400, name: "THE CRUCIBLE" },
];

/** Index of the PvP arena containing (x,y), or -1 if the point is in safe territory. */
export function pvpZoneAt(x: number, y: number): number {
  for (let i = 0; i < PVP_ZONES.length; i++) {
    const z = PVP_ZONES[i];
    if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return i;
  }
  return -1;
}
/** True if (x,y) is inside any PvP arena. */
export const inPvpZone = (x: number, y: number): boolean => pvpZoneAt(x, y) >= 0;

/** True if the point (x,y) is inside a wall tile or out of bounds. */
export function tileIsWall(x: number, y: number, grid: TileGrid): boolean {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return true;
  const row = grid[ty];
  return !row || isWall(row[tx]);
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
