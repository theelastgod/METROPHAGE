// METROPHAGE — procedural placeholder textures.
//
// Phase 0 art is generated here as neon-lit primitives so the slice runs with
// zero binary assets. Each generator writes to a logical texture key; when real
// art is added to the manifest, the matching generator is simply skipped.

import Phaser from "phaser";
import {
  TILESET_KEY,
  PLAYER_KEY,
  BULLET_KEY,
  COP_KEY,
  BOSS_KEY,
  NODE_KEY,
  NODE_INFECTED_KEY,
  NPC_KEY,
  AGENT_KEY,
  CRATE_KEY,
  STREETLIGHT_KEY,
  GLOW_KEY,
  SPARK_KEY,
  PORTRAIT_PLAYER_KEY,
  PORTRAIT_NPC_KEY,
  UI_FRAME_KEY,
  UI_GUN_KEY,
} from "./manifest";
import { bakeCanvas, bakeDrawnFrames } from "./pixelart";
import { playerKeyFor } from "./manifest";
import {
  CHAR,
  AGENT_W,
  AGENT_H,
  drawCharacter,
  drawAgent,
  PLAYER_SPECS,
  PLAYER_IDS,
  COP_SPEC,
  BOSS_SPEC,
  NPC_SPEC,
} from "./charart";

/**
 * Build the 256×64 (16-cell) tileset. Cells are placed at the indices the world
 * uses: 0 floor, 2 road, 3 plaza, 4 wall. Tiles are designed to tile seamlessly —
 * floor/plaza grids meet on edges, walls stack into building facades.
 */
