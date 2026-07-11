import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";
import { TILE } from "../config";
import { getSettings } from "../systems/Settings";
import type { Rect } from "../game/districts";

/**
 * Rooftop lights — sparse emissive accents on the building masses so the skyline reads as
 * inhabited and lit. Adds corner beacons, neon roof-sign washes, window grids on large roofs,
 * and occasional HVAC/service lights. Depth 3: above wall-shade, below props.
 */
const RED_WARN = 0xff3344;
const WARM = 0xffb86a;
const WINDOW_WARM = 0xffe8c8;
const WINDOW_COOL = 0x9fe8ff;

export function paintRooftopLights<T>(
  scene: Phaser.Scene,
  buildings: T[],
  rectOf: (item: T) => Rect,
  accentFor: (item: T) => number,
  depth = 3,
): void {
  const reduce = getSettings().reduceFlashing;
  const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
  const glow = (x: number, y: number, col: number, s: number, a: number) =>
    scene.add.image(x, y, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(col).setDepth(depth).setScale(s).setAlpha(a);

  for (const item of buildings) {
    const b = rectOf(item);
    const w = b.x2 - b.x1 + 1;
    const h = b.y2 - b.y1 + 1;
    if (w < 1 || h < 1) continue;
    const hh = hash(b.x1 * 7 + 1, b.y1 * 7 + 1);
    const accent = accentFor(item);

    // window grid across the roof mass (large buildings only)
    if (w >= 3 && h >= 2) {
      const wg = scene.add.graphics().setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
      for (let ry = b.y1 + 1; ry <= b.y2 - 1; ry++) {
        for (let rx = b.x1 + 1; rx <= b.x2 - 1; rx++) {
          const wh = hash(rx * 3, ry * 5);
          if ((wh & 5) !== 0) continue;
          const lit = (wh & 8) === 0;
          if (!lit) continue;
          const wx = rx * TILE + 8 + (wh % 14);
          const wy = ry * TILE + 6 + ((wh >> 4) % 12);
          const col = (wh & 3) === 0 ? WINDOW_WARM : (wh & 3) === 1 ? WINDOW_COOL : accent;
          wg.fillStyle(col, 0.2 + (wh % 5) * 0.04).fillRect(wx, wy, 2, 2);
          if ((wh & 7) === 0) wg.fillStyle(0xffffff, 0.35).fillRect(wx, wy, 1, 1);
        }
      }
    }

    // corner beacon (top-right of the roof)
    const bx = (b.x2 + 1) * TILE - 5;
    const by = b.y1 * TILE + 5;
    const col = (hh & 3) === 0 ? RED_WARN : accent;
    const beacon = glow(bx, by, col, 0.62, 0.68);
    glow(bx, by, 0xffffff, 0.2, 0.95);
    if (!reduce)
      scene.tweens.add({
        targets: beacon,
        alpha: 0.14,
        scale: 0.74,
        duration: 850 + (hh % 1100),
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });

    // bigger buildings: neon roof-sign wash + warm service corner + AC unit dot
    if (w >= 4 && h >= 3) {
      glow((b.x1 + w * 0.5) * TILE, (b.y1 + h * 0.42) * TILE, accent, 1.35 + (hh % 6) / 10, 0.16);
      if (((hh >> 5) & 1) === 1) glow(b.x1 * TILE + 5, (b.y2 + 1) * TILE - 5, WARM, 0.45, 0.44);
      if (((hh >> 6) & 1) === 1) {
        const ax = (b.x2 + 1) * TILE - 12;
        const ay = (b.y1 + 1) * TILE + 8;
        scene.add.rectangle(ax, ay, 6, 4, 0x2a3142, 0.85).setDepth(depth);
        glow(ax, ay, accent, 0.22, 0.5);
      }
    }
  }
}