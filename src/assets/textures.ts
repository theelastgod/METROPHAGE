// METROPHAGE — procedural placeholder textures.
//
// Phase 0 art is generated here as neon-lit primitives so the slice runs with
// zero binary assets. Each generator writes to a logical texture key; when real
// art is added to the manifest, the matching generator is simply skipped.

import Phaser from "phaser";
import { TILE, COLORS } from "../config";
import { TILESET_KEY, PLAYER_KEY, BULLET_KEY } from "./manifest";

/** Build a 4-tile horizontal tileset strip: [floor, wall, plaza, lane]. */
function makeTileset(scene: Phaser.Scene) {
  const g = scene.add.graphics();
  const w = TILE;

  // index 0 — street/floor
  g.fillStyle(COLORS.street, 1).fillRect(0, 0, w, w);
  g.lineStyle(1, COLORS.streetLine, 0.5).strokeRect(0.5, 0.5, w - 1, w - 1);

  // index 1 — wall / building (emissive cyan trim so bloom can grab it later)
  const ox = w;
  g.fillStyle(COLORS.wall, 1).fillRect(ox, 0, w, w);
  g.lineStyle(2, COLORS.wallEdge, 0.9).strokeRect(ox + 1, 1, w - 2, w - 2);
  g.fillStyle(COLORS.neonCyan, 0.85).fillRect(ox + 6, 6, 4, 4);
  g.fillStyle(COLORS.neonMagenta, 0.7).fillRect(ox + w - 12, w - 12, 4, 4);

  // index 2 — plaza (magenta-tinted open ground)
  const px = w * 2;
  g.fillStyle(COLORS.plaza, 1).fillRect(px, 0, w, w);
  g.lineStyle(1, COLORS.plazaGlow, 0.35).strokeRect(px + 4.5, 4.5, w - 9, w - 9);

  // index 3 — street with lane marking
  const lx = w * 3;
  g.fillStyle(COLORS.street, 1).fillRect(lx, 0, w, w);
  g.fillStyle(COLORS.neonYellow, 0.55).fillRect(lx + w / 2 - 1, 4, 2, 8);
  g.fillStyle(COLORS.neonYellow, 0.55).fillRect(lx + w / 2 - 1, w - 12, 2, 8);

  g.generateTexture(TILESET_KEY, w * 4, w);
  g.destroy();
}

/** Build the player sprite: a glowing cyan body with a facing nub. */
function makePlayer(scene: Phaser.Scene) {
  const size = 26;
  const c = size / 2;
  const g = scene.add.graphics();

  // soft outer glow
  g.fillStyle(COLORS.neonCyan, 0.18).fillCircle(c, c, 12);
  // body
  g.fillStyle(COLORS.player, 1).fillCircle(c, c, 9);
  g.lineStyle(2, COLORS.neonCyan, 1).strokeCircle(c, c, 9);
  // bright core
  g.fillStyle(COLORS.playerCore, 1).fillCircle(c, c, 4);
  // facing nub (points up = default facing)
  g.fillStyle(COLORS.playerCore, 1).fillTriangle(c - 4, 4, c + 4, 4, c, -2);

  g.generateTexture(PLAYER_KEY, size, size);
  g.destroy();
}

/** Build the projectile: a bright bolt with a hot core and soft glow. */
function makeBullet(scene: Phaser.Scene) {
  const size = 12;
  const c = size / 2;
  const g = scene.add.graphics();
  g.fillStyle(COLORS.bulletGlow, 0.25).fillCircle(c, c, 6);
  g.fillStyle(COLORS.bullet, 1).fillCircle(c, c, 3.5);
  g.fillStyle(COLORS.spark, 1).fillCircle(c, c, 1.6);
  g.generateTexture(BULLET_KEY, size, size);
  g.destroy();
}

/**
 * Generate all procedural placeholders that don't yet have a real file.
 * Safe to call once in BootScene.create().
 */
export function generatePlaceholders(scene: Phaser.Scene) {
  if (!scene.textures.exists(TILESET_KEY)) makeTileset(scene);
  if (!scene.textures.exists(PLAYER_KEY)) makePlayer(scene);
  if (!scene.textures.exists(BULLET_KEY)) makeBullet(scene);
}
