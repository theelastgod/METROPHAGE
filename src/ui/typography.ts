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

export interface FitTextOptions {
  minScale?: number;
  ellipsis?: string;
}

/** Keep single-line UI labels inside fixed chrome without surprising layout shifts. */
export function setFittedText<T extends Phaser.GameObjects.Text>(
  text: T,
  value: string,
  maxWidth: number,
  opts: FitTextOptions = {},
): T {
  const width = Math.max(0, maxWidth);
  const minScale = opts.minScale ?? 0.78;
  const ellipsis = opts.ellipsis ?? "...";
  text.setScale(1, 1).setText(value);
  if (!Number.isFinite(width) || width <= 0 || text.width <= width) return text;

  const scale = Math.max(minScale, Math.min(1, width / Math.max(1, text.width)));
  text.setScale(scale, scale);
  if (text.width * scale <= width || !ellipsis) return text;

  const allowedSourceWidth = width / scale;
  let lo = 0;
  let hi = value.length;
  let best = ellipsis;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = value.slice(0, mid).trimEnd() + ellipsis;
    text.setText(candidate);
    if (text.width <= allowedSourceWidth) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  text.setText(best);
  return text;
}

export function fitTextToWidth<T extends Phaser.GameObjects.Text>(
  text: T,
  maxWidth: number,
  opts: FitTextOptions = {},
): T {
  return setFittedText(text, String(text.text), maxWidth, opts);
}
