import Phaser from "phaser";
import { VIEW_W, VIEW_H, uiDim, uiFont } from "../config";
import { GLOW_KEY } from "../assets/manifest";
import { bodyFont } from "./typography";
import { prefersMobileUx } from "../systems/Mobile";

/**
 * Close-instruction text for a modal footer/header.
 * Touch has no ESC key, so on phones we point at the on-screen affordances
 * (the floating ✕ and tap-outside) instead of naming a keyboard shortcut.
 */
export function closeHint(desktopKeys: string): string {
  return prefersMobileUx() ? "tap ✕ or outside to close" : desktopKeys;
}

export { uiDim, uiFont, UI_SCALE } from "../config";
export {
  UI_SPACE,
  uiGap,
  textLeading,
  textLeadingLoose,
  panelPad,
  panelPadInner,
  wrapWidth,
  onlineHudStack,
  type UiSpaceKey,
} from "./spacing";

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

/**
 * Dim full-screen backdrop behind modal panels — radial bloom + vignette.
 *
 * When `onClose` is supplied the container itself becomes an interactive
 * full-screen catcher at the backdrop's own depth. Panel content is drawn ABOVE
 * it (depth+1…+3) so buttons hit first; only a tap on the empty dimmed area
 * outside the card dismisses — native tap-outside-to-close on touch.
 */
export function dimBackdrop(
  scene: Phaser.Scene,
  depth: number,
  alpha = 0.62,
  onClose?: () => void,
  accent = 0x00e5ff,
) {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
  g.fillStyle(0x020108, alpha).fillRect(0, 0, VIEW_W, VIEW_H);
  g.fillStyle(0x000000, 0.28).fillRect(0, 0, VIEW_W, uiDim(80));
  g.fillStyle(0x000000, 0.22).fillRect(0, VIEW_H - uiDim(90), VIEW_W, uiDim(90));
  const bloom = scene.add
    .image(VIEW_W / 2, VIEW_H / 2, GLOW_KEY)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(accent)
    .setScale(VIEW_W / 120, VIEW_H / 90)
    .setAlpha(0.045)
    .setScrollFactor(0)
    .setDepth(depth + 0.1);
  const container = scene.add.container(0, 0, [g, bloom]).setScrollFactor(0).setDepth(depth);
  if (onClose) {
    container.setSize(VIEW_W, VIEW_H);
    // Hit area is in the container's local space; container sits at (0,0) so local == world.
    container.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, VIEW_W, VIEW_H),
      Phaser.Geom.Rectangle.Contains,
    );
    container.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      onClose();
    });
  }
  return container;
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
      fontFamily: bodyFont(12).fontFamily,
      fontSize: uiFont(sizeDesign),
      color,
      fontStyle: opts.bold ? "bold" : "normal",
    })
    .setOrigin(opts.origin ?? 0, 0)
    .setScrollFactor(0)
    .setDepth(opts.depth ?? 1702);
}