function makeTileset(scene: Phaser.Scene) {
  bakeCanvas(scene, TILESET_KEY, 256, 64, (ctx) => {
    const px = (x: number, y: number, w: number, h: number, color: number, a = 1) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = "#" + (color & 0xffffff).toString(16).padStart(6, "0");
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    };
    // deterministic 0..1 hash so grime/detail is stable, not random per build
    const h = (x: number, y: number) => {
      const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    const cellX = (i: number) => (i % 8) * 32;
    const cellY = (i: number) => Math.floor(i / 8) * 32;

    // Tech-floor ground: base + a recessed inner panel + dim edge seams (so tiles
    // grid up) + corner rivets + faint grime. Clean — the play space should read.
    const ground = (
      i: number,
      base: number,
      panel: number,
      seam: number,
      rivet: number,
    ) => {
      const ox = cellX(i);
      const oy = cellY(i);
      px(ox, oy, 32, 32, base);
      px(ox + 2, oy + 2, 28, 28, panel); // inset panel
      px(ox + 2, oy + 2, 28, 1, seam, 0.5); // panel top sheen
      // edge seams (top + left) so adjacent tiles meet on a continuous grid
      px(ox, oy, 32, 1, seam, 0.55);
      px(ox, oy, 1, 32, seam, 0.55);
      // corner rivets
      for (const [dx, dy] of [[4, 4], [27, 4], [4, 27], [27, 27]])
        px(ox + dx, oy + dy, 1, 1, rivet, 0.7);
      // sparse grime specks (low, not noisy)
      for (let y = 4; y < 30; y++)
        for (let x = 4; x < 30; x++) {
          const n = h(ox + x * 1.7, oy + y * 1.3);
          if (n > 0.972) px(ox + x, oy + y, 1, 1, base, 1); // dark fleck
        }
    };

    // 0 — floor: dark asphalt, dim cyan seams
    ground(0, 0x0a0e1a, 0x0c111e, 0x1d3a55, 0x2a4d6a);

    // 2 — road: darkest, bright dashed centre lane + side curbs + cracks
    const rx = cellX(2);
    const ry = cellY(2);
    px(rx, ry, 32, 32, 0x07090f);
    px(rx + 1, ry + 1, 30, 30, 0x080b12);
    px(rx, ry, 2, 32, 0x10141e); // left curb
    px(rx + 30, ry, 2, 32, 0x10141e); // right curb
    px(rx + 1, ry, 1, 32, 0x223047, 0.6); // curb edge light
    px(rx + 14, ry + 3, 3, 9, 0xc8902e); // centre dashes (bright; bloom lifts)
    px(rx + 14, ry + 20, 3, 9, 0xc8902e);
    px(rx + 15, ry + 3, 1, 9, 0xffd66a, 0.6); // dash hot core
    for (let k = 0; k < 6; k++) {
      const cxk = 4 + ((h(rx + k, ry) * 24) | 0);
      const cyk = 4 + ((h(rx, ry + k) * 24) | 0);
      px(rx + cxk, ry + cyk, 2, 1, 0x12161f); // hairline cracks
    }

    // 3 — plaza: warmer ground, magenta seams + a glowing centre diamond inlay
    ground(3, 0x130a20, 0x160c26, 0x4a2060, 0x6a2e84);
    const pxo = cellX(3);
    const pyo = cellY(3);
    const dia = [
      [16, 10],
      [15, 11], [16, 11], [17, 11],
      [14, 12], [18, 12],
      [13, 13], [19, 13],
      [13, 14], [19, 14],
      [14, 15], [18, 15],
      [15, 16], [16, 16], [17, 16],
      [16, 17],
    ];
    for (const [x, y] of dia) px(pxo + x, pyo + y, 1, 1, 0x7a3a92);
    px(pxo + 15, pyo + 13, 2, 2, 0xb060c8); // hot centre
    px(pxo + 15, pyo + 13, 1, 1, 0xff2bd6, 0.8);

    // 4 — wall: a building ROOFTOP seen top-down — a dark slab (darker than the
    // street so buildings read as solid mass), lit parapet on the top/left edges,
    // deep shadow on the bottom/right, sparse rooftop tech + one dim skylight.
    const wx = cellX(4);
    const wy = cellY(4);
    px(wx, wy, 32, 32, 0x0b0f18); // dark roof base
    // panelized roof texture (subtle, tiles into a mass)
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const n = h(wx + x * 2.1, wy + y * 1.9);
        if (n > 0.93) px(wx + x, wy + y, 1, 1, 0x121726);
        else if (n < 0.06) px(wx + x, wy + y, 1, 1, 0x080b12);
      }
    px(wx + 8, wy, 1, 32, 0x0d1320, 0.7); // roof panel seams
    px(wx + 22, wy, 1, 32, 0x0d1320, 0.7);
    px(wx, wy + 16, 32, 1, 0x0d1320, 0.7);
    // parapet: lit on top + left (sky glow), shadow on bottom + right (depth)
    px(wx, wy, 32, 2, 0x2a3450);
    px(wx, wy, 32, 1, 0x3c4a6e);
    px(wx, wy, 2, 32, 0x232c44);
    px(wx, wy, 1, 32, 0x33405e);
    px(wx, wy + 30, 32, 2, 0x050709);
    px(wx + 30, wy, 2, 32, 0x070a10);
    // rooftop tech: an AC/vent box (shaded) + a vent grille + a dim skylight
    px(wx + 6, wy + 7, 8, 6, 0x161d2e); // unit body
    px(wx + 6, wy + 7, 8, 1, 0x26314c); // unit lit top
    px(wx + 6, wy + 12, 8, 1, 0x05080e); // unit shadow
    for (let g = 0; g < 3; g++) px(wx + 7 + g * 2, wy + 8, 1, 4, 0x0a0e18); // grille
    px(wx + 19, wy + 19, 7, 6, 0x10182a); // skylight frame
    px(wx + 20, wy + 20, 5, 4, 0x1c3a4a); // glass
    px(wx + 20, wy + 20, 5, 1, 0x29708e, 0.8); // dim skylight glow (not blinding)
    px(wx + 24, wy + 5, 1, 1, 0xff5a6e, 0.9); // tiny rooftop beacon
  });
}

/** Player sprites — a detailed grayscale cyberian per class (tinted in-scene),
 *  plus a default key. 4 facings (down/left/right/up) each, 32×32. */
function makePlayer(scene: Phaser.Scene) {
  const bake = (key: string, id: string) =>
    bakeDrawnFrames(scene, key, 4, CHAR, CHAR, (ctx, f) => drawCharacter(ctx, f, PLAYER_SPECS[id]));
  bake(PLAYER_KEY, "wintermute"); // default / fallback
  for (const id of PLAYER_IDS) bake(playerKeyFor(id), id);
}

