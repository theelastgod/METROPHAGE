// METROPHAGE — procedural placeholder textures.
//
// Phase 0 art is generated here as neon-lit primitives so the slice runs with
// zero binary assets. Each generator writes to a logical texture key; when real
// art is added to the manifest, the matching generator is simply skipped.

import Phaser from "phaser";
import { COLORS } from "../config";
import {
  TILESET_KEY,
  PLAYER_KEY,
  BULLET_KEY,
  COP_KEY,
  NODE_KEY,
  NODE_INFECTED_KEY,
  NPC_KEY,
  AGENT_KEY,
  CRATE_KEY,
  STREETLIGHT_KEY,
  GLOW_KEY,
  SPARK_KEY,
  PORTRAIT_PLAYER_KEY,
} from "./manifest";
import { bakeFrames, bakeCanvas, mirror } from "./pixelart";
import {
  PLAYER_FRAMES,
  PLAYER_PAL,
  COP_FRAMES,
  COP_PAL,
  NPC_FRAMES,
  NPC_PAL,
} from "./charart";

/**
 * Build the 256×64 (16-cell) tileset. Cells are placed at the indices the world
 * uses: 0 floor, 2 road, 3 plaza, 4 wall. Tiles are designed to tile seamlessly —
 * floor/plaza grids meet on edges, walls stack into building facades.
 */
function makeTileset(scene: Phaser.Scene) {
  bakeCanvas(scene, TILESET_KEY, 256, 64, (ctx) => {
    const px = (x: number, y: number, w: number, h: number, color: number) => {
      ctx.fillStyle = "#" + (color & 0xffffff).toString(16).padStart(6, "0");
      ctx.fillRect(x, y, w, h);
    };
    // deterministic 0..1 hash so grime/windows are stable, not random per build
    const h = (x: number, y: number) => {
      const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    const cellX = (i: number) => (i % 8) * 32;
    const cellY = (i: number) => Math.floor(i / 8) * 32;

    // floor / plaza share a grid-ground recipe (base + edge grid + grime)
    const ground = (i: number, base: number, grid: number, lo: number, hi: number) => {
      const ox = cellX(i);
      const oy = cellY(i);
      px(ox, oy, 32, 32, base);
      for (let x = 0; x < 32; x++) {
        px(ox + x, oy, 1, 1, grid); // top edge
        px(ox, oy + x, 1, 1, grid); // left edge
      }
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          const n = h(ox + x, oy + y);
          if (n > 0.94) px(ox + x, oy + y, 1, 1, hi);
          else if (n < 0.05) px(ox + x, oy + y, 1, 1, lo);
        }
    };

    // 0 — floor: dark asphalt, dim cyan grid
    ground(0, 0x0a0e1a, 0x16304a, 0x070a14, 0x141d30);

    // 2 — road: darker, no grid, faint centre lane dashes (orange)
    const rx = cellX(2);
    const ry = cellY(2);
    px(rx, ry, 32, 32, 0x080a12);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++)
        if (h(rx + x, ry + y) > 0.95) px(rx + x, ry + y, 1, 1, 0x12161f);
    px(rx + 15, ry + 4, 2, 8, 0x8a5a1e); // dash (dim; bloom lifts it)
    px(rx + 15, ry + 20, 2, 8, 0x8a5a1e);

    // 3 — plaza: warmer ground, magenta grid + a centre diamond inlay
    ground(3, 0x120a1e, 0x3a1a4a, 0x0c0716, 0x1e1230);
    const pxo = cellX(3);
    const pyo = cellY(3);
    const dia = [
      [16, 11],
      [15, 12], [16, 12], [17, 12],
      [14, 13], [18, 13],
      [13, 14], [19, 14],
      [14, 15], [18, 15],
      [15, 16], [16, 16], [17, 16],
      [16, 17],
    ];
    for (const [x, y] of dia) px(pxo + x, pyo + y, 1, 1, 0x5a2a6a);

    // 4 — wall: a building-floor slab — lit top ledge, windows, shadow base.
    const wx = cellX(4);
    const wy = cellY(4);
    px(wx, wy, 32, 32, 0x141826); // base
    px(wx, wy, 32, 3, 0x222a40); // lit top ledge
    px(wx, wy + 2, 32, 1, 0x33405e); // ledge highlight
    px(wx, wy + 30, 32, 2, 0x0a0c16); // shadow base
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++)
        if (h(wx + x * 3, wy + y) > 0.93) px(wx + x, wy + y, 1, 1, 0x1c2236); // texture
    // windows (emissive), two rows
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 3; c++) {
        const on = h(wx + c * 7, wy + r * 11) > 0.4;
        const col = on ? (h(c, r) > 0.7 ? 0xff2bd6 : 0x29e7ff) : 0x0e1424;
        px(wx + 5 + c * 8, wy + 8 + r * 11, 3, 4, col);
      }
  });
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

