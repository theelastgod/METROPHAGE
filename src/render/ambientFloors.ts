import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";
import { TILE } from "../config";
import { isWall, type TileGrid } from "../world/district";

const hash = (x: number, y: number) => ((x * 48271) ^ (y * 65521)) >>> 0;

/**
 * Interior / subway floor lighting — sparse overhead pools and platform edge accents.
 * Lighter than the outdoor wet-street pass (no rain puddles or neon smears).
 */
export function paintAmbientFloors(
  scene: Phaser.Scene,
  grid: TileGrid,
  accent = 0x9ec8ff,
  depth = 2,
): void {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  const cool = 0xd8e8ff;

  for (let ty = 2; ty < H - 2; ty += 6) {
    for (let tx = 2; tx < W - 2; tx += 6) {
      const h = hash(tx, ty);
      const jx = tx + (h % 3) - 1;
      const jy = ty + ((h >> 3) % 3) - 1;
      if (isWall(grid[jy]?.[jx])) continue;
      const x = jx * TILE + TILE / 2;
      const y = jy * TILE + TILE / 2;
      const col = (h & 1) === 0 ? cool : accent;
      scene.add
        .image(x, y, GLOW_KEY)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(col)
        .setDepth(depth)
        .setScale(2.1 + (h % 6) / 10)
        .setAlpha(0.13);
    }
  }

  const edge = scene.add.graphics().setDepth(depth + 0.05);
  for (let ty = 1; ty < H - 1; ty++) {
    for (let tx = 1; tx < W - 1; tx++) {
      if (isWall(grid[ty][tx])) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      if (!isWall(grid[ty - 1]?.[tx]) && isWall(grid[ty + 1]?.[tx])) {
        edge.lineStyle(1, accent, 0.2).lineBetween(x + 2, y + TILE - 2, x + TILE - 2, y + TILE - 2);
      }
      if (!isWall(grid[ty]?.[tx - 1]) && isWall(grid[ty]?.[tx + 1])) {
        edge.lineStyle(1, accent, 0.16).lineBetween(x + TILE - 2, y + 2, x + TILE - 2, y + TILE - 2);
      }
    }
  }
}