import type Phaser from "phaser";
import { uiDim as baseUiDim, UI_SCALE } from "../config";
import { uiScaleFactor } from "../systems/Settings";
import { textLeading, textLeadingLoose } from "./spacing";

/** Layout helpers scaled by the user's UI text size preference. */
export const uiDim = (px: number) => Math.round(baseUiDim(px) * uiScaleFactor());
export const uiFont = (px: number) => `${Math.round(baseUiDim(px) * uiScaleFactor())}px`;
export { UI_SCALE };

/** Premium indie type stack — display for brand, mono for data/HUD. */
export const FONT_DISPLAY = '"Orbitron", "Courier New", monospace';
export const FONT_BODY = '"IBM Plex Mono", "Courier New", monospace';
export const FONT_HUD = FONT_BODY;

function withLeading(
  base: Phaser.Types.GameObjects.Text.TextStyle,
  extra: Phaser.Types.GameObjects.Text.TextStyle,
  loose: boolean,
): Phaser.Types.GameObjects.Text.TextStyle {
  if (extra.lineSpacing !== undefined) return { ...base, ...extra };
  if (extra.wordWrap) return { ...base, ...extra, lineSpacing: loose ? textLeadingLoose() : textLeading() };
  return { ...base, ...extra };
}

export function displayFont(px: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) {
  return withLeading({ fontFamily: FONT_DISPLAY, fontSize: uiFont(px) }, extra, true);
}

export function bodyFont(px: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) {
  return withLeading({ fontFamily: FONT_BODY, fontSize: uiFont(px) }, extra, false);
}

export function hudFont(px: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) {
  return withLeading({ fontFamily: FONT_HUD, fontSize: uiFont(px) }, extra, false);
}