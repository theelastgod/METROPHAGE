import Phaser from "phaser";
import { VIEW_W, VIEW_H, uiDim, uiFont } from "../config";

export { uiDim, uiFont, UI_SCALE } from "../config";

/** Full-bleed overlay panel with even margins (design-space inset, scaled). */
export function overlayRect(marginDesign = 20) {
  const m = uiDim(marginDesign);
  return { x: m, y: m, w: VIEW_W - m * 2, h: VIEW_H - m * 2 };
}

/** Centered modal sized in design-space pixels. */
export function modalRect(designW: number, designH: number) {
  const w = uiDim(designW);
  const h = uiDim(designH);
  return { x: (VIEW_W - w) / 2, y: (VIEW_H - h) / 2, w, h };
}

/** Dim full-screen backdrop behind modal panels. */
export function dimBackdrop(scene: Phaser.Scene, depth: number, alpha = 0.62) {
  return scene.add
    .rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x02020a, alpha)
    .setScrollFactor(0)
    .setDepth(depth);
}

/** Scaled panel text helper for modal builders. */
export function panelText(
  scene: Phaser.Scene,
  s: string,
  x: number,
  y: number,
  sizeDesign: number,
  color: string,
  opts: { bold?: boolean; origin?: number; depth?: number } = {},
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, s, {
      fontFamily: "Courier New, monospace",
      fontSize: uiFont(sizeDesign),
      color,
      fontStyle: opts.bold ? "bold" : "normal",
    })
    .setOrigin(opts.origin ?? 0, 0)
    .setScrollFactor(0)
    .setDepth(opts.depth ?? 1702);
}