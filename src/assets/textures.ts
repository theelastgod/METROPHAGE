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
  AGENT_KEY,
  PORTRAIT_PLAYER_KEY,
} from "./manifest";
import { bakeFrames, mirror } from "./pixelart";
import {
  PLAYER_FRAMES,
  PLAYER_PAL,
  COP_FRAMES,
  COP_PAL,
  NPC_FRAMES,
  NPC_PAL,
} from "./charart";

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

/** Player: a top-down cyberian, grayscale so the class tint recolors it. 4 frames. */
function makePlayer(scene: Phaser.Scene) {
  const [down, left, , up] = PLAYER_FRAMES;
  bakeFrames(scene, PLAYER_KEY, [down!, left!, mirror(left!), up!], PLAYER_PAL, 2);
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

/** Turing Cop: grayscale armored trooper, tinted per tier. 4 frames. */
function makeCop(scene: Phaser.Scene) {
  const [down, left, , up] = COP_FRAMES;
  bakeFrames(scene, COP_KEY, [down!, left!, mirror(left!), up!], COP_PAL, 2);
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

/** Friendly NPC (the FIXER contact): lime civilian w/ a yellow antenna. 4 frames. */
function makeNpc(scene: Phaser.Scene) {
  const [down, left, , up] = NPC_FRAMES;
  bakeFrames(scene, NPC_KEY, [down!, left!, mirror(left!), up!], NPC_PAL, 2);
}

/** Build an ambient citizen: a light figure (tinted per-instance in the scene). */
function makeAgent(scene: Phaser.Scene) {
  const w = 18;
  const h = 22;
  const cx = w / 2;
  const g = scene.add.graphics();
  // near-white so per-instance tints read true; nub (head) points "up"
  g.fillStyle(0xe6f2ff, 1).fillRoundedRect(2, 8, w - 4, h - 8, 5); // body
  g.fillStyle(0xffffff, 1).fillCircle(cx, 6, 5); // head
  g.lineStyle(1, 0x0a0a16, 0.5).strokeRoundedRect(2, 8, w - 4, h - 8, 5);
  g.generateTexture(AGENT_KEY, w, h);
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
  if (!scene.textures.exists(AGENT_KEY)) makeAgent(scene);
  if (!scene.textures.exists(PORTRAIT_PLAYER_KEY)) makePortraitPlayer(scene);
}
