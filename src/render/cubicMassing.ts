// METROPHAGE — 2.5D cubic building massing.
//
// Authored footprints are flat wall-tile rectangles. This paints a south wall, an east
// wall, a receding roof, and a ground shadow so blocks read as CUBES with different
// storey counts (landmark towers vs low homes) instead of painted floor slabs.
// Iterates building rects only — never the whole city grid (hub shade used to be off
// because a 450×360 per-tile pass melted integrated GPUs; the compact hub is ~30 blocks).

import Phaser from "phaser";
import { TILE } from "../config";
import type { Rect } from "../game/districts";

export type CubicBuilding = {
  rect: Rect;
  kind: string;
  env?: string;
  door?: [number, number];
  /** Higgsfield sprite already covers the roof — skip the receding cap. */
  hfCovered?: boolean;
};

const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

/** Storeys for a footprint. Kind sets the base; env / salt jitter so two shops differ. */
export function cubicStories(kind: string, env = "", salt = 0): number {
  let n = 2;
  switch (kind) {
    case "citycenter":
      n = 6;
      break;
    case "stadium":
      n = 4;
      break;
    case "hotel":
    case "hospital":
      n = 5;
      break;
    case "guild":
    case "radio":
    case "arcology":
      n = 4;
      break;
    case "subway":
    case "clinic":
    case "ripperdoc":
    case "shop":
    case "arcade":
      n = 3;
      break;
    case "home":
    case "den":
    case "garage":
      n = 2;
      break;
    default:
      n = 3;
  }
  if (env === "corporate" || env === "arcology" || env === "spire" || env === "core") n += 1;
  if (env === "downtown") n += 1;
  if (env === "slum" || env === "wastes" || env === "undercity") n = Math.max(2, n - 1);
  n += salt & 1;
  return Math.max(2, Math.min(7, n));
}

/** South-face height in pixels (the visible cube wall). */
export function cubicSouthPx(stories: number): number {
  return 5 + stories * 4;
}

function mix(accent: number, amt: number, base = 0x0a1220): number {
  const ar = (accent >> 16) & 0xff;
  const ag = (accent >> 8) & 0xff;
  const ab = accent & 0xff;
  const br = (base >> 16) & 0xff;
  const bg = (base >> 8) & 0xff;
  const bb = base & 0xff;
  const r = Math.round(br + (ar - br) * amt);
  const g = Math.round(bg + (ag - bg) * amt);
  const b = Math.round(bb + (ab - bb) * amt);
  return (r << 16) | (g << 8) | b;
}