/** Projectile: a hot white bolt with a soft glow (tinted to the class per shot). */
function makeBullet(scene: Phaser.Scene) {
  bakeCanvas(scene, BULLET_KEY, 14, 14, (ctx) => {
    const grad = ctx.createRadialGradient(7, 7, 0.5, 7, 7, 7);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.8)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 14, 14);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(6, 6, 2, 2); // hot core
  });
}

/** Turing Cop: grayscale armored trooper, tinted per tier. 4 frames, 32×32. */
function makeCop(scene: Phaser.Scene) {
  bakeDrawnFrames(scene, COP_KEY, 4, CHAR, CHAR, (ctx, f) => drawCharacter(ctx, f, COP_SPEC));
}

/** District boss: grayscale hulking sentinel, tinted per boss. 4 frames, 32×32. */
function makeBoss(scene: Phaser.Scene) {
  bakeDrawnFrames(scene, BOSS_KEY, 4, CHAR, CHAR, (ctx, f) => drawCharacter(ctx, f, BOSS_SPEC));
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
  // soft glow halo — a wide ambient wash + a tighter bright core glow
  const halo = (r: number, a: number) => {
    const grad = ctx.createRadialGradient(24, 22, 1, 24, 22, r);
    grad.addColorStop(0, hex(accent));
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = a;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 48, 48);
    ctx.globalAlpha = 1;
  };
  halo(23, corrupted ? 0.36 : 0.24);
  halo(11, corrupted ? 0.5 : 0.34);

  // pedestal — a 3-tier plinth with lit top edges, dark underside, side cabling
  px(11, 43, 26, 3, 0x070912); // ground shadow
  px(12, 40, 24, 4, 0x0c1020); // lower tier
  px(14, 37, 20, 4, 0x141a2c); // upper tier
  px(14, 37, 20, 1, 0x2c3450); // lit tier edge
  px(15, 38, 18, 1, 0x39455f, 0.7);
  px(13, 41, 1, 3, accent, 0.5); // conduit glow L
  px(34, 41, 1, 3, accent, 0.5); // conduit glow R

  // obelisk body — faceted: lit left bevel, dark right, panelled face
  px(16, 6, 16, 32, 0x101626); // base metal
  px(16, 6, 3, 32, 0x232c48); // left edge light
  px(18, 6, 1, 32, 0x33405e, 0.8); // bevel highlight
  px(29, 6, 3, 32, 0x0b0f1c); // right edge shadow
  px(16, 6, 16, 1, 0x2c3450); // top lip
  for (let i = 0; i < 5; i++) px(19, 11 + i * 5, 10, 1, 0x0a0e1a, 0.6); // rivet seams

  // recessed screen with scanlines, a pulsing core glyph + reflection sheen
  px(19, 11, 10, 22, 0x070b16);
  px(19, 11, 10, 1, 0x050810);
  for (let i = 0; i < 5; i++) px(20, 13 + i * 4, 8, 1, accent, 0.65); // scanlines
  px(22, 18, 4, 7, bright); // bright core
  px(23, 17, 2, 9, bright, 0.85);
  px(23, 19, 2, 3, 0xffffff, 0.95); // hot centre
  px(20, 12, 2, 8, 0xffffff, 0.16); // diagonal glass sheen
  px(21, 13, 1, 6, 0xffffff, 0.12);

  // top emitter — dish, bright tip, faint beam
  px(20, 4, 8, 2, 0x1c2236);
  px(22, 1, 4, 4, 0x222a44);
  px(23, 0, 2, 3, bright);
  px(23, 0, 1, 6, bright, 0.4); // beam wisp

  if (corrupted) {
    // contagion glitch — displaced shards, cracks, drifting energy bits
    px(16, 15, 4, 1, bright, 0.95);
    px(28, 22, 5, 1, bright, 0.95);
    px(19, 27, 7, 1, accent, 0.85);
    px(17, 20, 1, 7, bright, 0.7);
    px(30, 13, 1, 6, accent, 0.7);
    px(24, 7, 1, 4, bright);
    px(13, 18, 2, 2, bright, 0.8); // floating bits
    px(34, 25, 2, 2, accent, 0.7);
    px(11, 30, 1, 1, bright, 0.9);
    px(37, 16, 1, 1, bright, 0.8);
  }
}

