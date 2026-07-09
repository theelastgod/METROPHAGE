import Phaser from "phaser";
import { TILE } from "../config";
import type { WildernessBiome } from "../game/bridges";
import {
  GLOW_KEY,
  DECO_KEYS,
  PROP_CAR_KEY,
  PROP_TAXI_KEY,
  PROP_BARRIER_KEY,
  PROP_BIN_KEY,
  PROP_HYDRANT_KEY,
  PROP_PLANTER_KEY,
} from "../assets/manifest";
import { isWall, TILE_DIRT, TILE_GRASS, TILE_WATER, TILE_NEON, TILE_LANE, type TileGrid } from "../world/district";

const hash = (x: number, y: number, salt = 0) => ((x * 73856093) ^ (y * 19349663) ^ salt) >>> 0;

/** Per-biome scatter rates — lower divisor = more frequent prop. */
type ScatterProfile = {
  salvage: number;
  barrel: number;
  tree: number;
  rubble: number;
  wreck: number;
  barrier: number;
  planter: number;
  wreckTint: number;
  salvageGlow: number;
  salt: number;
};

const SCATTER: Record<WildernessBiome, ScatterProfile> = {
  ruined_urban: {
    salvage: 43, barrel: 0, tree: 0, rubble: 21, wreck: 58, barrier: 97,
    planter: 0, wreckTint: 0x6a7088, salvageGlow: 0xf7ff3c, salt: 101,
  },
  industrial_cut: {
    salvage: 41, barrel: 49, tree: 0, rubble: 19, wreck: 67, barrier: 83,
    planter: 0, wreckTint: 0x7a8a70, salvageGlow: 0x9dff3c, salt: 202,
  },
  floodplain: {
    salvage: 51, barrel: 47, tree: 27, rubble: 29, wreck: 0, barrier: 0,
    planter: 61, wreckTint: 0x888898, salvageGlow: 0x29e7ff, salt: 303,
  },
  undercity: {
    salvage: 45, barrel: 55, tree: 0, rubble: 23, wreck: 73, barrier: 91,
    planter: 0, wreckTint: 0x9080b8, salvageGlow: 0xb06bff, salt: 404,
  },
  debris_field: {
    salvage: 37, barrel: 59, tree: 0, rubble: 17, wreck: 53, barrier: 71,
    planter: 0, wreckTint: 0xff9a50, salvageGlow: 0xff7a18, salt: 505,
  },
  ash_wastes: {
    salvage: 49, barrel: 57, tree: 67, rubble: 25, wreck: 79, barrier: 0,
    planter: 0, wreckTint: 0xaa8860, salvageGlow: 0xf7a23c, salt: 606,
  },
  meltdown: {
    salvage: 39, barrel: 43, tree: 0, rubble: 15, wreck: 47, barrier: 59,
    planter: 0, wreckTint: 0xcc5566, salvageGlow: 0xff3b6b, salt: 707,
  },
};

function groundShadow(scene: Phaser.Scene, x: number, y: number, depth: number, rw: number, rh: number) {
  scene.add
    .image(x, y, GLOW_KEY)
    .setTint(0x020408)
    .setAlpha(0.35)
    .setScale(rw, rh)
    .setDepth(depth - 0.2);
}

function placeProp(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
  depth: number,
  scale: number,
  originY = 0.82,
  alpha = 0.92,
): Phaser.GameObjects.Image | null {
  if (!scene.textures.exists(key)) return null;
  groundShadow(scene, x, y + 8, depth, scale * 0.65, 0.22);
  return scene.add.image(x, y, key).setOrigin(0.5, originY).setDepth(depth).setScale(scale).setAlpha(alpha);
}

/**
 * Scatter wilderness décor — biome-tuned prop mix on each corridor's trail and clearings.
 * Deterministic per tile; only on open ground away from walls.
 */
