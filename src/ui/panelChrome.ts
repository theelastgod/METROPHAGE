import Phaser from "phaser";
import { COLORS } from "../config";
import { uiDim } from "./uiLayout";

/** HUD / radar corner brackets — unified studio chrome. */
export function drawCornerBrackets(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  alpha = 0.9,
  len = uiDim(12),
) {
  const t = uiDim(2);
  g.lineStyle(t, color, alpha);
  g.beginPath();
  g.moveTo(x, y + len);
  g.lineTo(x, y);
  g.lineTo(x + len, y);
  g.strokePath();
  g.beginPath();
  g.moveTo(x + w - len, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w, y + len);
  g.strokePath();
  g.beginPath();
  g.moveTo(x, y + h - len);
  g.lineTo(x, y + h);
  g.lineTo(x + len, y + h);
  g.strokePath();
  g.beginPath();
  g.moveTo(x + w - len, y + h);
  g.lineTo(x + w, y + h);
  g.lineTo(x + w, y + h - len);
  g.strokePath();
}

/** Shared menu-panel frame — glass depth, header wash, dual rim. */
export function drawPanelFrame(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  accent = COLORS.neonCyan,
) {
  const inset = uiDim(6);
  g.fillStyle(0x04030c, 0.97).fillRect(x, y, w, h);
  g.fillStyle(0x0c1224, 0.42).fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  g.fillStyle(accent, 0.055).fillRect(x + inset, y + inset, w - inset * 2, uiDim(26));
  g.fillStyle(0x000000, 0.22).fillRect(x + inset, y + h - uiDim(52), w - inset * 2, uiDim(48));
  g.lineStyle(uiDim(2), accent, 0.92).strokeRect(x, y, w, h);
  g.lineStyle(uiDim(1), COLORS.neonMagenta, 0.32).strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  g.lineStyle(1, 0xffffff, 0.06).strokeRect(x + uiDim(2), y + uiDim(2), w - uiDim(4), h - uiDim(4));
  drawCornerBrackets(g, x, y, w, h, accent, 0.88);
}

/** Compact HUD panel with brackets + inner scanline accent. */
export function drawHudPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, accent: number = COLORS.neonCyan) {
  g.fillStyle(0x05040e, 0.82).fillRect(x, y, w, h);
  g.fillStyle(accent, 0.035).fillRect(x + uiDim(4), y + uiDim(4), w - uiDim(8), uiDim(14));
  g.fillStyle(0x00e5ff, 0.035);
  for (let ly = y + uiDim(8); ly < y + h - uiDim(4); ly += uiDim(5)) {
    g.fillRect(x + uiDim(6), ly, w - uiDim(12), 1);
  }
  g.lineStyle(uiDim(2), accent, 0.9).strokeRect(x, y, w, h);
  g.lineStyle(uiDim(1), COLORS.neonMagenta, 0.34).strokeRect(x + uiDim(3), y + uiDim(3), w - uiDim(6), h - uiDim(6));
  drawCornerBrackets(g, x, y, w, h, COLORS.neonMagenta, 0.92, uiDim(10));
}

/** Gradient-filled status bar with specular lip. */
export function drawPremiumBar(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  norm: number,
  color: number,
  tickAt50 = false,
) {
  const fill = Math.max(0, (w - 2) * Phaser.Math.Clamp(norm, 0, 1));
  g.fillStyle(0x0a0818, 0.94).fillRect(x, y, w, h);
  g.fillStyle(0x14102a, 0.55).fillRect(x + 1, y + 1, w - 2, h - 2);
  if (fill > 0) {
    g.fillStyle(color, 1).fillRect(x + 1, y + 1, fill, h - 2);
    g.fillStyle(0xffffff, 0.22).fillRect(x + 1, y + 1, fill, Math.max(1, Math.floor((h - 2) * 0.35)));
    g.fillStyle(color, 0.45).fillRect(x + 1, y + h - 3, fill, 1);
  }
  g.lineStyle(1, color, 0.35).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (tickAt50) g.fillStyle(COLORS.neonCyan, 0.85).fillRect(x + w * 0.5, y - 1, 1, h + 2);
}