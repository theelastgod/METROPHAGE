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

/** Player movement (px/sec). */
export const PLAYER_SPEED = 200;

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
} as const;
