import { VIEW_W, VIEW_H, uiDim } from "../config";

/** Design-space spacing scale — multiply via uiGap() for consistent rhythm. */
export const UI_SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 32,
  block: 40,
  gutter: 48,
} as const;

export type UiSpaceKey = keyof typeof UI_SPACE;

export const uiGap = (key: UiSpaceKey) => uiDim(UI_SPACE[key]);

/** Default line spacing for wrapped body copy. */
export const textLeading = () => uiDim(UI_SPACE.sm);

/** Looser leading for narrative / modal paragraphs. */
export const textLeadingLoose = () => uiDim(UI_SPACE.md);

/** Standard panel interior padding. */
export const panelPad = () => uiDim(UI_SPACE.lg);

/** Tight inset inside chrome frames. */
export const panelPadInner = () => uiDim(UI_SPACE.md);

/** Word-wrap width with symmetric side margins (design px). */
export const wrapWidth = (marginDesign: number = UI_SPACE.gutter) => VIEW_W - uiDim(marginDesign) * 2;

/** Bottom chrome stack for OnlineScene — hotbar, action bar, hints (no overlap).
 *  The footer hint gets its own reserved strip below the bars; the hotbar
 *  (left-anchored) and action bar (right-anchored) share one band. */
export function onlineHudStack(viewH: number = VIEW_H) {
  const hintStrip = uiDim(18);
  const footerPad = uiDim(UI_SPACE.sm);
  const actionH = uiDim(56);
  const actionY = viewH - footerPad - hintStrip - actionH;
  const hotbarCell = uiDim(48);
  const hotbarY = actionY + (actionH - hotbarCell) / 2; // vertically centered in the band
  return {
    footerHintY: viewH - uiDim(UI_SPACE.xs),
    interactY: actionY - uiGap("lg"),
    hotbarY,
    hotbarCell,
    actionY,
    actionH,
  };
}