/** A city node — a glowing data-obelisk on a pedestal. Same shape, two states. */
function drawTerminal(
  ctx: CanvasRenderingContext2D,
  accent: number,
  bright: number,
  corrupted: boolean,
) {
  const hex = (c: number) => "#" + (c & 0xffffff).toString(16).padStart(6, "0");
  const px = (x: number, y: number, w: number, h: number, c: number, a = 1) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = hex(c);
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  };
  // soft glow halo
  const grad = ctx.createRadialGradient(24, 22, 2, 24, 22, 22);
  grad.addColorStop(0, hex(accent));
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = corrupted ? 0.4 : 0.26;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 48, 48);
  ctx.globalAlpha = 1;

  // pedestal base
  px(13, 38, 22, 6, 0x0e1120);
  px(15, 36, 18, 3, 0x1c2236);
  px(15, 36, 18, 1, 0x2c3450);
  px(11, 43, 26, 2, 0x080a14);

  // obelisk body
  px(16, 8, 16, 30, 0x141a2c); // base metal
  px(16, 8, 2, 30, 0x222a44); // left edge light
  px(30, 8, 2, 30, 0x0d1120); // right edge shadow
  // screen panel
  px(19, 12, 10, 20, 0x0a0e1c);
  for (let i = 0; i < 4; i++) px(20, 14 + i * 4, 8, 1, accent, 0.7); // scanlines
  px(22, 19, 4, 6, bright); // bright core
  px(23, 20, 2, 4, 0xffffff, 0.9);

  // top emitter + tip
  px(22, 3, 4, 6, 0x1c2236);
  px(23, 1, 2, 3, bright);

  if (corrupted) {
    // glitch corruption — displaced pixels + cracks
    px(17, 16, 3, 1, bright, 0.9);
    px(28, 23, 4, 1, bright, 0.9);
    px(20, 28, 6, 1, accent, 0.8);
    px(18, 22, 1, 6, bright, 0.7);
    px(29, 14, 1, 5, accent, 0.7);
    px(24, 9, 1, 3, bright);
  }
}

function makeNode(scene: Phaser.Scene) {
  bakeCanvas(scene, NODE_KEY, 48, 48, (ctx) => drawTerminal(ctx, 0x6a3cff, 0x29e7ff, false));
}
function makeNodeInfected(scene: Phaser.Scene) {
  bakeCanvas(scene, NODE_INFECTED_KEY, 48, 48, (ctx) => drawTerminal(ctx, 0x1f8f4a, 0x39ff88, true));
}

/** Friendly NPC (the FIXER contact): lime civilian w/ a yellow antenna. 4 frames. */
function makeNpc(scene: Phaser.Scene) {
  const [down, left, , up] = NPC_FRAMES;
  bakeFrames(scene, NPC_KEY, [down!, left!, mirror(left!), up!], NPC_PAL, 2);
}

/** Soft additive glow disc (white — tinted per use: muzzle, gate, light). */
function makeGlow(scene: Phaser.Scene) {
  bakeCanvas(scene, GLOW_KEY, 64, 64, (ctx) => {
    const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.32, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  });
}

