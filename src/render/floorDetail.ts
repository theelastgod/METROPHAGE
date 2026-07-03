import Phaser from "phaser";
import { TILE, TILESET_REAL_ART } from "../config";
import { isWall, type TileGrid } from "../world/district";

const hash = (x: number, y: number) => ((x * 9747113) ^ (y * 5194637)) >>> 0;

export interface FloorDetailOpts {
  /** Photo tileset (96px cells → 32px world) — skip grid-breaking overlays. */
  realArt?: boolean;
}

/**
 * Subtle floor polish — tile-edge AO and material seams so large walkable areas read as
 * continuous terrain. Real-art mode keeps only transitions + light AO; procedural overlays
 * (micro-seams, quadrant noise, baked puddles) are omitted so photo tiles aren't double-gridded.
 */
export function paintFloorDetail(
  scene: Phaser.Scene,
  grid: TileGrid,
  depth = 1.8,
  opts: FloorDetailOpts = {},
): Phaser.GameObjects.Graphics {
  const realArt = opts.realArt ?? TILESET_REAL_ART;
  const g = scene.add.graphics().setDepth(depth);
  const H = grid.length;
  const W = grid[0]?.length ?? 0;

  for (let ty = 0; ty < H; ty++) {
    const row = grid[ty];
    for (let tx = 0; tx < W; tx++) {
      const t = row[tx];
      if (isWall(t)) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      const h = hash(tx, ty);

      const aoTop = realArt ? 0.12 : 0.2;
      const aoLeft = realArt ? 0.08 : 0.14;
      if (isWall(grid[ty - 1]?.[tx])) g.fillStyle(0x000000, aoTop).fillRect(x, y, TILE, 3);
      if (isWall(grid[ty]?.[tx - 1])) g.fillStyle(0x000000, aoLeft).fillRect(x, y, 3, TILE);

      if (!realArt) {
        if ((h & 7) === 0) g.fillStyle(0x0c1018, 0.11).fillRect(x + TILE - 1, y, 1, TILE);
        if ((h & 11) === 0) g.fillStyle(0x0c1018, 0.09).fillRect(x, y + TILE - 1, TILE, 1);
      }

      const below = grid[ty + 1]?.[tx];
      const right = row[tx + 1];
      const seamA = realArt ? 0.2 : 0.32;
      const seamB = realArt ? 0.16 : 0.26;
      if (below !== undefined && !isWall(below) && below !== t) {
        g.fillStyle(0x1a2234, seamA).fillRect(x, y + TILE - 2, TILE, 2);
      }
      if (right !== undefined && !isWall(right) && right !== t) {
        g.fillStyle(0x1a2234, seamB).fillRect(x + TILE - 2, y, 2, TILE);
      }

      // Sparse wet glints — real-art gets a light pass only; procedural gets full grime.
      if (realArt) {
        if ((h & 63) === 5) g.fillStyle(0xbfd0ff, 0.045).fillRect(x + 4 + (h % 24), y + 4 + ((h >> 5) % 24), 1, 1);
        if ((h & 127) === 37) g.fillStyle(0xffffff, 0.035).fillRect(x + 6 + (h % 20), y + 8 + ((h >> 4) % 20), 2, 1);
      } else {
        if ((h & 15) === 3) g.fillStyle(0x182030, 0.06).fillRect(x, y, TILE / 2, TILE / 2);
        if ((h & 15) === 11) g.fillStyle(0x101828, 0.05).fillRect(x + TILE / 2, y + TILE / 2, TILE / 2, TILE / 2);

        if ((h & 31) === 0) {
          g.fillStyle(0x9aa8b8, 0.08).fillRect(x + 4 + (h % 22), y + 4 + ((h >> 5) % 22), 1, 1);
        }
        if ((h & 63) === 7) {
          g.fillStyle(0x6a7a8a, 0.06).fillRect(x + 10 + ((h >> 4) % 14), y + 12 + (h % 12), 2, 1);
        }
        if ((h & 127) === 19) {
          g.fillStyle(0x00e5ff, 0.075).fillEllipse(x + TILE / 2, y + TILE / 2 + 4, TILE * 0.58, TILE * 0.24);
          g.fillStyle(0xff2bd6, 0.042).fillEllipse(x + TILE / 2 + 3, y + TILE / 2 + 5, TILE * 0.38, TILE * 0.13);
          g.lineStyle(1, 0xbfe8ff, 0.12).strokeEllipse(x + TILE / 2, y + TILE / 2 + 4, TILE * 0.5, TILE * 0.18);
        }
        if ((h & 255) === 41) {
          g.lineStyle(1, 0x3a4a62, 0.22).lineBetween(x + 6, y + TILE - 8, x + TILE - 10, y + 10);
          g.lineStyle(1, 0x2a3548, 0.12).lineBetween(x + TILE - 14, y + 8, x + 10, y + TILE - 12);
        }
      }
    }
  }
  return g;
}