import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "../config";
import { uiDim } from "./uiLayout";

/** Faint grid + vignette used by title / prologue / customize screens. */
export function drawMenuBackdrop(scene: Phaser.Scene, depth = 0): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(COLORS.bgVoid, 1).fillRect(0, 0, VIEW_W, VIEW_H);
  const step = uiDim(32);
  g.lineStyle(1, 0x1b2740, 0.45);
  for (let x = 0; x <= VIEW_W; x += step) g.lineBetween(x, 0, x, VIEW_H);
  for (let y = 0; y <= VIEW_H; y += step) g.lineBetween(0, y, VIEW_W, y);
  const pad = uiDim(48);
  g.fillStyle(0x02020a, 0.35).fillRect(0, 0, VIEW_W, pad);
  g.fillStyle(0x02020a, 0.42).fillRect(0, VIEW_H - pad, VIEW_W, pad);
  return g;
}

export const MENU_PAD = uiDim(40);
export const MENU_HEADER_Y = uiDim(52);
export const MENU_SUB_Y = uiDim(96);
export const MENU_FOOTER_Y = VIEW_H - uiDim(44);