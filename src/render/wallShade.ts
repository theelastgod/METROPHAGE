import Phaser from "phaser";
import { TILE } from "../config";
import { isWall, type TileGrid } from "../world/district";

// METROPHAGE — building readability pass. The world is a flat tile grid; buildings are
// blocks of wall tiles that, untreated, read as the same dark mass as the floor. This
// scans the grid and, for every building EDGE (wall tile touching open floor):
//   • lightly mutes the busy roof into a clean dark mass (leaves source art visible),
//   • wraps a BRIGHT structure-rim on the lit (north/west) faces — tinted to the district,
//   • drops a hard cast shadow + dark wall faces on the floor to the south/east,
//   • scatters sparse lit-window dots on roof faces for a lived-in skyline.
// Static (one Graphics per district), cheap.

const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

function rimColors(accent: number) {
  const r = (accent >> 16) & 0xff;
  const g = (accent >> 8) & 0xff;
  const b = accent & 0xff;
  const hot = (Math.min(255, r + 40) << 16) | (Math.min(255, g + 50) << 8) | Math.min(255, b + 60);
  const rim = (Math.min(255, Math.round(r * 0.55 + 90)) << 16) | (Math.min(255, Math.round(g * 0.55 + 140)) << 8) | Math.min(255, Math.round(b * 0.55 + 180));
  const dim = (Math.round(r * 0.18) << 16) | (Math.round(g * 0.22) << 8) | Math.round(b * 0.28);
  return { rim, hot, dim };
}

export function shadeWalls(
  scene: Phaser.Scene,
  grid: TileGrid,
  accent = 0x00e5ff,
  depth = 2.5,
  realArt = false,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(depth);
  const muteA = realArt ? 0.08 : 0.22;
  const { rim: RIM, hot: RIM_HOT, dim: DIM } = rimColors(accent);
  const wallAt = (x: number, y: number) => {
    const row = grid[y];
    return !row || isWall(row[x]); // out-of-bounds counts as wall (outer ring shades inward)
  };

  for (let ty = 0; ty < grid.length; ty++) {
    const row = grid[ty];
    for (let tx = 0; tx < row.length; tx++) {
      if (!isWall(row[tx])) continue;
      const openBelow = !wallAt(tx, ty + 1);
      const openRight = !wallAt(tx + 1, ty);
      const openAbove = !wallAt(tx, ty - 1);
      const openLeft = !wallAt(tx - 1, ty);
      if (!(openBelow || openRight || openAbove || openLeft)) continue; // interior tile — leave it
      const X = tx * TILE;
      const Y = ty * TILE;

      g.fillStyle(0x070a14, muteA).fillRect(X, Y, TILE, TILE);

      // Sparse rooftop windows (warm + accent) — reads as inhabited blocks at night.
      const h = hash(tx, ty);
      if ((h & 7) === 0) {
        const wx = X + 4 + (h % 20);
        const wy = Y + 5 + ((h >> 4) % 14);
        g.fillStyle(0xffd9a8, 0.38).fillRect(wx, wy, 3, 2);
        g.fillStyle(RIM, 0.22).fillRect(wx + 1, wy, 1, 1);
      }
      if ((h & 11) === 3) {
        g.fillStyle(0xf7ff3c, 0.28).fillRect(X + 18 + (h % 8), Y + 8 + ((h >> 6) % 10), 2, 2);
      }

      // ── cast shadow + dark wall faces (south / east) ──
      if (openBelow) {
        g.fillStyle(0x02030a, 0.72).fillRect(X, Y + TILE - 7, TILE, 7); // south wall face
        g.fillStyle(0x000000, 0.42).fillRect(X, Y + TILE, TILE, 11); // cast shadow on floor
        g.fillStyle(0x000000, 0.18).fillRect(X, Y + TILE + 11, TILE, 6);
        g.fillStyle(DIM, 0.7).fillRect(X, Y + TILE - 1, TILE, 1); // dim base outline
      }
      if (openRight) {
        g.fillStyle(0x02030a, 0.58).fillRect(X + TILE - 6, Y, 6, TILE); // east face
        g.fillStyle(0x000000, 0.34).fillRect(X + TILE, Y, 9, TILE); // cast shadow on floor
        g.fillStyle(0x000000, 0.14).fillRect(X + TILE + 9, Y, 5, TILE);
        g.fillStyle(DIM, 0.6).fillRect(X + TILE - 1, Y, 1, TILE);
      }
      if (openBelow && openRight) g.fillStyle(0x000000, 0.36).fillRect(X + TILE, Y + TILE, 11, 11);

      // ── bright lit structure-rim (north / west) — the cyberpunk neon outline ──
      if (openAbove) {
        g.fillStyle(RIM, 0.9).fillRect(X, Y, TILE, 2);
        g.fillStyle(RIM_HOT, 0.55).fillRect(X, Y, TILE, 1);
      }
      if (openLeft) {
        g.fillStyle(RIM, 0.78).fillRect(X, Y, 2, TILE);
        g.fillStyle(RIM_HOT, 0.32).fillRect(X, Y, 1, TILE);
      }
      if (openAbove && openLeft) g.fillStyle(RIM_HOT, 0.7).fillRect(X, Y, 3, 3); // hot NW corner
    }
  }
  return g;
}