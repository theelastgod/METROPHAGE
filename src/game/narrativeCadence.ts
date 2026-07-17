/** Deterministically rotate all available persistent dialogue contexts. */
export function rotatingContextLine(lines: readonly (string | null | undefined)[], index: number): string | null {
  const available = lines.filter((line): line is string => typeof line === "string" && line.length > 0);
  if (!available.length) return null;
  const at = ((Math.floor(index) % available.length) + available.length) % available.length;
  return available[at];
}