export function scatterWildernessProps(
  scene: Phaser.Scene,
  grid: TileGrid,
  accent: number,
  depth = 5,
  biome: WildernessBiome = "ruined_urban",
) {
  const profile = SCATTER[biome];
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  const container = scene.add.container(0, 0).setDepth(depth);
  const g = scene.add.graphics().setDepth(depth);

  for (let ty = 2; ty < H - 2; ty++) {
    const row = grid[ty];
    for (let tx = 2; tx < W - 2; tx++) {
      const t = row[tx];
      if (isWall(t) || t === TILE_WATER) continue;
      const h = hash(tx, ty, profile.salt);
      // declutter: thin the overall junk field (~60% fewer props) so trails and
      // clearings read clean instead of wall-to-wall salvage. Deterministic per tile.
      if (hash(tx, ty, 9973) % 5 < 3) continue;
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;

      if (profile.salvage > 0 && h % profile.salvage === 0) {
        const decoKey = DECO_KEYS[(h >>> 4) % DECO_KEYS.length];
        const scale = 0.68 + ((h >>> 8) % 20) / 100;
        scene.add
          .image(x, y - 4, GLOW_KEY)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(profile.salvageGlow)
          .setAlpha(0.22)
          .setScale(0.9)
          .setDepth(depth - 0.1);
        const spr = placeProp(scene, decoKey, x, y + 4, depth, scale, 0.84, 0.94);
        if (spr) container.add(spr);
        else {
          g.fillStyle(0x3a3020, 0.9).fillRect(x - 7, y - 2, 14, 10);
          g.lineStyle(1, profile.salvageGlow, 0.5).strokeRect(x - 7, y - 2, 14, 10);
        }
        continue;
      }

      if (profile.barrel > 0 && h % profile.barrel === 0 && (t === TILE_DIRT || t === TILE_NEON || t === TILE_LANE)) {
        if (scene.textures.exists(PROP_BIN_KEY)) {
          const spr = placeProp(scene, PROP_BIN_KEY, x, y + 2, depth, 0.7, 0.88, 0.9);
          if (spr) {
            spr.setTint(biome === "floodplain" ? 0x29e7ff : biome === "meltdown" ? 0xff5566 : 0x9dff88);
            container.add(spr);
          }
        } else {
          g.fillStyle(0x1a2818, 1).fillRect(x - 5, y - 2, 10, 12);
          g.fillStyle(0x9dff3c, 0.7).fillRect(x - 3, y, 6, 4);
        }
        scene.add
          .image(x, y - 8, GLOW_KEY)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(accent)
          .setAlpha(0.12)
          .setScale(0.6)
          .setDepth(depth - 0.1);
        continue;
      }

      if (profile.tree > 0 && h % profile.tree === 0 && t === TILE_GRASS) {
        g.fillStyle(0x2a1d14, 1).fillRect(x - 2, y - 6, 4, 10);
        g.fillStyle(0x3a2a1a, 0.8).fillRect(x - 6, y - 10, 12, 4);
        if (biome === "floodplain" && h % 2 === 0) {
          g.fillStyle(0x1a3040, 0.5).fillEllipse(x, y + 4, 10, 4);
        }
        continue;
      }

      if (profile.planter > 0 && h % profile.planter === 0 && t === TILE_GRASS && scene.textures.exists(PROP_PLANTER_KEY)) {
        const spr = placeProp(scene, PROP_PLANTER_KEY, x, y + 2, depth, 0.72, 0.85, 0.88);
        if (spr) container.add(spr);
        continue;
      }

      if (profile.rubble > 0 && h % profile.rubble === 0) {
        const rubbleKey = DECO_KEYS[(h >>> 6) % DECO_KEYS.length];
        const scale = 0.42 + ((h >>> 10) % 12) / 100;
        const spr = placeProp(scene, rubbleKey, x, y + 3, depth, scale, 0.9, 0.78);
        if (spr) container.add(spr);
        else {
          const c = h % 3 === 0 ? 0x4a4a58 : 0x353545;
          g.fillStyle(c, 0.85).fillRect(x - 8, y, 6, 5);
          g.fillStyle(c, 0.7).fillRect(x - 2, y - 2, 8, 6);
          g.fillStyle(c, 0.6).fillRect(x + 4, y + 1, 5, 4);
        }
        continue;
      }

      if (profile.wreck > 0 && h % profile.wreck === 0 && (t === TILE_DIRT || t === TILE_LANE || t === TILE_NEON)) {
        const carKey = h % 3 === 0 && scene.textures.exists(PROP_TAXI_KEY) ? PROP_TAXI_KEY : PROP_CAR_KEY;
        const spr = placeProp(scene, carKey, x, y, depth, 0.82, 0.55, 0.88);
        if (spr) {
          spr.setTint(profile.wreckTint);
          container.add(spr);
        } else {
          g.fillStyle(0x1a1020, 0.9).fillRect(x - 12, y - 2, 24, 8);
          g.fillStyle(accent, 0.25).fillRect(x - 8, y - 4, 10, 4);
          groundShadow(scene, x, y + 6, depth, 1.2, 0.35);
        }
        continue;
      }

      if (profile.barrier > 0 && h % profile.barrier === 0) {
        const barrier = placeProp(scene, PROP_BARRIER_KEY, x, y + 2, depth, 0.74, 0.86, 0.9);
        if (barrier) {
          container.add(barrier);
          scene.add
            .image(x, y - 6, GLOW_KEY)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(accent)
            .setAlpha(0.18)
            .setScale(0.55)
            .setDepth(depth - 0.1);
        } else if (h % 97 === 0 && scene.textures.exists(PROP_HYDRANT_KEY)) {
          const hyd = placeProp(scene, PROP_HYDRANT_KEY, x, y + 4, depth, 0.68, 0.9, 0.9);
          if (hyd) container.add(hyd);
        } else {
          scene.add
            .image(x, y - 6, GLOW_KEY)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(accent)
            .setAlpha(0.18)
            .setScale(0.55)
            .setDepth(depth - 0.1);
          g.lineStyle(2, accent, 0.45).strokeRect(x - 6, y - 6, 12, 12);
        }
      }
    }
  }

  container.add(g);
  return container;
}