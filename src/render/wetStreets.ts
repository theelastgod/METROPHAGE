import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";
import { TILE } from "../config";
import { isWall, type TileGrid } from "../world/district";

/**
 * Rain-slicked street lighting — shared by the offline city hub (CityScene) and the unified
 * server-authoritative world (OnlineScene), so both render the same wet neon-noir pavement.
 *
 * Pure additive ambiance on the ground at `depth` (above the floor, below props/entities):
 * overhead light-pools on a jittered streetlamp grid (sodium + the local district accent),
 * a vertical neon "reflection" smear under each pool, and sparse specular glints. The raw
 * real-art floor tiles don't bake this in (the old procedural floor did), so this is what
 * makes them read as wet, lit streets.
 *
 * `accentAt(tx,ty)` supplies the neon colour for a tile — per-district in the city, the zone
 * accent online. Returns nothing; everything is fire-and-forget display objects.
 */
const WARM = 0xffb86a; // sodium street-lamp

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
  const SPACING = 6;
  for (let ty = 2; ty < H - 2; ty += SPACING) {
    for (let tx = 2; tx < W - 2; tx += SPACING) {
      const h = hash(tx, ty);
      const jx = tx + (h % 3) - 1, jy = ty + ((h >> 3) % 3) - 1;
      if (wall(jx, jy)) continue;
      const col = (h & 1) === 0 ? WARM : accentAt(jx, jy); // mix sodium + district neon
      const x = jx * TILE + TILE / 2, y = jy * TILE + TILE / 2;
      const p = pool(x, y, col, 2.1 + (h % 8) / 10, 0.17); // broad soft overhead wash
      scene.add.image(x, y + 7, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(col)
        .setDepth(depth).setScale(0.5, 1.9).setAlpha(0.12).setOrigin(0.5, 0.1); // reflection down the wet ground
      if ((h & 3) === 0) // a quarter of the lamps breathe, for life
        scene.tweens.add({ targets: p, alpha: 0.08, scale: p.scale * 1.12, duration: 1700 + (h % 1400), yoyo: true, repeat: -1, ease: "Sine.inOut" });
    }
  }

  // sparse specular glints — light catching on wet pavement
  const gl = scene.add.graphics().setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
  const GLINT = [0xbfd0ff, 0x9fe8ff, 0xffd9a8];
  for (let i = 0; i < 90; i++) {
    const tx = 2 + Math.floor(hash(i * 7 + 1, i * 13 + 5) % Math.max(1, W - 4));
    const ty = 2 + Math.floor(hash(i * 17 + 3, i * 11 + 9) % Math.max(1, H - 4));
    if (wall(tx, ty)) continue;
    const c = GLINT[i % GLINT.length];
    const x = tx * TILE + 4 + (hash(tx, ty) % 24), y = ty * TILE + 4 + ((hash(tx, ty) >> 5) % 24);
    gl.fillStyle(c, 0.5).fillRect(x, y, 1, 1);
    if (i % 4 === 0) gl.fillStyle(c, 0.28).fillRect(x - 1, y, 3, 1).fillRect(x, y - 1, 1, 3); // brighter cross-glint
  }
}
