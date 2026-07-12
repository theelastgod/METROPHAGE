import Phaser from "phaser";
import { COLORS } from "../config";
import { UI_PANEL_KEY } from "../assets/manifest";
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

/**
 * Shared menu-panel frame — glass depth, header wash, dual rim.
 * When the painted Higgsfield HUD panel texture is loaded, a NineSlice copy is
 * placed behind the graphics chrome so title / options / wallet modals share the
 * same art as the in-game HUD (desktop + mobile sizes).
 *
 * Pass `scene` + optional `existing` to reuse/resize the NineSlice across redraws.
 */
export function drawPanelFrame(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: number = COLORS.neonCyan,
  scene?: Phaser.Scene,
  existing?: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image | null,
): Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image | null {
  let art: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image | null = null;
  if (scene) {
    art = ensureHudPanelImage(scene, existing ?? null, x, y, w, h, (g.depth || 0) - 0.1, 0xffffff);
    if (art) {
      // Dark glass fill under the neon frame so text stays readable.
      g.fillStyle(0x04030c, 0.82).fillRect(x + uiDim(10), y + uiDim(10), w - uiDim(20), h - uiDim(20));
      g.fillStyle(accent, 0.05).fillRect(x + uiDim(12), y + uiDim(12), w - uiDim(24), uiDim(28));
      return art;
    }
  }
  const inset = uiDim(6);
  g.fillStyle(0x04030c, 0.97).fillRect(x, y, w, h);
  g.fillStyle(0x0c1224, 0.42).fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  g.fillStyle(accent, 0.055).fillRect(x + inset, y + inset, w - inset * 2, uiDim(26));
  g.fillStyle(0x000000, 0.22).fillRect(x + inset, y + h - uiDim(52), w - inset * 2, uiDim(48));
  g.lineStyle(uiDim(2), accent, 0.92).strokeRect(x, y, w, h);
  g.lineStyle(uiDim(1), COLORS.neonMagenta, 0.32).strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  g.lineStyle(1, 0xffffff, 0.06).strokeRect(x + uiDim(2), y + uiDim(2), w - uiDim(4), h - uiDim(4));
  drawCornerBrackets(g, x, y, w, h, accent, 0.88);
  return art;
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

/**
 * Place (or resize) a painted Higgsfield HUD panel behind chrome.
 * Falls back to `drawHudPanel` graphics when the texture isn't loaded.
 * Uses NineSlice so the neon frame stays crisp on desktop and mobile sizes.
 */
export function ensureHudPanelImage(
  scene: Phaser.Scene,
  existing: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image | null | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  depth = 999,
  tint = 0xffffff,
): Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image | null {
  if (!scene.textures.exists(UI_PANEL_KEY)) return null;
  if (existing && (!existing.scene || !existing.active)) existing = null;
  const min = Math.max(w, h, 1);
  // NineSlice needs a source large enough for left/right/top/bottom slices.
  const slice = Math.min(48, Math.floor(Math.min(w, h) * 0.28));
  if (existing && "setSize" in existing && typeof (existing as Phaser.GameObjects.NineSlice).setSize === "function") {
    const ns = existing as Phaser.GameObjects.NineSlice;
    ns.setPosition(x + w / 2, y + h / 2);
    ns.setSize(Math.max(w, slice * 2 + 4), Math.max(h, slice * 2 + 4));
    ns.setTint(tint);
    ns.setVisible(true);
    return ns;
  }
  if (existing) existing.destroy();
  try {
    const ns = scene.add
      .nineslice(x + w / 2, y + h / 2, UI_PANEL_KEY, undefined, Math.max(w, slice * 2 + 4), Math.max(h, slice * 2 + 4), slice, slice, slice, slice)
      .setScrollFactor(0)
      .setDepth(depth)
      .setTint(tint)
      .setAlpha(0.92);
    return ns;
  } catch {
    // Older path / odd texture dims — stretch as Image.
    const img = scene.add
      .image(x + w / 2, y + h / 2, UI_PANEL_KEY)
      .setDisplaySize(Math.max(w, min * 0.5), Math.max(h, min * 0.5))
      .setScrollFactor(0)
      .setDepth(depth)
      .setTint(tint)
      .setAlpha(0.9);
    return img;
  }
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
