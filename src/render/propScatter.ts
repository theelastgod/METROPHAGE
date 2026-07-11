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
  PROP_DUMPSTER_KEY,
  PROP_CAR_BLUE_KEY,
  PROP_CAR_RED_KEY,
  PROP_CAR_GREEN_KEY,
  PROP_PICKUP_KEY,
  PROP_VAN_KEY,
  HF_PROP_KEYS,
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
  /** Tint for neon streetlights / accent props. */
  tint?: number;
};

const PROPS: PropSpec[] = [
  // Authored neon props already carry their own palette — only streetlight/planter get glow.
  { key: PROP_STREETLIGHT_KEY, originY: 0.85, scale: 0.95, yOff: 4, glow: true, weight: 4 },
  { key: PROP_VENDING_KEY, originY: 0.82, scale: 0.88, yOff: 2, weight: 3, glow: true },
  { key: PROP_AC_KEY, originY: 0.78, scale: 0.84, yOff: 0, weight: 2 },
  { key: PROP_BIN_KEY, originY: 0.88, scale: 0.76, yOff: 3, weight: 2 },
  { key: PROP_HYDRANT_KEY, originY: 0.9, scale: 0.78, yOff: 4, weight: 2 },
  { key: PROP_PLANTER_KEY, originY: 0.82, scale: 0.82, yOff: 2, weight: 2, glow: true },
  { key: PROP_BARRIER_KEY, originY: 0.85, scale: 0.84, yOff: 2, weight: 2 },
  { key: PROP_DUMPSTER_KEY, originY: 0.88, scale: 0.86, yOff: 2, weight: 2 },
  // Parked vehicles (CC0 city pack, neon-recolored) — rarer, wider footprints.
  { key: PROP_CAR_BLUE_KEY, originY: 0.7, scale: 0.72, yOff: 0, weight: 1 },
  { key: PROP_CAR_RED_KEY, originY: 0.7, scale: 0.72, yOff: 0, weight: 1 },
  { key: PROP_CAR_GREEN_KEY, originY: 0.7, scale: 0.72, yOff: 0, weight: 1 },
  { key: PROP_PICKUP_KEY, originY: 0.7, scale: 0.68, yOff: 0, weight: 1 },
  { key: PROP_VAN_KEY, originY: 0.7, scale: 0.68, yOff: 0, weight: 1 },
  // Higgsfield top-down props (streetlight / vending / crate / taxi / terminal / …).
  { key: HF_PROP_KEYS[0], originY: 0.88, scale: 0.7, yOff: 2, glow: true, weight: 2 },
  { key: HF_PROP_KEYS[1], originY: 0.85, scale: 0.62, yOff: 2, weight: 2, glow: true },
  { key: HF_PROP_KEYS[2], originY: 0.88, scale: 0.6, yOff: 2, weight: 1 },
  { key: HF_PROP_KEYS[3], originY: 0.9, scale: 0.58, yOff: 3, weight: 1 },
  { key: HF_PROP_KEYS[4], originY: 0.85, scale: 0.62, yOff: 2, weight: 2 },
  { key: HF_PROP_KEYS[5], originY: 0.88, scale: 0.64, yOff: 2, weight: 1 },
  { key: HF_PROP_KEYS[6], originY: 0.72, scale: 0.55, yOff: 0, weight: 1 },
  { key: HF_PROP_KEYS[7], originY: 0.72, scale: 0.55, yOff: 0, weight: 1 },
  { key: HF_PROP_KEYS[9], originY: 0.82, scale: 0.55, yOff: 2, glow: true, weight: 1 },
  { key: HF_PROP_KEYS[10], originY: 0.85, scale: 0.58, yOff: 2, weight: 1 },
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
export function scatterWorldProps(scene: Phaser.Scene, grid: TileGrid, depth = 5, density = 0.078) {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  const container = scene.add.container(0, 0).setDepth(depth);
  // Only scatter props whose textures actually loaded (missing HF props skip silently).
  const livePool = POOL.filter((p) => scene.textures.exists(p.key));
  if (livePool.length === 0) return;

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

      const spec = livePool[h % livePool.length];

      const x = tx * TILE + TILE / 2 + ((h % 7) - 3);
      const y = ty * TILE + TILE / 2 + (((h >> 4) % 7) - 3) + spec.yOff;
      const scale = spec.scale + (h % 5) * 0.03;

      groundShadow(scene, x, y + 6, depth, scale * 0.55, 0.2);

      const spr = scene.add
        .image(x, y, spec.key)
        .setOrigin(0.5, spec.originY)
        .setDepth(depth)
        .setAlpha(0.9 + (h % 10) / 100)
        .setScale(scale);
      if (spec.glow) {
        scene.add
          .image(x, y - 10, GLOW_KEY)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0x29e7ff)
          .setAlpha(0.2)
          .setScale(1.55)
          .setDepth(depth - 0.1);
        scene.add
          .image(x, y + 6, GLOW_KEY)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0xffb86a)
          .setAlpha(0.12)
          .setScale(0.55, 1.9)
          .setDepth(depth - 0.15);
      }
      container.add(spr);
    }
  }
  return container;
}