import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";
import { TILE } from "../config";
import { isWall, TILE_LANE, TILE_PLAZA, TILE_CROSSWALK, TILE_NEON, type TileGrid } from "../world/district";

/**
 * Rain-slicked street lighting — shared by the offline city hub (CityScene) and the unified
 * server-authoritative world (OnlineScene), so both render the same wet neon-noir pavement.
 *
 * Pure additive ambiance on the ground at `depth` (above the floor, below props/entities):
 * overhead light-pools on a jittered streetlamp grid (sodium + the local district accent),
 * vertical neon "reflection" smears, sparse puddles on asphalt/plaza, curb accent lines,
 * and specular glints. The raw real-art floor tiles don't bake this in, so this is what
 * makes them read as wet, lit streets.
 */
const WARM = 0xffb86a; // sodium street-lamp

const WET_SURFACES = new Set([TILE_LANE, TILE_PLAZA, TILE_CROSSWALK, TILE_NEON]);

/** Map variant indices back to their canonical surface for puddle placement. */
function baseTile(index: number): number {
  if (index <= 17) return index;
  const rev: Record<number, number> = {
    18: 0, 19: 0, 20: 2, 21: 1, 22: 3, 23: 10, 24: 14,
    25: 4, 26: 7, 27: 8, 28: 9, 29: 15, 30: 16, 31: 11,
  };
  return rev[index] ?? index;
}

export function paintWetStreets(
  scene: Phaser.Scene,
  grid: TileGrid,
  accentAt: (tx: number, ty: number) => number,
  depth = 2,
): void {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  const wall = (x: number, y: number) => isWall(grid[y]?.[x]);
  const hash = (x: number, y: number) => ((x * 374761393) ^ (y * 668265263)) >>> 0;
  const pool = (x: number, y: number, col: number, r: number, a: number) =>
    scene.add.image(x, y, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(col).setDepth(depth).setScale(r).setAlpha(a);

  // streetlamp light-pools on a jittered grid over open ground + their wet reflection
  const SPACING = 5;
  for (let ty = 2; ty < H - 2; ty += SPACING) {
    for (let tx = 2; tx < W - 2; tx += SPACING) {
      const h = hash(tx, ty);
      const jx = tx + (h % 3) - 1;
      const jy = ty + ((h >> 3) % 3) - 1;
      if (wall(jx, jy)) continue;
      const col = (h & 1) === 0 ? WARM : accentAt(jx, jy);
      const x = jx * TILE + TILE / 2;
      const y = jy * TILE + TILE / 2;
      const p = pool(x, y, col, 2.55 + (h % 8) / 10, 0.24);
      scene.add
        .image(x, y + 8, GLOW_KEY)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(col)
        .setDepth(depth)
        .setScale(0.62, 2.45)
        .setAlpha(0.18)
        .setOrigin(0.5, 0.1);
      if ((h & 3) === 0)
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

  // puddles + curb neon on wet surfaces
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

      if (WET_SURFACES.has(base) && (h & 15) === 0) {
        const px = x + 6 + (h % 18);
        const py = y + 6 + ((h >> 5) % 18);
        puddleG.fillStyle(accent, 0.08).fillEllipse(px + 6, py + 4, 14, 8);
        puddleG.fillStyle(0xbfd0ff, 0.14).fillEllipse(px + 5, py + 3, 6, 3);
        puddleG.lineStyle(1, 0x9fe8ff, 0.22).strokeEllipse(px + 6, py + 4, 14, 8);
      }

      // neon curb bleed where walkable meets wall to the south or east
      if (!wall(tx, ty + 1) && wall(tx, ty - 1)) {
        curbG.lineStyle(1, accent, 0.28).lineBetween(x + 2, y + 1, x + TILE - 2, y + 1);
      }
      if (!wall(tx + 1, ty) && wall(tx - 1, ty)) {
        curbG.lineStyle(1, accent, 0.22).lineBetween(x + 1, y + 2, x + 1, y + TILE - 2);
      }
    }
  }

  // sparse specular glints — light catching on wet pavement
  const gl = scene.add.graphics().setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
  const GLINT = [0xbfd0ff, 0x9fe8ff, 0xffd9a8, 0xff9fe8];
  for (let i = 0; i < 220; i++) {
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
    if (i % 9 === 0) gl.fillStyle(0xffffff, 0.2).fillRect(x, y - 2, 1, 4); // vertical streak reflection
  }
}