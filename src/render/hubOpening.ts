// METROPHAGE — opening-town look. Per-ring ground skins + the authored decoration
// list (planters, benches, lanterns, stalls) that the hub generator already places
// but OnlineScene never drew. Cheap: one tileSprite per block, images per prop.

import Phaser from "phaser";
import { TILE } from "../config";
import { GLOW_KEY } from "../assets/manifest";
import { isWall, type TileGrid } from "../world/district";
import { ENV_IDENTITY, envAt, type Env, type PropKind } from "../world/city";
import { generatedAssetScale, generatedReferencePx } from "./generatedAssetSizing";
import { DECOR_KEYS, ENV_GROUND_KEYS, ENV_PROP_KEYS, firstKey } from "./hubOpeningData";

export { DECOR_KEYS, ENV_GROUND_KEYS, ENV_PROP_KEYS, firstKey } from "./hubOpeningData";

const hash = (x: number, y: number) => ((x * 374761393) ^ (y * 668265263)) >>> 0;

function live(scene: Phaser.Scene, keys: readonly string[], salt = 0): string | null {
  return firstKey((k) => scene.textures.exists(k), keys, salt);
}

function stamp(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
  depth: number,
  scale: number,
  glow: boolean,
  tint: number,
  originY = 0.86,
): void {
  if (!scene.textures.exists(key)) return;
  const img = scene.add.image(x, y, key).setDepth(depth).setOrigin(0.5, originY).setAlpha(0.94);
  img.setScale(generatedAssetScale(key, img.width, img.height, scale, generatedReferencePx(key)));
  if (glow) {
    scene.add
      .image(x, y - 6, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint)
      .setDepth(depth - 0.05)
      .setScale(0.7)
      .setAlpha(0.16);
  }
}

/** Skin each hub block with its ring's ground plate (tilemap still owns collision). */
export function paintCityRingGrounds(
  scene: Phaser.Scene,
  zones: Array<{ rect: { x1: number; y1: number; x2: number; y2: number }; env: Env }>,
): void {
  const used = new Set<string>();
  for (const z of zones) {
    const key = live(scene, ENV_GROUND_KEYS[z.env], z.rect.x1 + z.rect.y1 * 17);
    if (!key || used.has(`${z.rect.x1},${z.rect.y1}`)) continue;
    used.add(`${z.rect.x1},${z.rect.y1}`);
    const w = (z.rect.x2 - z.rect.x1 + 1) * TILE;
    const h = (z.rect.y2 - z.rect.y1 + 1) * TILE;
    const cx = (z.rect.x1 * TILE + w / 2);
    const cy = (z.rect.y1 * TILE + h / 2);
    scene.add
      .tileSprite(cx, cy, w, h, key)
      .setDepth(0.16)
      .setAlpha(0.32)
      .setTint(ENV_IDENTITY[z.env].accent);
  }
}

/** Draw the generator's decoration list (plaza ring + sidewalk env props). */
export function dressCityDecorations(
  scene: Phaser.Scene,
  decorations: Array<{ kind: PropKind; x: number; y: number }>,
  envOf: (tx: number, ty: number) => Env,
  depth = 4.4,
): void {
  for (const d of decorations) {
    const env = envOf(d.x, d.y);
    const accent = ENV_IDENTITY[env].accent;
    const key = live(scene, DECOR_KEYS[d.kind], d.x * 13 + d.y);
    if (!key) continue;
    const x = d.x * TILE + TILE / 2;
    const y = d.y * TILE + TILE / 2;
    const scale = d.kind === "tree" ? 0.72 : d.kind === "billboard" ? 0.7 : d.kind === "stall" ? 0.62 : 0.55;
    const glow = d.kind === "lantern" || d.kind === "fire" || d.kind === "billboard" || d.kind === "stall";
    stamp(scene, key, x, y, depth, scale, glow, accent);
  }
}

/**
 * Ring-aware street scatter. Plaza stays clear; density and clutter change with env
 * so walking out of spawn is a material change, not a tint.
 */
export function scatterHubRingProps(
  scene: Phaser.Scene,
  grid: TileGrid,
  plaza: { tx: number; ty: number },
  depth = 4.35,
): void {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  for (let ty = 2; ty < H - 2; ty++) {
    for (let tx = 2; tx < W - 2; tx++) {
      if (isWall(grid[ty][tx])) continue;
      const dist = Math.hypot(tx - plaza.tx, ty - plaza.ty);
      if (dist <= 9) continue;
      const env = envAt(tx, ty, W, H);
      const h = hash(tx, ty);
      const density = env === "park" ? 0.018 : env === "downtown" ? 0.01 : 0.014;
      if ((h % 1000) / 1000 > density) continue;
      const key = live(scene, ENV_PROP_KEYS[env], h);
      if (!key) continue;
      const x = tx * TILE + TILE / 2 + ((h % 7) - 3);
      const y = ty * TILE + TILE / 2 + (((h >> 4) % 7) - 3);
      stamp(scene, key, x, y, depth, 0.5 + (h % 4) * 0.03, env === "downtown" || env === "market", ENV_IDENTITY[env].accent);
    }
  }
}

/** Plaza identity totem — district kit as a standing illustration, never a stretched roof. */
export function placePlazaIdentity(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  depth = 5.2,
): void {
  const key = live(scene, ["hf_building_dist_downtown", "hf_landmark_fountain", "hf_web_city_fountain"], 0);
  if (!key) return;
  const x = cx * TILE + TILE / 2;
  const y = (cy - 7) * TILE + TILE / 2;
  stamp(scene, key, x, y, depth, 0.85, true, 0xff2bd6, 0.92);
}

/** Motion on the opening square: puddle breath, neon flicker, steam. */
export function installHubAmbience(scene: Phaser.Scene, cx: number, cy: number): void {
  const px = (dx: number, dy: number) => ({ x: (cx + dx) * TILE + TILE / 2, y: (cy + dy) * TILE + TILE / 2 });
  const puddles = [px(-3, 2), px(4, 1), px(-2, 5), px(3, 6), px(0, 8)];
  for (let i = 0; i < puddles.length; i++) {
    const p = puddles[i];
    const g = scene.add
      .image(p.x, p.y, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(i % 2 ? 0xff2bd6 : 0x29e7ff)
      .setDepth(2.4)
      .setScale(1.4, 0.55)
      .setAlpha(0.1);
    scene.tweens.add({
      targets: g,
      alpha: 0.22,
      scaleX: 1.65,
      duration: 1800 + i * 240,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }
  const lamps = [px(-11, -7), px(11, -7), px(-11, 7), px(11, 7)];
  for (let i = 0; i < lamps.length; i++) {
    const p = lamps[i];
    const g = scene.add
      .image(p.x, p.y - 32, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffb86a)
      .setDepth(5.6)
      .setScale(1.1)
      .setAlpha(0.2);
    scene.tweens.add({
      targets: g,
      alpha: 0.38,
      duration: 900 + i * 180,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }
  const steam = scene.add
    .image((cx - 13) * TILE + TILE / 2, (cy - 11) * TILE, GLOW_KEY)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(0xdfe8ff)
    .setDepth(6.2)
    .setScale(0.45)
    .setAlpha(0.18);
  scene.tweens.add({
    targets: steam,
    y: steam.y - 28,
    alpha: 0,
    scale: 0.7,
    duration: 2200,
    repeat: -1,
  });
}
