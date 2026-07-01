import Phaser from "phaser";
import { TILE } from "../config";
import {
  PROP_VENDING_KEY,
  PROP_STREETLIGHT_KEY,
  PROP_AC_KEY,
  PROP_BIN_KEY,
  PROP_HYDRANT_KEY,
  PROP_PLANTER_KEY,
  PROP_BARRIER_KEY,
  GLOW_KEY,
} from "../assets/manifest";
import { isWall, type TileGrid } from "../world/district";

const hash = (x: number, y: number) => ((x * 9283711) ^ (y * 6892871)) >>> 0;

type PropSpec = {
  key: string;
  originY: number;
  scale: number;
  yOff: number;
  glow?: boolean;
  /** Weight in the scatter pool — higher = more frequent. */
  weight: number;
};

const PROPS: PropSpec[] = [
  { key: PROP_STREETLIGHT_KEY, originY: 0.85, scale: 0.9, yOff: 4, glow: true, weight: 3 },
  { key: PROP_VENDING_KEY, originY: 0.82, scale: 0.84, yOff: 2, weight: 2 },
  { key: PROP_AC_KEY, originY: 0.78, scale: 0.8, yOff: 0, weight: 2 },
  { key: PROP_BIN_KEY, originY: 0.88, scale: 0.76, yOff: 3, weight: 2 },
  { key: PROP_HYDRANT_KEY, originY: 0.9, scale: 0.72, yOff: 4, weight: 1 },
  { key: PROP_PLANTER_KEY, originY: 0.82, scale: 0.78, yOff: 2, weight: 2 },
  { key: PROP_BARRIER_KEY, originY: 0.85, scale: 0.8, yOff: 2, weight: 1 },
];

const POOL = PROPS.flatMap((p) => Array.from({ length: p.weight }, () => p));

function groundShadow(scene: Phaser.Scene, x: number, y: number, depth: number, rw: number, rh: number) {
  scene.add
    .image(x, y, GLOW_KEY)
    .setTint(0x020408)
    .setAlpha(0.38)
    .setScale(rw, rh)
    .setDepth(depth - 0.2);
}

/**
 * Scatter world props for visual density — benches, vending, AC units, neon pools.
 * Deterministic per tile; only on walkable outdoor tiles away from walls.
 */
export function scatterWorldProps(scene: Phaser.Scene, grid: TileGrid, depth = 5, density = 0.04) {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  const container = scene.add.container(0, 0).setDepth(depth);

  for (let ty = 2; ty < H - 2; ty++) {
    const row = grid[ty];
    for (let tx = 2; tx < W - 2; tx++) {
      const t = row[tx];
      if (isWall(t)) continue;
      const h = hash(tx, ty);
      if ((h % 1000) / 1000 > density) continue;
      // keep plaza lanes clear — skip tiles with wall on 2+ sides
      let walls = 0;
      if (isWall(grid[ty - 1]?.[tx])) walls++;
      if (isWall(grid[ty + 1]?.[tx])) walls++;
      if (isWall(row[tx - 1])) walls++;
      if (isWall(row[tx + 1])) walls++;
      if (walls >= 3) continue;

      const spec = POOL[h % POOL.length];
      if (!scene.textures.exists(spec.key)) continue;

      const x = tx * TILE + TILE / 2 + ((h % 7) - 3);
      const y = ty * TILE + TILE / 2 + (((h >> 4) % 7) - 3) + spec.yOff;
      const scale = spec.scale + (h % 5) * 0.03;

      groundShadow(scene, x, y + 6, depth, scale * 0.55, 0.2);

      const spr = scene.add
        .image(x, y, spec.key)
        .setOrigin(0.5, spec.originY)
        .setDepth(depth)
        .setAlpha(0.88 + (h % 10) / 100)
        .setScale(scale);
      if (spec.glow) {
        scene.add
          .image(x, y - 10, GLOW_KEY)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0x00e5ff)
          .setAlpha(0.16)
          .setScale(1.45)
          .setDepth(depth - 0.1);
        scene.add
          .image(x, y + 6, GLOW_KEY)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0xffb86a)
          .setAlpha(0.1)
          .setScale(0.5, 1.8)
          .setDepth(depth - 0.15);
      }
      container.add(spr);
    }
  }
  return container;
}