function makeNode(scene: Phaser.Scene) {
  bakeCanvas(scene, NODE_KEY, 48, 48, (ctx) => drawTerminal(ctx, 0x6a3cff, 0x29e7ff, false));
}
function makeNodeInfected(scene: Phaser.Scene) {
  bakeCanvas(scene, NODE_INFECTED_KEY, 48, 48, (ctx) => drawTerminal(ctx, 0x1f8f4a, 0x39ff88, true));
}

/** Friendly NPC (the FIXER contact): lime civilian w/ a yellow optic. 4 frames, 32×32. */
function makeNpc(scene: Phaser.Scene) {
  bakeDrawnFrames(scene, NPC_KEY, 4, CHAR, CHAR, (ctx, f) => drawCharacter(ctx, f, NPC_SPEC));
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

/** UI frame — a neon terminal/screen panel. Grayscale so it tints (terminals are
 *  colored) and reads as a clean frame untinted (dialogue portrait + weapon slot). */
function makeUiFrame(scene: Phaser.Scene) {
  bakeCanvas(scene, UI_FRAME_KEY, 32, 32, (ctx) => {
    const c = (col: number) => "#" + (col & 0xffffff).toString(16).padStart(6, "0");
    const px = (x: number, y: number, w: number, h: number, col: number, a = 1) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = c(col);
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    };
    px(3, 3, 26, 26, 0x0a0e1a, 0.82); // dark screen
    for (let y = 7; y < 28; y += 4) px(6, y, 20, 1, 0xffffff, 0.12); // scanlines
    px(13, 14, 6, 4, 0xffffff, 0.55); // centre indicator
    // dim edges
    px(2, 2, 28, 1, 0xffffff, 0.4);
    px(2, 29, 28, 1, 0xffffff, 0.4);
    px(2, 2, 1, 28, 0xffffff, 0.4);
    px(29, 2, 1, 28, 0xffffff, 0.4);
    // bright corner brackets
    px(2, 2, 8, 2, 0xffffff);
    px(2, 2, 2, 8, 0xffffff); // TL
    px(22, 2, 8, 2, 0xffffff);
    px(28, 2, 2, 8, 0xffffff); // TR
    px(2, 28, 8, 2, 0xffffff);
    px(2, 22, 2, 8, 0xffffff); // BL
    px(22, 28, 8, 2, 0xffffff);
    px(28, 22, 2, 8, 0xffffff); // BR
  });
}

/** HUD weapon icon — a sleek neon sidearm silhouette. */
function makeUiGun(scene: Phaser.Scene) {
  bakeCanvas(scene, UI_GUN_KEY, 64, 32, (ctx) => {
    const c = (col: number) => "#" + (col & 0xffffff).toString(16).padStart(6, "0");
    const px = (x: number, y: number, w: number, h: number, col: number, a = 1) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = c(col);
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    };
    px(10, 11, 34, 9, 0x474e66); // receiver
    px(10, 11, 34, 2, 0x9aa0b8); // top highlight
    px(10, 18, 34, 2, 0x222a3c); // bottom shadow
    px(42, 13, 18, 4, 0x747c98); // barrel
    px(42, 13, 18, 1, 0xc8d0e0);
    px(58, 12, 3, 6, 0x29e7ff); // muzzle glow
    px(16, 20, 10, 10, 0x3a4156); // grip
    px(16, 20, 2, 10, 0x586488);
    px(26, 14, 5, 7, 0xff2bd6, 0.85); // trigger / accent
    px(12, 13, 6, 3, 0x29e7ff, 0.7); // sight
  });
}

/** Ambient citizen: a small grayscale civilian, tinted per-instance by the crowd. */
function makeAgent(scene: Phaser.Scene) {
  bakeDrawnFrames(scene, AGENT_KEY, 1, AGENT_W, AGENT_H, (ctx) => drawAgent(ctx));
}