/** Hit spark — a hot 4-point star (white, tinted per impact). */
function makeSpark(scene: Phaser.Scene) {
  bakeCanvas(scene, SPARK_KEY, 16, 16, (ctx) => {
    const a = (x: number, y: number, w: number, h: number, al: number) => {
      ctx.globalAlpha = al;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    };
    a(7, 0, 2, 16, 0.45); // vertical ray
    a(0, 7, 16, 2, 0.45); // horizontal ray
    a(3, 3, 2, 2, 0.35);
    a(11, 3, 2, 2, 0.35);
    a(3, 11, 2, 2, 0.35);
    a(11, 11, 2, 2, 0.35); // diagonal sparks
    a(6, 6, 4, 4, 1); // core
    a(7, 7, 2, 2, 1);
  });
}

/** Loot crate — a neon supply container with a glowing seam + bolts. */
function makeCrate(scene: Phaser.Scene) {
  bakeCanvas(scene, CRATE_KEY, 32, 32, (ctx) => {
    const px = (x: number, y: number, w: number, h: number, c: number, al = 1) => {
      ctx.globalAlpha = al;
      ctx.fillStyle = "#" + (c & 0xffffff).toString(16).padStart(6, "0");
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    };
    px(6, 7, 20, 19, 0x161c30);
    px(6, 7, 20, 2, 0x2a3450); // top edge
    px(6, 7, 2, 19, 0x222a44); // left edge
    px(24, 7, 2, 19, 0x0d1120); // right shadow
    px(6, 24, 20, 2, 0x0a0c16); // bottom
    px(6, 15, 20, 2, 0xf7ff3c, 0.85); // glowing lid seam
    px(15, 7, 2, 19, 0x29e7ff, 0.6); // vertical seam
    [[8, 10], [22, 10], [8, 21], [22, 21]].forEach(([x, y]) => px(x, y, 2, 2, 0x39ff88));
  });
}

/** Streetlight — pole + glowing lamp (tinted to the district accent in-scene). */
function makeStreetlight(scene: Phaser.Scene) {
  bakeCanvas(scene, STREETLIGHT_KEY, 32, 48, (ctx) => {
    const px = (x: number, y: number, w: number, h: number, c: number) => {
      ctx.fillStyle = "#" + (c & 0xffffff).toString(16).padStart(6, "0");
      ctx.fillRect(x, y, w, h);
    };
    // lamp glow (white -> accent when tinted)
    const grad = ctx.createRadialGradient(16, 8, 1, 16, 8, 13);
    grad.addColorStop(0, "rgba(255,255,255,0.85)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 22);
    // pole + base
    px(15, 11, 2, 35, 0x39415a);
    px(15, 11, 1, 35, 0x586488);
    px(12, 45, 8, 2, 0x222a3c);
    // lamp housing (bright)
    px(11, 4, 10, 6, 0xffffff);
    px(12, 3, 8, 2, 0xffffff);
    px(13, 10, 6, 2, 0xe0e8ff);
  });
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

/**
 * Generate all procedural placeholders that don't yet have a real file.
 * Safe to call once in BootScene.create().
 */
export function generatePlaceholders(scene: Phaser.Scene) {
  const need = (k: string) => !scene.textures.exists(k);
  if (need(TILESET_KEY)) makeTileset(scene);
  if (need(PLAYER_KEY)) makePlayer(scene);
  if (need(BULLET_KEY)) makeBullet(scene);
  if (need(COP_KEY)) makeCop(scene);
  if (need(NODE_KEY)) makeNode(scene);
  if (need(NODE_INFECTED_KEY)) makeNodeInfected(scene);
  if (need(NPC_KEY)) makeNpc(scene);
  if (need(AGENT_KEY)) makeAgent(scene);
  if (need(CRATE_KEY)) makeCrate(scene);
  if (need(STREETLIGHT_KEY)) makeStreetlight(scene);
  if (need(GLOW_KEY)) makeGlow(scene);
  if (need(SPARK_KEY)) makeSpark(scene);
  if (need(PORTRAIT_PLAYER_KEY)) makePortraitPlayer(scene);
}
