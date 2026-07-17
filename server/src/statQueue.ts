/** Consume only the delta values captured before an async persistence batch. */
export function consumeCapturedDeltas(
  live: Record<string, number>,
  captured: ReadonlyArray<readonly [string, number]>,
): void {
  for (const [key, value] of captured) {
    const remaining = (live[key] ?? 0) - value;
    if (remaining) live[key] = remaining;
    else delete live[key];
  }
}

/** Remove the achievement ids acknowledged by the batch, preserving later arrivals. */
export function consumeCapturedAchievements(live: string[], captured: readonly string[]): string[] {
  if (!captured.length) return live;
  const written = new Set(captured);
  return live.filter((id) => !written.has(id));
}

