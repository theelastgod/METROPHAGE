// METROPHAGE netcode protocol + authoritative simulation constants.
// The server is the source of truth: clients send movement INTENT only (never a
// position), and the server integrates it at a fixed tick and fixed speed.

export const TICK_MS = 50; // 20 Hz authoritative tick
export const MOVE_SPEED = 200; // px/sec (matches the game's PLAYER.speed)
export const WORLD = { w: 1280, h: 960 }; // GRID 40x30 * TILE 32
export const SPAWN = { x: 640, y: 480 };
export const PERSIST_EVERY_TICKS = 40; // ~2s snapshot cadence
export const INTENT_EXPIRE_TICKS = 3; // clear movement intent if no fresh input in ~150ms

// client -> server
export type ClientMsg =
  | { t: "login"; name: string }
  | { t: "input"; seq: number; mx: number; my: number };

// server -> client
export type ServerMsg =
  | {
      t: "welcome";
      id: string;
      x: number;
      y: number;
      tickMs: number;
      speed: number;
      world: { w: number; h: number };
    }
  | { t: "state"; tick: number; players: Array<{ id: string; x: number; y: number; ack: number }> }
  | { t: "error"; message: string };

export const clampUnit = (n: number) => (n > 1 ? 1 : n < -1 ? -1 : Number.isFinite(n) ? n : 0);
export const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);
export const round2 = (n: number) => Math.round(n * 100) / 100;
