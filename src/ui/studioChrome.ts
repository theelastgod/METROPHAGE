import Phaser from "phaser";
import { COLORS } from "../config";
import { GLOW_KEY } from "../assets/manifest";
import { drawCornerBrackets } from "./panelChrome";
import { uiDim } from "./uiLayout";
import { bodyFont, displayFont } from "./typography";

/** Shared palette for expansion UI — wallet, market, PvP, $METRO bridge. */
export const STUDIO = {
  ink: "#eafdff",
  muted: "#9aa3b2",
  dim: "#5a6172",
  void: "#07061a",
  credits: "#f7ff3c",
  metro: "#ff2bd6",
  ready: "#39ff88",
  danger: "#ff3b6b",
};

export function hexColor(c: number) {
  return "#" + c.toString(16).padStart(6, "0");
}

export function drawScanlines(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color = 0x00e5ff,
  alpha = 0.028,
) {
  g.fillStyle(color, alpha);
  for (let ly = y; ly < y + h; ly += uiDim(4)) g.fillRect(x, ly, w, 1);
}

/** Ambient bloom behind a modal — tinted by feature accent. */
export function addPanelGlow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  tint: number,
  alpha = 0.12,
): Phaser.GameObjects.Image {
  return scene.add
    .image(x + w / 2, y + h / 2, GLOW_KEY)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(tint)
    .setScale(w / 88, h / 66)
    .setAlpha(alpha);
}

/** Standard open animation for studio modals. */
export function animatePanelIn(scene: Phaser.Scene, targets: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]) {
  const list = Array.isArray(targets) ? targets : [targets];
  for (const t of list) {
    if ("setAlpha" in t && typeof t.setAlpha === "function") t.setAlpha(0);
    if ("setScale" in t && typeof t.setScale === "function") t.setScale(0.97);
  }
  scene.tweens.add({ targets: list, alpha: 1, scale: 1, duration: 280, ease: "Back.out" });
}

export interface StudioHeaderOpts {
  subtitle?: string;
  accent?: number;
  rightLabel?: string;
}

/** Title band used by World Market, Identity Gate, and other expansion panels. */
export function drawStudioHeaderBand(
  g: Phaser.GameObjects.Graphics,
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  title: string,
  opts: StudioHeaderOpts = {},
  add?: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
): number {
  const accent = opts.accent ?? COLORS.neonCyan;
  const bandH = uiDim(54);
  g.fillStyle(0x120a24, 0.94).fillRect(x + uiDim(8), y + uiDim(4), w - uiDim(16), bandH);
  g.lineStyle(1, accent, 0.42).lineBetween(x + uiDim(18), y + bandH + uiDim(4), x + w - uiDim(18), y + bandH + uiDim(4));
  g.fillStyle(accent, 0.5).fillRect(x + uiDim(8), y + uiDim(14), uiDim(3), bandH - uiDim(20));

  const push = add ?? ((o) => o);
  push(
    scene.add
      .text(x + uiDim(22), y + uiDim(14), title, displayFont(18, { color: hexColor(accent), fontStyle: "bold" }))
      .setOrigin(0, 0)
      .setShadow(0, 0, hexColor(accent), 4, true, true),
  );
  if (opts.subtitle) {
    push(
      scene.add
        .text(x + uiDim(22), y + uiDim(36), opts.subtitle, bodyFont(10, { color: STUDIO.dim }))
        .setOrigin(0, 0),
    );
  }
  if (opts.rightLabel) {
    push(
      scene.add
        .text(x + w - uiDim(22), y + uiDim(18), opts.rightLabel, bodyFont(10, { color: STUDIO.dim }))
        .setOrigin(1, 0),
    );
  }
  return y + bandH + uiDim(10);
}

export interface StudioTab {
  id: string;
  label: string;
  color: number;
}

