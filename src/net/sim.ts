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
export function stepMove(s: MoveState, input: MoveInput, grid: TileGrid, dtMs: number): void {
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
  const dist = PLAYER.speed * dt;

  // Axis-separated resolution → slides along walls instead of sticking.
  const nx = clamp(s.x + mx * dist, PLAYER_RADIUS, WORLD_W - PLAYER_RADIUS);
  if (!collides(nx, s.y, grid)) s.x = nx;
  const ny = clamp(s.y + my * dist, PLAYER_RADIUS, WORLD_H - PLAYER_RADIUS);
  if (!collides(s.x, ny, grid)) s.y = ny;
}
