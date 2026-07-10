// METROPHAGE — vector furniture. Each catalogue kind draws as a real little object
// (mattress + pillow, potted fronds, glowing jukebox arch…) instead of a lettered
// rectangle, so a furnished home reads as a ROOM at a glance. Pure Phaser Graphics —
// no textures, no assets, ~6 ops a piece; the piece's catalogue colour stays the accent
// so the palette → placed-object mapping players learned survives the art upgrade.

import type Phaser from "phaser";

type G = Phaser.GameObjects.Graphics;

const DARK = 0x0c1020; // chassis/base tone shared by every piece
const LIGHT = 0xeaf2ff; // highlight tone (sheets, screens, glints)

function shade(c: number, f: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 0xff) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 0xff) * f));
  const b = Math.min(255, Math.round((c & 0xff) * f));
  return (r << 16) | (g << 8) | b;
}

/** Draw one furniture piece into `g`, filling the w×h box at (x,y). Returns false when
 *  the kind has no authored art (caller falls back to the glyph card). */
export function drawFurniture(g: G, id: string, color: number, x: number, y: number, w: number, h: number): boolean {
  const cx = x + w / 2;
  const dim = shade(color, 0.55);
  // soft contact shadow so pieces sit ON the floor instead of floating
  g.fillStyle(0x000000, 0.28).fillEllipse(cx, y + h - 3, w * 0.82, 6);
  switch (id) {
    case "bed": {
      g.fillStyle(DARK, 1).fillRoundedRect(x + 2, y + 4, w - 4, h - 8, 3); // frame
      g.fillStyle(dim, 1).fillRoundedRect(x + 4, y + 6, w - 8, h - 12, 3); // blanket
      g.fillStyle(color, 0.9).fillRect(x + 4, y + h - 10, w - 8, 3); // blanket trim
      g.fillStyle(LIGHT, 0.95).fillRoundedRect(x + 6, y + 7, 12, 8, 2); // pillow
      return true;
    }
    case "sofa": {
      g.fillStyle(dim, 1).fillRoundedRect(x + 2, y + 6, w - 4, h - 12, 4); // back
      g.fillStyle(color, 0.85).fillRoundedRect(x + 5, y + h / 2 - 2, w - 10, h / 2 - 4, 3); // seat
      g.fillStyle(dim, 1).fillRoundedRect(x + 2, y + h / 2 - 4, 5, h / 2, 2); // arms
      g.fillStyle(dim, 1).fillRoundedRect(x + w - 7, y + h / 2 - 4, 5, h / 2, 2);
      return true;
    }
    case "table": {
      g.fillStyle(DARK, 1).fillRect(x + 7, y + h - 12, 3, 8).fillRect(x + w - 10, y + h - 12, 3, 8); // legs
      g.fillStyle(shade(color, 0.8), 1).fillRoundedRect(x + 3, y + 8, w - 6, 7, 2); // top
      g.fillStyle(LIGHT, 0.25).fillRect(x + 5, y + 9, w - 10, 2); // sheen
      return true;
    }
    case "chair": {
      g.fillStyle(dim, 1).fillRoundedRect(x + 8, y + 5, w - 16, 6, 2); // backrest
      g.fillStyle(color, 0.85).fillRoundedRect(x + 7, y + 13, w - 14, 6, 2); // seat
      g.fillStyle(DARK, 1).fillRect(x + 9, y + 19, 2, 7).fillRect(x + w - 11, y + 19, 2, 7); // legs
      return true;
    }
    case "rug": {
      g.fillStyle(shade(color, 0.6), 0.9).fillRoundedRect(x + 2, y + 3, w - 4, h - 6, 4);
      g.lineStyle(1.5, color, 0.8).strokeRoundedRect(x + 5, y + 6, w - 10, h - 12, 3);
      g.lineStyle(1, shade(color, 1.25), 0.5).strokeRoundedRect(x + 9, y + 10, w - 18, h - 20, 2);
      return true;
    }
    case "plant": {
      g.fillStyle(0x7a4a2a, 1).fillRoundedRect(x + 10, y + h - 12, w - 20, 8, 2); // pot
      g.fillStyle(shade(color, 0.7), 1).fillEllipse(cx - 5, y + 12, 8, 12); // fronds
      g.fillStyle(color, 0.9).fillEllipse(cx + 4, y + 10, 8, 14);
      g.fillStyle(shade(color, 1.2), 0.9).fillEllipse(cx, y + 8, 5, 10);
      return true;
    }
    case "lamp": {
      g.fillStyle(DARK, 1).fillRect(cx - 1, y + 10, 2, h - 18); // pole
      g.fillStyle(DARK, 1).fillRoundedRect(cx - 5, y + h - 8, 10, 4, 2); // base
      g.fillStyle(color, 0.9).fillTriangle(cx - 7, y + 11, cx + 7, y + 11, cx, y + 3); // shade
      g.fillStyle(color, 0.25).fillCircle(cx, y + 13, 8); // glow pool
      return true;
    }
    case "shelf":
    case "bookcase": {
      g.fillStyle(DARK, 1).fillRoundedRect(x + 4, y + 3, w - 8, h - 8, 2);
      const rows = id === "bookcase" ? 3 : 2;
      for (let r = 0; r < rows; r++) {
        const sy = y + 6 + r * ((h - 14) / rows);
        g.fillStyle(shade(color, 0.5), 1).fillRect(x + 6, sy + (h - 14) / rows - 2, w - 12, 2); // shelf board
        // little book spines in varied tints
        for (let b = 0; b < 3; b++) {
          g.fillStyle(shade(color, 0.7 + b * 0.25), 1).fillRect(x + 7 + b * 5, sy, 3, (h - 14) / rows - 3);
        }
      }
      return true;
    }
    case "locker": {
      g.fillStyle(dim, 1).fillRoundedRect(x + 6, y + 2, w - 12, h - 6, 2);
      g.lineStyle(1, DARK, 0.9).strokeRoundedRect(x + 6, y + 2, w - 12, h - 6, 2);
      for (let s = 0; s < 3; s++) g.fillStyle(DARK, 0.8).fillRect(x + 9, y + 5 + s * 3, w - 18, 1); // vents
      g.fillStyle(LIGHT, 0.9).fillRect(x + w - 11, y + h / 2, 2, 4); // handle
      return true;
    }
    case "terminal": {
      g.fillStyle(DARK, 1).fillRect(cx - 2, y + h - 12, 4, 6); // stand
      g.fillStyle(DARK, 1).fillRoundedRect(x + 4, y + 4, w - 8, h - 16, 2); // monitor
      g.fillStyle(shade(color, 0.45), 1).fillRect(x + 6, y + 6, w - 12, h - 20); // screen
      g.fillStyle(color, 0.9).fillRect(x + 7, y + 8, w - 16, 1).fillRect(x + 7, y + 11, w - 20, 1).fillRect(x + 7, y + 14, w - 14, 1); // code lines
      return true;
    }
    case "poster": {
      g.fillStyle(DARK, 1).fillRoundedRect(x + 6, y + 4, w - 12, h - 10, 1);
      g.fillStyle(shade(color, 0.5), 1).fillRect(x + 8, y + 6, w - 16, h - 14);
      g.fillStyle(color, 0.9).fillRect(x + 8, y + 8, w - 16, 3); // banner stripe
      g.fillStyle(LIGHT, 0.7).fillRect(x + 10, y + 14, w - 22, 1).fillRect(x + 10, y + 17, w - 26, 1); // fine print
      return true;
    }
    case "crate": {
      g.fillStyle(shade(color, 0.55), 1).fillRect(x + 4, y + 5, w - 8, h - 10);
      g.lineStyle(1.5, DARK, 0.9).strokeRect(x + 4, y + 5, w - 8, h - 10);
      g.lineStyle(1.5, DARK, 0.7).lineBetween(x + 4, y + 5, x + w - 4, y + h - 5).lineBetween(x + w - 4, y + 5, x + 4, y + h - 5); // X brace
      return true;
    }
    case "holo_tv": {
      g.fillStyle(DARK, 1).fillRect(cx - 6, y + h - 10, 12, 4); // stand
      g.fillStyle(DARK, 1).fillRoundedRect(x + 3, y + 3, w - 6, h - 13, 2); // bezel
      g.fillStyle(shade(color, 0.4), 0.95).fillRect(x + 5, y + 5, w - 10, h - 17); // screen
      g.fillStyle(color, 0.55).fillRect(x + 5, y + 7, w - 10, 2); // broadcast band
      g.fillStyle(LIGHT, 0.35).fillTriangle(x + 8, y + 6, x + 14, y + 6, x + 8, y + 12); // glare
      return true;
    }
    case "bar_counter": {
      g.fillStyle(dim, 1).fillRect(x + 2, y + 10, w - 4, h - 16); // front panel
      g.fillStyle(shade(color, 0.9), 1).fillRoundedRect(x + 1, y + 7, w - 2, 6, 2); // counter top
      g.fillStyle(LIGHT, 0.8).fillRect(x + 8, y + 2, 2, 6); // bottles on top
      g.fillStyle(color, 0.8).fillRect(x + 14, y + 1, 2, 7).fillRect(x + w - 12, y + 3, 2, 5);
      return true;
    }
    case "desk": {
      g.fillStyle(DARK, 1).fillRect(x + 5, y + h - 12, 3, 8).fillRect(x + w - 9, y + h - 12, 3, 8); // legs
      g.fillStyle(shade(color, 0.75), 1).fillRoundedRect(x + 2, y + 9, w - 4, 6, 2); // top
      g.fillStyle(DARK, 1).fillRect(x + 8, y + 2, 10, 8); // little monitor
      g.fillStyle(color, 0.8).fillRect(x + 9, y + 3, 8, 5);
      return true;
    }
    case "aquarium": {
      g.fillStyle(DARK, 1).fillRoundedRect(x + 2, y + 4, w - 4, h - 9, 2); // tank frame
      g.fillStyle(shade(color, 0.5), 0.9).fillRect(x + 4, y + 6, w - 8, h - 14); // water
      g.fillStyle(LIGHT, 0.5).fillRect(x + 4, y + 6, w - 8, 2); // surface
      g.fillStyle(0xffb13c, 1).fillTriangle(x + 10, y + 13, x + 15, y + 11, x + 10, y + 9); // fish
      g.fillStyle(0xff5ad0, 1).fillTriangle(x + w - 10, y + 17, x + w - 15, y + 15, x + w - 10, y + 13);
      g.fillStyle(LIGHT, 0.55).fillCircle(x + w - 20, y + 9, 1).fillCircle(x + 18, y + 8, 1); // bubbles
      return true;
    }
    case "neon_sign": {
      g.fillStyle(DARK, 0.95).fillRoundedRect(x + 4, y + 5, w - 8, h - 12, 3);
      g.lineStyle(2, color, 0.95).strokeRoundedRect(x + 6, y + 7, w - 12, h - 16, 3); // neon tube
      g.lineStyle(1.5, shade(color, 1.3), 0.9)
        .beginPath()
        .moveTo(x + 9, y + h - 11)
        .lineTo(x + 13, y + 10)
        .lineTo(x + 17, y + h - 11)
        .strokePath(); // zigzag glyph
      g.fillStyle(color, 0.2).fillCircle(cx, y + h / 2 - 2, w * 0.45); // spill glow
      return true;
    }
    case "arcade": {
      g.fillStyle(dim, 1).fillRoundedRect(x + 5, y + 2, w - 10, h - 6, 2); // cabinet
      g.fillStyle(shade(color, 0.45), 1).fillRect(x + 8, y + 5, w - 16, 8); // screen
      g.fillStyle(color, 0.9).fillRect(x + 9, y + 7, 3, 2).fillRect(x + 14, y + 9, 3, 2); // sprites
      g.fillStyle(0xff3b6b, 1).fillCircle(x + 10, y + h - 9, 1.6); // buttons
      g.fillStyle(0x39ff88, 1).fillCircle(x + 15, y + h - 9, 1.6);
      return true;
    }
    case "jukebox": {
      g.fillStyle(dim, 1).fillRoundedRect(x + 6, y + 4, w - 12, h - 8, 6); // arch body
      g.lineStyle(2, color, 0.9).strokeRoundedRect(x + 8, y + 6, w - 16, h - 12, 5); // lit arch
      g.fillStyle(shade(color, 0.5), 1).fillRect(x + 10, y + h - 12, w - 20, 5); // grille
      g.fillStyle(LIGHT, 0.8).fillCircle(cx, y + 10, 2); // record window
      return true;
    }
    case "vending": {
      g.fillStyle(dim, 1).fillRoundedRect(x + 6, y + 2, w - 12, h - 6, 2);
      g.fillStyle(shade(color, 0.45), 1).fillRect(x + 8, y + 4, w - 20, h - 14); // window
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 2; c++) g.fillStyle(shade(color, 1 + r * 0.15), 0.9).fillRect(x + 10 + c * 5, y + 6 + r * 5, 3, 3); // cans
      g.fillStyle(DARK, 1).fillRect(x + w - 11, y + 6, 3, 8); // coin slot column
      return true;
    }
    case "weapon_rack": {
      g.fillStyle(DARK, 1).fillRoundedRect(x + 4, y + 3, w - 8, h - 8, 2); // board
      g.lineStyle(1, shade(color, 0.6), 0.8).strokeRoundedRect(x + 4, y + 3, w - 8, h - 8, 2);
      g.fillStyle(color, 0.9).fillRect(x + 7, y + 8, w - 14, 2); // rifle silhouette
      g.fillStyle(color, 0.9).fillRect(x + 9, y + 10, 3, 4); // grip
      g.fillStyle(shade(color, 0.7), 0.9).fillRect(x + 7, y + 16, w - 18, 2); // second piece
      return true;
    }
    case "trophy": {
      g.fillStyle(DARK, 1).fillRoundedRect(x + 6, y + 4, w - 12, h - 9, 2); // case
      g.fillStyle(shade(color, 0.35), 0.6).fillRect(x + 8, y + 6, w - 16, h - 14); // glass
      g.fillStyle(color, 1).fillRect(cx - 3, y + 10, 6, 5); // cup body
      g.fillStyle(color, 1).fillRect(cx - 5, y + 9, 10, 2); // cup rim
      g.fillStyle(color, 1).fillRect(cx - 1, y + 15, 2, 3); // stem
      g.fillStyle(LIGHT, 0.9).fillCircle(cx + 4, y + 8, 1); // glint
      return true;
    }
    case "server_rack": {
      g.fillStyle(dim, 1).fillRoundedRect(x + 6, y + 2, w - 12, h - 6, 2);
      for (let r = 0; r < 4; r++) {
        const sy = y + 5 + r * 5;
        g.fillStyle(DARK, 1).fillRect(x + 8, sy, w - 16, 3);
        g.fillStyle(r % 2 ? 0x39ff88 : color, 1).fillCircle(x + 11, sy + 1.5, 1); // LEDs
        g.fillStyle(0xffb13c, 0.9).fillCircle(x + 15, sy + 1.5, 1);
      }
      return true;
    }
  }
  return false;
}