/** Segmented tab row — returns y after tabs. */
export function drawStudioTabs(
  g: Phaser.GameObjects.Graphics,
  scene: Phaser.Scene,
  x: number,
  y: number,
  tabs: StudioTab[],
  activeId: string,
  tabW: number,
  onPick: (id: string) => void,
  add: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
  depth: number,
  btnH = uiDim(28),
): number {
  tabs.forEach((t, i) => {
    const bx = x + i * (tabW + uiDim(6));
    const active = t.id === activeId;
    g.fillStyle(active ? 0x1a1230 : 0x0e0c1c, 0.96).fillRoundedRect(bx, y, tabW, btnH, 4);
    g.lineStyle(uiDim(1.2), t.color, active ? 1 : 0.38).strokeRoundedRect(bx, y, tabW, btnH, 4);
    add(
      scene.add
        .text(bx + tabW / 2, y + uiDim(8), t.label, bodyFont(10, { color: active ? STUDIO.ink : STUDIO.dim, fontStyle: active ? "bold" : "normal" }))
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(depth + 2),
    );
    const z = add(
      scene.add
        .zone(bx, y, tabW, btnH)
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .setDepth(depth + 3),
    );
    z.on("pointerdown", () => onPick(t.id));
  });
  return y + btnH + uiDim(10);
}

export interface StudioBtnOpts {
  x: number;
  y: number;
  w: number;
  h?: number;
  label: string;
  color: number;
  enabled: boolean;
  primary?: boolean;
  onClick: () => void;
}

/** Rounded action chip with hover — returns zone for optional external tracking. */
export function drawStudioBtn(
  g: Phaser.GameObjects.Graphics,
  scene: Phaser.Scene,
  opts: StudioBtnOpts,
  add: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
  depth: number,
): Phaser.GameObjects.Zone | undefined {
  const { x, y, w, label, color, enabled, onClick } = opts;
  const h = opts.h ?? uiDim(26);
  const primary = opts.primary ?? true;
  g.fillStyle(enabled ? (primary ? color : 0x0e0c1c) : 0x0a0818, enabled ? (primary ? 0.28 : 0.9) : 0.96).fillRoundedRect(x, y, w, h, 4);
  g.lineStyle(uiDim(primary ? 1.4 : 1), color, enabled ? 0.95 : 0.28).strokeRoundedRect(x, y, w, h, 4);
  add(
    scene.add
      .text(x + w / 2, y + h / 2, label, bodyFont(10, { color: enabled ? STUDIO.ink : STUDIO.dim, fontStyle: "bold" }))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(depth + 2),
  );
  if (!enabled) return undefined;
  const z = add(
    scene.add.zone(x, y, w, h).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(depth + 3),
  );
  z.on("pointerover", () => g.lineStyle(uiDim(2), color, 1).strokeRoundedRect(x, y, w, h, 4));
  z.on("pointerout", () => g.lineStyle(uiDim(primary ? 1.4 : 1), color, 0.95).strokeRoundedRect(x, y, w, h, 4));
  z.on("pointerdown", onClick);
  return z;
}

/** List row card with rarity accent — returns bottom y. */
export function drawStudioListCard(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: number,
  metro = false,
) {
  g.fillStyle(0x12102a, 0.92).fillRoundedRect(x, y, w, h, 4);
  g.lineStyle(uiDim(1.4), metro ? COLORS.neonMagenta : accent, 0.92).strokeRoundedRect(x, y, w, h, 4);
  if (metro) {
    g.fillStyle(COLORS.neonMagenta, 0.06).fillRoundedRect(x + uiDim(2), y + uiDim(2), w - uiDim(4), h - uiDim(4), 3);
  }
}

/** Compact HUD chip — Crucible tag, currency pill, etc. */
export function drawStudioChip(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: number,
) {
  g.fillStyle(0x07061a, 0.88).fillRoundedRect(x, y, w, h, 5);
  g.lineStyle(1, accent, 0.75).strokeRoundedRect(x, y, w, h, 5);
  drawCornerBrackets(g, x, y, w, h, accent, 0.55, uiDim(8));
}

/** Hub operative nameplate above plaza NPCs. */
export function drawHubNpcPlate(
  scene: Phaser.Scene,
  px: number,
  py: number,
  name: string,
  tag: string,
  color: number,
  depth = 9,
) {
  const hex = hexColor(color);
  scene.add
    .text(px, py - uiDim(30), name, displayFont(10, { color: STUDIO.ink, fontStyle: "bold" }))
    .setOrigin(0.5)
    .setDepth(depth)
    .setShadow(0, 0, "#000000", 4, true, true);
  scene.add
    .text(px, py + uiDim(22), `▸ ${tag}`, bodyFont(9, { color: hex }))
    .setOrigin(0.5)
    .setDepth(depth);
}