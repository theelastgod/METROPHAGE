// METROPHAGE — global constants.
// Kept as plain data so game logic stays independent of Phaser/render code.

export const TILE = 32;

/** District grid dimensions, in tiles. */
export const GRID_W = 40;
export const GRID_H = 30;

export const WORLD_W = GRID_W * TILE;
export const WORLD_H = GRID_H * TILE;

/** Logical render size. The canvas scales to fit the window (Phaser.Scale.FIT). */
export const VIEW_W = 960;
export const VIEW_H = 540;

/** Player tuning. */
export const PLAYER = {
  speed: 200, // px/sec
  maxHp: 100,
  fireRateMs: 170, // min gap between shots (hold to auto-fire)
  dashSpeed: 640,
  dashDurationMs: 150,
  dashIframeMs: 260, // i-frames outlast the dash slightly
  dashCooldownMs: 600,
} as const;

/** Projectile weapon tuning. */
export const BULLET = {
  speed: 580,
  lifetimeMs: 900,
  radius: 4,
  damage: 25,
  maxActive: 64,
} as const;

/**
 * Neon-noir palette: hyper-saturated emissives over near-black.
 * Numeric (0xRRGGBB) for Phaser, hex strings for CSS/text where needed.
 */
export const COLORS = {
  bgVoid: 0x04020a,
  street: 0x0b0716,
  streetLine: 0x1b1140,
  wall: 0x140c2a,
  wallEdge: 0x00e5ff, // cyan emissive trim
  plaza: 0x120a24,
  plazaGlow: 0xff2bd6, // magenta
  neonMagenta: 0xff2bd6,
  neonCyan: 0x00e5ff,
  neonYellow: 0xf7ff3c,
  neonGreen: 0x39ff88,
  player: 0x00e5ff,
  playerCore: 0xeafdff,
  bullet: 0xf7ff3c, // electric-yellow bolt
  bulletGlow: 0xff2bd6,
  spark: 0xffffff,
} as const;
