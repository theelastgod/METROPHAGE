import Phaser from "phaser";

/** Shared menu-panel frame so Skill/Inventory/Contract/Vendor look consistent. */
export function drawPanelFrame(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  g.fillStyle(0x07061a, 0.96).fillRect(x, y, w, h);
  g.lineStyle(2, 0x00e5ff, 0.9).strokeRect(x, y, w, h);
  g.lineStyle(1, 0xff2bd6, 0.35).strokeRect(x + 4, y + 4, w - 8, h - 8);
}