/** Player dialogue portrait: a detailed neon cyberian bust against the city. */
function makePortraitPlayer(scene: Phaser.Scene) {
  bakeCanvas(scene, PORTRAIT_PLAYER_KEY, 96, 96, (ctx) => {
    const cssc = (c: number) => "#" + (c & 0xffffff).toString(16).padStart(6, "0");
    const px = (x: number, y: number, w: number, h: number, c: number, a = 1) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = cssc(c);
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    };
    // backdrop city + faint grid + distant window lights
    px(0, 0, 96, 96, 0x080a14);
    for (let i = 8; i < 96; i += 8) {
      px(0, i, 96, 1, 0x0e1422, 0.5);
      px(i, 0, 1, 96, 0x0e1422, 0.5);
    }
    const lights: Array<[number, number, number]> = [
      [12, 16, 0x29e7ff], [80, 22, 0xff2bd6], [18, 68, 0x29e7ff], [82, 60, 0x39ff88], [70, 14, 0x29e7ff],
    ];
    for (const [x, y, c] of lights) px(x, y, 2, 2, c, 0.55);
    const vg = ctx.createRadialGradient(48, 42, 18, 48, 50, 62);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, 96, 96);

    // shoulders / armor
    px(12, 72, 72, 24, 0x141a2c);
    px(12, 72, 72, 3, 0x222a44);
    px(12, 72, 3, 24, 0x2a3450);
    px(19, 78, 7, 14, 0x29e7ff, 0.35);
    px(70, 78, 7, 14, 0xff2bd6, 0.3);
    // neck
    px(40, 62, 16, 12, 0x1a2236);
    px(40, 62, 2, 12, 0x2a3450);

    // head / helmet
    px(28, 16, 40, 50, 0x161c30);
    px(28, 16, 3, 50, 0x33405e); // left neon rim
    px(28, 16, 40, 3, 0x222a44); // top
    px(65, 16, 3, 50, 0x0d1120); // right shadow
    px(31, 66, 34, 2, 0x0a0c16); // jaw shadow
    // crest
    px(43, 9, 10, 8, 0x1a2236);
    px(45, 7, 6, 2, 0x29e7ff, 0.75);

    // visor — glowing band with scanlines + reflection
    px(31, 34, 34, 15, 0x06121e);
    px(33, 36, 30, 11, 0x0a3a52);
    px(33, 37, 30, 3, 0x29e7ff, 0.95);
    px(33, 41, 30, 1, 0x29e7ff, 0.5);
    px(33, 44, 30, 2, 0x18708e, 0.85);
    px(36, 37, 6, 4, 0xffffff, 0.9); // hot reflection
    px(54, 38, 4, 2, 0xffffff, 0.5);

    // data-jack (right temple, magenta) + mouth grille
    px(64, 28, 6, 3, 0xff2bd6);
    px(67, 31, 2, 9, 0x8a1a6a);
    px(40, 54, 16, 2, 0x0d1120);
    px(41, 52, 14, 1, 0x222a44);

    // ── detail pass: rim light, visor gloss, HUD reticle, atmosphere ──
    px(28, 17, 1, 48, 0x4ad6ff, 0.5); // cyan rim down the lit helmet edge
    px(29, 16, 1, 4, 0x9af0ff, 0.6);
    px(45, 7, 6, 2, 0x29e7ff, 0.5); // crest glow
    px(45, 38, 11, 1, 0x9af0ff, 0.4); // visor gloss
    px(57, 39, 3, 3, 0xffffff, 0.75); // bright glint
    px(46, 41, 3, 1, 0xeafdff, 0.6); // tiny HUD reticle in the visor
    px(47, 40, 1, 3, 0xeafdff, 0.6);
    px(19, 78, 2, 12, 0x29e7ff, 0.4); // shoulder rim accents
    px(75, 78, 2, 12, 0xff2bd6, 0.32);
    const haze = ctx.createLinearGradient(0, 0, 0, 46); // volumetric top haze
    haze.addColorStop(0, "rgba(41,231,255,0.10)");
    haze.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, 96, 46);
  });
}

