import Phaser from "phaser";
import { uiDim } from "./uiLayout";

/** Shared menu-panel frame so Skill/Inventory/Contract/Vendor look consistent. */
export function drawPanelFrame(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const inset = uiDim(4);
  g.fillStyle(0x07061a, 0.96).fillRect(x, y, w, h);
  g.lineStyle(uiDim(2), 0x00e5ff, 0.9).strokeRect(x, y, w, h);
  g.lineStyle(uiDim(1), 0xff2bd6, 0.35).strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
}
