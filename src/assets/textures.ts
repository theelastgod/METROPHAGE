// METROPHAGE — procedural placeholder textures.
//
// Phase 0 art is generated here as neon-lit primitives so the slice runs with
// zero binary assets. Each generator writes to a logical texture key; when real
// art is added to the manifest, the matching generator is simply skipped.

import Phaser from "phaser";
import { TILE, COLORS } from "../config";
import {
  TILESET_KEY,
  PLAYER_KEY,
  BULLET_KEY,
  COP_KEY,
  NODE_KEY,
  NPC_KEY,
  PORTRAIT_PLAYER_KEY,
} from "./manifest";

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

/** Build the Turing Cop: a red angular diamond — clearly hostile vs. the player disc. */
function makeCop(scene: Phaser.Scene) {
  const size = 28;
  const c = size / 2;
  const g = scene.add.graphics();
  const diamond = (r: number) => [c, c - r, c + r, c, c, c + r, c - r, c];

  g.fillStyle(COLORS.enemy, 0.16).fillCircle(c, c, 13); // glow
  g.fillStyle(COLORS.enemy, 1).fillPoints(toPts(diamond(11)), true);
  g.lineStyle(2, COLORS.enemyEdge, 1).strokePoints(toPts(diamond(11)), true, true);
  g.fillStyle(0x2a0712, 1).fillPoints(toPts(diamond(6)), true); // dark inner
  g.fillStyle(COLORS.enemyCore, 1).fillRect(c - 1.5, c - 4, 3, 8); // visor slit (faces up)
  g.generateTexture(COP_KEY, size, size);
  g.destroy();
}

/** Build the infection node: a hexagonal city terminal/pylon. */
function makeNode(scene: Phaser.Scene) {
  const size = 32;
  const c = size / 2;
  const g = scene.add.graphics();
  const hex = (r: number) => {
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      pts.push(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    return pts;
  };
  g.fillStyle(COLORS.node, 0.16).fillCircle(c, c, 15);
  g.fillStyle(0x140a26, 1).fillPoints(toPts(hex(13)), true);
  g.lineStyle(2, COLORS.node, 1).strokePoints(toPts(hex(13)), true, true);
  g.lineStyle(1, COLORS.neonCyan, 0.7).strokePoints(toPts(hex(8)), true, true);
  g.fillStyle(COLORS.playerCore, 1).fillCircle(c, c, 3);
  g.generateTexture(NODE_KEY, size, size);
  g.destroy();
}

/** Build the friendly NPC: a lime contact, distinct from cyan player / red cops. */
function makeNpc(scene: Phaser.Scene) {
  const size = 26;
  const c = size / 2;
  const g = scene.add.graphics();
  g.fillStyle(COLORS.npc, 0.16).fillCircle(c, c, 12);
  g.fillStyle(COLORS.npc, 1).fillCircle(c, c, 9);
  g.lineStyle(2, COLORS.neonYellow, 1).strokeCircle(c, c, 9);
  g.fillStyle(0x0c2a08, 1).fillCircle(c, c, 5);
  g.fillStyle(COLORS.neonYellow, 1).fillCircle(c, 4, 2); // antenna bead
  g.generateTexture(NPC_KEY, size, size);
  g.destroy();
}

/** Build the player dialogue portrait: a neon cyberian visor-head bust. */
function makePortraitPlayer(scene: Phaser.Scene) {
  const w = 96;
  const h = 96;
  const g = scene.add.graphics();
  g.fillStyle(0x0a1420, 1).fillRect(0, 0, w, h);
  // shoulders
  g.fillStyle(0x13243a, 1).fillRoundedRect(14, 64, w - 28, 40, 10);
  // head
  g.fillStyle(0x1b3550, 1).fillRoundedRect(28, 20, 40, 46, 12);
  g.lineStyle(2, COLORS.neonCyan, 0.9).strokeRoundedRect(28, 20, 40, 46, 12);
  // visor
  g.fillStyle(COLORS.neonCyan, 1).fillRoundedRect(33, 36, 30, 9, 3);
  g.fillStyle(COLORS.playerCore, 1).fillRect(36, 38, 6, 4);
  // jack
  g.fillStyle(COLORS.neonMagenta, 0.9).fillRect(66, 28, 4, 12);
  g.generateTexture(PORTRAIT_PLAYER_KEY, w, h);
  g.destroy();
}

/** Helper: flat [x,y,x,y,...] -> Vector2-ish points for fill/strokePoints. */
function toPts(flat: number[]) {
  const pts: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i], y: flat[i + 1] });
  return pts;
}

/**
 * Generate all procedural placeholders that don't yet have a real file.
 * Safe to call once in BootScene.create().
 */
export function generatePlaceholders(scene: Phaser.Scene) {
  if (!scene.textures.exists(TILESET_KEY)) makeTileset(scene);
  if (!scene.textures.exists(PLAYER_KEY)) makePlayer(scene);
  if (!scene.textures.exists(BULLET_KEY)) makeBullet(scene);
  if (!scene.textures.exists(COP_KEY)) makeCop(scene);
  if (!scene.textures.exists(NODE_KEY)) makeNode(scene);
  if (!scene.textures.exists(NPC_KEY)) makeNpc(scene);
  if (!scene.textures.exists(PORTRAIT_PLAYER_KEY)) makePortraitPlayer(scene);
}