/** FIXER dialogue portrait: a hooded streetwise contact, amber-lit + rebreather. */
function makePortraitNpc(scene: Phaser.Scene) {
  bakeCanvas(scene, PORTRAIT_NPC_KEY, 96, 96, (ctx) => {
    const cssc = (c: number) => "#" + (c & 0xffffff).toString(16).padStart(6, "0");
    const px = (x: number, y: number, w: number, h: number, c: number, a = 1) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = cssc(c);
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    };
    px(0, 0, 96, 96, 0x0c0a08); // warm-dark backdrop
    for (let i = 8; i < 96; i += 8) {
      px(0, i, 96, 1, 0x140f0a, 0.5);
      px(i, 0, 1, 96, 0x140f0a, 0.5);
    }
    const lights: Array<[number, number, number]> = [
      [14, 18, 0xf7a23c], [78, 24, 0xf7ff3c], [20, 70, 0xf7a23c], [82, 60, 0xff7a3c],
    ];
    for (const [x, y, c] of lights) px(x, y, 2, 2, c, 0.5);
    const vg = ctx.createRadialGradient(48, 44, 18, 48, 50, 62);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.76)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, 96, 96);

    // coat shoulders
    px(10, 72, 76, 24, 0x1a1410);
    px(10, 72, 76, 3, 0x2c2418);
    px(10, 72, 3, 24, 0x342a1a);
    px(17, 78, 8, 15, 0xf7a23c, 0.22);
    // hood / cowl over a shadowed face
    px(24, 12, 48, 56, 0x14100c);
    px(24, 12, 3, 56, 0x342a1a); // warm rim
    px(69, 12, 3, 56, 0x090705);
    px(40, 8, 16, 6, 0x14100c); // hood fold
    px(30, 19, 36, 45, 0x090705); // face cavity (deep shadow)
    // glowing amber optic + dimmer eye
    px(35, 35, 11, 6, 0x2a1a08);
    px(36, 36, 9, 3, 0xf7a23c, 0.95);
    px(37, 36, 3, 2, 0xffffff, 0.9);
    px(51, 36, 8, 3, 0x6a4a1a, 0.7);
    // rebreather mask
    px(37, 47, 22, 13, 0x1c1610);
    px(37, 47, 22, 2, 0x342818);
    px(42, 51, 3, 5, 0x4a3a20);
    px(47, 51, 3, 5, 0x4a3a20);
    px(52, 51, 3, 5, 0x4a3a20);
    px(45, 58, 6, 2, 0xf7a23c, 0.55); // vent glow

    // ── detail pass: amber rim, optic bloom, hood folds, atmosphere ──
    px(24, 13, 1, 54, 0xf7a23c, 0.42); // warm rim down the lit hood edge
    px(25, 12, 1, 4, 0xffd27a, 0.5);
    px(40, 8, 16, 1, 0x2c2418, 0.9); // hood crown fold
    px(34, 33, 13, 9, 0xf7a23c, 0.12); // soft optic bloom halo
    px(38, 36, 2, 2, 0xffffff, 0.95); // hot optic catchlight
    px(36, 35, 9, 1, 0xffd27a, 0.6);
    px(37, 47, 22, 1, 0x4a3a20, 0.7); // rebreather top highlight
    px(17, 78, 2, 14, 0xf7a23c, 0.3); // coat shoulder rim
    const nhaze = ctx.createLinearGradient(0, 0, 0, 46);
    nhaze.addColorStop(0, "rgba(247,162,60,0.10)");
    nhaze.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = nhaze;
    ctx.fillRect(0, 0, 96, 46);
  });
  // The dialogue requests frame 0 (the striker sheet was multi-frame).
  const tex = scene.textures.get(PORTRAIT_NPC_KEY);
  if (!tex.has("0")) tex.add(0, 0, 0, 0, 96, 96);
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
  if (need(BOSS_KEY)) makeBoss(scene);
  if (need(NODE_KEY)) makeNode(scene);
  if (need(NODE_INFECTED_KEY)) makeNodeInfected(scene);
  if (need(NPC_KEY)) makeNpc(scene);
  if (need(AGENT_KEY)) makeAgent(scene);
  if (need(CRATE_KEY)) makeCrate(scene);
  if (need(STREETLIGHT_KEY)) makeStreetlight(scene);
  if (need(GLOW_KEY)) makeGlow(scene);
  if (need(SPARK_KEY)) makeSpark(scene);
  if (need(PORTRAIT_PLAYER_KEY)) makePortraitPlayer(scene);
  if (need(PORTRAIT_NPC_KEY)) makePortraitNpc(scene);
  if (need(UI_FRAME_KEY)) makeUiFrame(scene);
  if (need(UI_GUN_KEY)) makeUiGun(scene);
}
