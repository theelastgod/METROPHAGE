import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";
import { TILE, TILESET_PX } from "../config";
import { effectiveLowFx } from "../systems/Settings";
import {
  isWall,
  TILE_LANE,
  TILE_PLAZA,
  TILE_CROSSWALK,
  TILE_NEON,
  TILE_SIDEWALK,
  TILE_MARKET,
  TILE_GRATE,
  TILE_DIRT,
  TILE_FLOOR,
  type TileGrid,
} from "../world/district";

/**
 * Rain-slicked street lighting — shared by the offline city hub (CityScene) and the unified
 * server-authoritative world (OnlineScene), so both render the same wet neon-noir pavement.
 *
 * Performance: static lamp pools + reflections are batched into Graphics layers (not one
 * Image per streetlamp). Only a capped handful of lamps get live flicker tweens.
 */
const WARM = 0xffb86a; // sodium street-lamp

const WET_SURFACES = new Set([
  TILE_FLOOR,
  TILE_LANE,
  TILE_PLAZA,
  TILE_CROSSWALK,
  TILE_NEON,
  TILE_SIDEWALK,
  TILE_MARKET,
  TILE_GRATE,
  TILE_DIRT,
]);

/** Map variant indices back to their canonical surface for puddle placement. */
function baseTile(index: number): number {
  if (index <= 17) return index;
  const rev: Record<number, number> = {
    18: 0, 19: 0, 20: 2, 21: 1, 22: 3, 23: 10, 24: 14,
    25: 4, 26: 7, 27: 8, 28: 9, 29: 15, 30: 16, 31: 11,
    32: 5, 33: 6, 34: 12, 35: 13, 36: 17, 37: 1, 38: 2, 39: 16,
  };
  return rev[index] ?? index;
}

export interface WetStreetsOpts {
  /** Large outdoor maps (city hub): skip the per-tile puddle pass and thin lamp tweens. */
  lightweight?: boolean;
}

export function paintWetStreets(
  scene: Phaser.Scene,
  grid: TileGrid,
  accentAt: (tx: number, ty: number) => number,
  depth = 2,
  opts: WetStreetsOpts = {},
): void {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  const wall = (x: number, y: number) => isWall(grid[y]?.[x]);
  const hash = (x: number, y: number) => ((x * 374761393) ^ (y * 668265263)) >>> 0;
  const lowFx = effectiveLowFx();
  const lightweight = opts.lightweight ?? false;
  const realArt = TILESET_PX > TILE;

  const lampG = scene.add.graphics().setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
  const reflectG = scene.add.graphics().setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);

  // Tile-aligned lamp grid (multiples of 4 tiles) — pools sit on coherent ground patches.
  const SPACING = lowFx || lightweight ? 8 : realArt ? 4 : 5;
  const ANIM_CAP = lowFx ? 8 : lightweight ? 10 : realArt ? 16 : 24;
  const poolAlpha = realArt ? 0.18 : 0.3;
  const reflectAlpha = realArt ? 0.1 : 0.16;
  let animCount = 0;

  for (let ty = 2; ty < H - 2; ty += SPACING) {
    for (let tx = 2; tx < W - 2; tx += SPACING) {
      const h = hash(tx, ty);
      const jx = tx + (h % 3) - 1;
      const jy = ty + ((h >> 3) % 3) - 1;
      if (wall(jx, jy)) continue;
      const col = (h & 1) === 0 ? WARM : accentAt(jx, jy);
      const x = jx * TILE + TILE / 2;
      const y = jy * TILE + TILE / 2;
      const poolR = 16 + (h % 6) * 2;
      lampG.fillStyle(col, poolAlpha).fillCircle(x, y, poolR);
      reflectG.fillStyle(col, reflectAlpha).fillEllipse(x, y + 10, poolR * 0.4, poolR * 0.95);

      if ((h & 3) === 0 && animCount < ANIM_CAP) {
        animCount++;
        const p = scene.add
          .image(x, y, GLOW_KEY)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(col)
          .setDepth(depth)
          .setScale(2.75 + (h % 8) / 10)
          .setAlpha(0.32);
        scene.tweens.add({
          targets: p,
          alpha: 0.1,
          scale: p.scale * 1.14,
          duration: 1700 + (h % 1400),
          yoyo: true,
          repeat: -1,
          ease: "Sine.inOut",
        });
      }
    }
  }

  if (!lightweight) {
    const puddleG = scene.add.graphics().setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
    const curbG = scene.add.graphics().setDepth(depth + 0.1);
    for (let ty = 1; ty < H - 1; ty++) {
      for (let tx = 1; tx < W - 1; tx++) {
        if (wall(tx, ty)) continue;
        const base = baseTile(grid[ty][tx]);
        const x = tx * TILE;
        const y = ty * TILE;
        const h = hash(tx, ty);
        const accent = accentAt(tx, ty);

        const puddleMask = realArt ? 23 : 11;
        if (WET_SURFACES.has(base) && (h & puddleMask) === 0) {
          const px = x + 6 + (h % 18);
          const py = y + 6 + ((h >> 5) % 18);
          const puddleA = realArt ? 0.05 : 0.08;
          puddleG.fillStyle(accent, puddleA).fillEllipse(px + 6, py + 4, 12, 7);
          puddleG.fillStyle(0xbfd0ff, realArt ? 0.1 : 0.14).fillEllipse(px + 5, py + 3, 5, 2);
          if (!realArt) puddleG.lineStyle(1, 0x9fe8ff, 0.22).strokeEllipse(px + 6, py + 4, 14, 8);
        }

        if (!wall(tx, ty + 1) && wall(tx, ty - 1)) {
          curbG.lineStyle(1, accent, 0.28).lineBetween(x + 2, y + 1, x + TILE - 2, y + 1);
        }
        if (!wall(tx + 1, ty) && wall(tx - 1, ty)) {
          curbG.lineStyle(1, accent, 0.22).lineBetween(x + 1, y + 2, x + 1, y + TILE - 2);
        }
      }
    }
  }

  const gl = scene.add.graphics().setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
  const glintCount = lowFx ? 80 : lightweight ? 90 : realArt ? 180 : 220;
  const GLINT = [0xbfd0ff, 0x9fe8ff, 0xffd9a8, 0xff9fe8];
  for (let i = 0; i < glintCount; i++) {
    const tx = 2 + Math.floor(hash(i * 7 + 1, i * 13 + 5) % Math.max(1, W - 4));
    const ty = 2 + Math.floor(hash(i * 17 + 3, i * 11 + 9) % Math.max(1, H - 4));
    if (wall(tx, ty)) continue;
    const c = GLINT[i % GLINT.length];
    const x = tx * TILE + 4 + (hash(tx, ty) % 24);
    const y = ty * TILE + 4 + ((hash(tx, ty) >> 5) % 24);
    gl.fillStyle(c, 0.55).fillRect(x, y, 1, 1);
    if (i % 3 === 0) {
      gl.fillStyle(c, 0.3).fillRect(x - 1, y, 3, 1).fillRect(x, y - 1, 1, 3);
    }
    if (i % 9 === 0) gl.fillStyle(0xffffff, 0.2).fillRect(x, y - 2, 1, 4);
  }
}