// METROPHAGE — fake-3D roof projection. Every building gets a translucent roof cap
// that shifts AWAY from the camera's centre each frame (dx = (roof − cam) · k), so
// walking past a block makes its roof slide against its base — buildings read as
// TALL instead of painted on the floor. This is the classic 2.5D projection trick:
// per-roof offsets around the view centre, not a uniform scrollFactor (which would
// misalign roofs from their bases everywhere except the world origin).
//
// Cost: one tinted 1px-texture image per roof (+ one lit south-edge strip on non-low
// tiers), repositioned per frame — no per-frame Graphics redraws.

import Phaser from "phaser";
import { TILE } from "../config";
import { effectiveLowFx } from "../systems/Settings";
import type { Rect } from "../game/districts";

const CAP_TEX = "roofcap_px";
const K = 0.05; // projection strength (offset per px of camera distance)
const MAX_OFF = 15; // px clamp so far roofs don't detach absurdly

export interface RoofParallax {
  update(cam: Phaser.Cameras.Scene2D.Camera): void;
  destroy(): void;
}

function ensureTex(scene: Phaser.Scene) {
  if (scene.textures.exists(CAP_TEX)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
  g.generateTexture(CAP_TEX, 2, 2);
  g.destroy();
}

/** Install projected roof caps over `rects` (tile coords, inclusive). */
export function installRoofParallax(
  scene: Phaser.Scene,
  rects: Rect[],
  accent: number,
  depth = 12,
): RoofParallax {
  ensureTex(scene);
  const low = effectiveLowFx();
  const caps: Array<{
    img: Phaser.GameObjects.Image;
    edge?: Phaser.GameObjects.Image;
    bx: number;
    by: number;
    southY: number;
  }> = [];

  // biggest roofs first — they sell the effect; cap the object count on low tiers
  const sorted = [...rects].sort(
    (a, b) => (b.x2 - b.x1) * (b.y2 - b.y1) - (a.x2 - a.x1) * (a.y2 - a.y1),
  );
  for (const b of sorted.slice(0, low ? 28 : 64)) {
    const w = (b.x2 - b.x1 + 1) * TILE;
    const h = (b.y2 - b.y1 + 1) * TILE;
    if (w < TILE * 2 || h < TILE * 2) continue; // tiny sheds don't need height
    const bx = b.x1 * TILE + w / 2;
    const by = b.y1 * TILE + h / 2;
    const img = scene.add
      .image(bx, by, CAP_TEX)
      .setDisplaySize(w - 6, h - 6)
      .setTint(0x263247)
      .setAlpha(low ? 0.26 : 0.32)
      .setDepth(depth);
    let edge: Phaser.GameObjects.Image | undefined;
    if (!low) {
      // lit rim along the south face — the edge the "camera" would see
      edge = scene.add
        .image(bx, by + h / 2 - 4, CAP_TEX)
        .setDisplaySize(w - 10, 2)
        .setTint(accent)
        .setAlpha(0.3)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(depth + 0.1);
    }
    caps.push({ img, edge, bx, by, southY: by + h / 2 - 4 });
  }

  return {
    update(cam: Phaser.Cameras.Scene2D.Camera) {
      const cx = cam.midPoint.x;
      const cy = cam.midPoint.y;
      for (const c of caps) {
        const dx = Phaser.Math.Clamp((c.bx - cx) * K, -MAX_OFF, MAX_OFF);
        // slightly stronger vertical parallax — height reads best on the y axis
        const dy = Phaser.Math.Clamp((c.by - cy) * K * 1.3, -MAX_OFF * 1.3, MAX_OFF * 1.3);
        c.img.setPosition(c.bx + dx, c.by + dy);
        c.edge?.setPosition(c.bx + dx, c.southY + dy);
      }
    },
    destroy() {
      for (const c of caps) {
        c.img.destroy();
        c.edge?.destroy();
      }
      caps.length = 0;
    },
  };
}
