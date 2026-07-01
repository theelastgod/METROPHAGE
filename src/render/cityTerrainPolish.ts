import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";
import { TILE } from "../config";
import { ENV_IDENTITY, type CityBuilding } from "../world/city";
import type { Rect } from "../game/districts";

/** Per-district colour wash — shared by offline CityScene and online city hub. */
export function paintCityEnvWash(
  scene: Phaser.Scene,
  zones: Array<{ rect: Rect; env: keyof typeof ENV_IDENTITY }>,
  depth = 1,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(depth);
  for (const z of zones) {
    const id = ENV_IDENTITY[z.env];
    g.fillStyle(id.wash, id.washAlpha);
    g.fillRect(z.rect.x1 * TILE, z.rect.y1 * TILE, (z.rect.x2 - z.rect.x1 + 1) * TILE, (z.rect.y2 - z.rect.y1 + 1) * TILE);
  }
  return g;
}

const KIND_NEON: Record<string, number> = {
  bar: 0xff2bd6,
  clinic: 0x39ff88,
  guild: 0xf7ff3c,
  hospital: 0x39ff88,
  hotel: 0x39ff88,
  stadium: 0xff3b6b,
};

/** Storefront neon reflected on wet pavement under signed doors. */
export function paintCityStorefrontReflections(scene: Phaser.Scene, buildings: CityBuilding[], depth = 2): void {
  for (const b of buildings) {
    if (!b.door) continue;
    const col = KIND_NEON[b.kind] ?? 0x29e7ff;
    const x = b.door[0] * TILE + TILE / 2;
    const y = b.door[1] * TILE + TILE / 2;
    scene.add.image(x, y + 2, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(col).setDepth(depth).setScale(1.1).setAlpha(0.14);
    scene.add
      .image(x, y + 8, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(col)
      .setDepth(depth)
      .setScale(0.5, 2.1)
      .setAlpha(0.11)
      .setOrigin(0.5, 0.1);
  }
}