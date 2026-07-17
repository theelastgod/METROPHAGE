/**
 * Higgsfield cutouts arrive at several unrelated canvas sizes (typically 72–384px).
 * Raw Phaser scale therefore makes two props with the same intended footprint differ
 * by 5x. Treat `requestedScale` as a multiplier around a reference canvas and cap only
 * generated cutouts; hand-authored pixel assets retain their native scale.
 */
export function generatedAssetScale(
  key: string,
  width: number,
  height: number,
  requestedScale: number,
  referencePx = 96,
): number {
  if (!key.startsWith("hf_")) return requestedScale;
  const longest = Math.max(1, width || 0, height || 0);
  return requestedScale * Math.min(1, referencePx / longest);
}

/** Large authored structures may span several tiles; loose props should not. */
export function generatedReferencePx(key: string): number {
  if (
    key.includes("platform") ||
    key.includes("ticket_hall") ||
    key.includes("train_") ||
    key.includes("track_bay") ||
    key.includes("apron") ||
    key.includes("escalator") ||
    key.includes("bridge_span") ||
    key.includes("landmark")
  ) return 160;
  return 96;
}
