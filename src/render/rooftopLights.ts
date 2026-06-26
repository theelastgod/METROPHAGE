import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";
import { TILE } from "../config";
import { getSettings } from "../systems/Settings";
import type { Rect } from "../game/districts";

/**
 * Rooftop lights — sparse emissive accents on the building masses so the skyline reads as
 * inhabited and lit (matching the now-lit wet streets). Shared by CityScene (offline hub) and
 * OnlineScene (the unified world). The procedural roofs baked in beacons/billboards; the
 * photographed real-art tiles lost them, and `shadeWalls` deliberately mutes the roofs to a
 * clean dark mass — so we add only a *few* glints per building: a pulsing corner beacon
 * (aircraft-warning style) + an occasional neon roof-sign wash, both blooming through the
 * neon post-FX. Depth 3: on the roof (above the wall-shade at 2.5 / streets at 2), below props.
 *
 * `accentFor(b)` supplies each building's neon colour (per-district in the city, the zone
 * accent online). Photosensitivity-safe: the slow corner-beacon pulse is skipped entirely
 * when reduce-flashing is on (the light just sits steady).
 */
const RED_WARN = 0xff3344;
const WARM = 0xffb86a;

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
    const w = b.x2 - b.x1 + 1, h = b.y2 - b.y1 + 1;
    if (w < 1 || h < 1) continue;
    const hh = hash(b.x1 * 7 + 1, b.y1 * 7 + 1);
    const accent = accentFor(item);

    // corner beacon (top-right of the roof) — mostly the district accent, some red warning lamps
    const bx = (b.x2 + 1) * TILE - 5, by = b.y1 * TILE + 5;
    const col = (hh & 3) === 0 ? RED_WARN : accent;
    const beacon = glow(bx, by, col, 0.58, 0.62);
    glow(bx, by, 0xffffff, 0.18, 0.92); // hot core
    if (!reduce)
      scene.tweens.add({ targets: beacon, alpha: 0.12, scale: 0.72, duration: 850 + (hh % 1100), yoyo: true, repeat: -1, ease: "Sine.inOut" });

    // bigger buildings: a faint neon roof-sign wash + a warm service light on the far corner
    if (w >= 4 && h >= 3) {
      glow((b.x1 + w * 0.5) * TILE, (b.y1 + h * 0.42) * TILE, accent, 1.25 + (hh % 6) / 10, 0.14);
      if (((hh >> 5) & 1) === 1) glow(b.x1 * TILE + 5, (b.y2 + 1) * TILE - 5, WARM, 0.4, 0.4);
    }
  }
}