export function paintCubicMassing(
  scene: Phaser.Scene,
  buildings: CubicBuilding[],
  accent = 0x29e7ff,
  depth = 3.55,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(depth);
  const shadow = scene.add.graphics().setDepth(2.15);

  for (const b of buildings) {
    const { x1, y1, x2, y2 } = b.rect;
    const tw = x2 - x1 + 1;
    const th = y2 - y1 + 1;
    if (tw < 2 || th < 2) continue;
    const X1 = x1 * TILE;
    const Y1 = y1 * TILE;
    const W = tw * TILE;
    const H = th * TILE;
    const X2 = X1 + W;
    const Y2 = Y1 + H;
    const salt = hash(x1, y1);
    const stories = cubicStories(b.kind, b.env, salt);
    const southH = cubicSouthPx(stories);
    const eastW = Math.round(southH * 0.42);
    const wall = mix(accent, 0.18, 0x121a28);
    const wallLit = mix(accent, 0.34, 0x1c2838);
    const wallDark = mix(accent, 0.08, 0x070b14);
    const rim = mix(accent, 0.7, 0x3a5068);

    // Ground shadow (south-east), scaled with height — the cube's contact with the street.
    shadow.fillStyle(0x000000, 0.34 + stories * 0.03);
    shadow.fillRect(X1 + 4, Y2, W - 2, Math.min(18, 6 + stories * 2));
    shadow.fillRect(X2, Y1 + 6, Math.min(14, 4 + eastW), H - 4);
    shadow.fillStyle(0x000000, 0.16);
    shadow.fillRect(X2, Y2, Math.min(14, 4 + eastW), Math.min(14, 5 + stories));

    // East cube face (right wall).
    g.fillStyle(wallDark, 0.92).fillRect(X2 - eastW, Y1 + 2, eastW, H - 2);
    g.fillStyle(0x000000, 0.22).fillRect(X2 - 2, Y1 + 2, 2, H - 2);
    g.fillStyle(rim, 0.35).fillRect(X2 - eastW, Y1 + 2, 1, H - 2);

    // South cube face (front wall). Door cut so the enter tile stays readable.
    const faceY = Y2 - southH;
    g.fillStyle(wall, 0.94).fillRect(X1, faceY, W, southH);
    g.fillStyle(wallLit, 0.55).fillRect(X1, faceY, W, 2);
    g.fillStyle(0x000000, 0.35).fillRect(X1, Y2 - 2, W, 2);

    // Window grid — storeys × bays. Reads as inhabited cubes, not a flat slab.
    const bays = Math.max(2, Math.min(8, tw - 1));
    const bayW = (W - 8) / bays;
    const rows = Math.max(1, stories - 1);
    const rowH = (southH - 8) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < bays; c++) {
        const lit = ((salt >> (r * 3 + c)) & 3) !== 0;
        const wx = X1 + 5 + c * bayW;
        const wy = faceY + 5 + r * rowH;
        const ww = Math.max(3, bayW - 5);
        const wh = Math.max(2, rowH - 4);
        g.fillStyle(lit ? 0xffe2b0 : 0x0b1018, lit ? 0.42 : 0.55).fillRect(wx, wy, ww, wh);
        if (lit) g.fillStyle(accent, 0.16).fillRect(wx, wy, ww, 1);
      }
    }

    if (b.door) {
      const dx = b.door[0] * TILE;
      const gap = TILE + 6;
      g.fillStyle(0x05070d, 0.85).fillRect(dx - 3, Y2 - Math.min(southH, TILE + 4), gap, Math.min(southH, TILE + 4));
      g.fillStyle(accent, 0.55).fillRect(dx - 3, Y2 - 3, gap, 2);
    }

    if (!b.hfCovered) {
      // Receding roof — shifted north so the south face is the cube's front.
      const inset = 3;
      const lift = Math.min(10, 2 + stories);
      g.fillStyle(0x1a2433, 0.55).fillRect(X1 + inset, Y1 + inset - lift, W - inset * 2 - eastW * 0.3, H - southH - inset);
      g.fillStyle(accent, 0.22).fillRect(X1 + inset, Y1 + inset - lift, W - inset * 2 - eastW * 0.3, 2);
      g.fillStyle(rim, 0.4).fillRect(X1 + inset, Y1 + inset - lift, W - inset * 2 - eastW * 0.3, 1);
    }
  }

  return g;
}

/** Opening-town civic square: cubic monument + planter cubes so spawn is not a flat pad. */
export function paintCivicPlazaCubes(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  accent = 0x39ff88,
  depth = 3.4,
): void {
  const g = scene.add.graphics().setDepth(depth);
  const px = (tx: number, ty: number) => ({ x: tx * TILE, y: ty * TILE });

  const monument = px(cx - 1, cy - 3);
  const mw = TILE * 3;
  const mh = TILE * 2;
  const wallH = 18;
  g.fillStyle(0x000000, 0.35).fillRect(monument.x + 4, monument.y + mh, mw, 10);
  g.fillStyle(0x1a2430, 0.95).fillRect(monument.x, monument.y + mh - wallH, mw, wallH);
  g.fillStyle(0x2a3a4c, 0.9).fillRect(monument.x + 3, monument.y - 6, mw - 10, mh - wallH + 6);
  g.fillStyle(accent, 0.55).fillRect(monument.x + 3, monument.y - 6, mw - 10, 2);
  g.fillStyle(0xffe2b0, 0.35).fillRect(monument.x + 8, monument.y + mh - wallH + 4, 5, 4);
  g.fillStyle(0xffe2b0, 0.28).fillRect(monument.x + 20, monument.y + mh - wallH + 8, 5, 4);
  g.fillStyle(accent, 0.4).fillRect(monument.x + mw / 2 - 2, monument.y - 14, 4, 10);

  const planters: Array<[number, number]> = [
    [cx - 4, cy - 3],
    [cx + 4, cy - 3],
    [cx - 4, cy + 3],
    [cx + 4, cy + 3],
  ];
  for (const [tx, ty] of planters) {
    const p = px(tx, ty);
    const w = TILE * 2;
    const h = TILE;
    const zh = 8;
    g.fillStyle(0x000000, 0.28).fillRect(p.x + 2, p.y + h, w, 6);
    g.fillStyle(0x1a2a22, 0.95).fillRect(p.x, p.y + h - zh, w, zh);
    g.fillStyle(0x2e5a38, 0.9).fillRect(p.x + 2, p.y - 3, w - 4, h - zh + 3);
    g.fillStyle(accent, 0.25).fillRect(p.x + 2, p.y - 3, w - 4, 1);
  }
}
