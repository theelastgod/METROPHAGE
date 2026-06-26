import Phaser from "phaser";
import { TILE } from "../config";
import { isWall, type TileGrid } from "../world/district";

// METROPHAGE — building readability pass. The world is a flat tile grid; buildings are
// blocks of wall tiles that, untreated, read as the same dark mass as the floor. This
// scans the grid and, for every building EDGE (wall tile touching open floor):
//   • mutes the busy roof into a clean dark mass,
//   • wraps a BRIGHT CYAN structure-rim on the lit (north/west) faces — this blooms
//     through the neon post-FX, so buildings read as glowing-edged solids,
//   • drops a hard cast shadow + dark wall faces on the floor to the south/east.
// The bright rim is the key: it draws each building's silhouette unmistakably. Static
// (one Graphics per district), cheap.

const RIM = 0x6fe0ff; // bright cyan structure edge (blooms)
const RIM_HOT = 0xeafdff;
const DIM = 0x1f4a66; // dim rim on the shadow faces (keeps the full outline visible)

export function shadeWalls(scene: Phaser.Scene, grid: TileGrid): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(2.5); // above floor + light pools, below actors
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

      // Mute the busy roof into a clean, darker mass so the silhouette + rim carry the read.
      g.fillStyle(0x070a14, 0.48).fillRect(X, Y, TILE, TILE);

      // ── cast shadow + dark wall faces (south / east) ──
      if (openBelow) {
        g.fillStyle(0x02030a, 0.72).fillRect(X, Y + TILE - 7, TILE, 7); // south wall face
        g.fillStyle(0x000000, 0.5).fillRect(X, Y + TILE, TILE, 11); // cast shadow on floor
        g.fillStyle(0x000000, 0.24).fillRect(X, Y + TILE + 11, TILE, 6);
        g.fillStyle(DIM, 0.7).fillRect(X, Y + TILE - 1, TILE, 1); // dim base outline
      }
      if (openRight) {
        g.fillStyle(0x02030a, 0.58).fillRect(X + TILE - 6, Y, 6, TILE); // east face
        g.fillStyle(0x000000, 0.42).fillRect(X + TILE, Y, 9, TILE); // cast shadow on floor
        g.fillStyle(0x000000, 0.18).fillRect(X + TILE + 9, Y, 5, TILE);
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
