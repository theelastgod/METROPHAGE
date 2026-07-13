/**
 * Keep the authoritative simulation at 20 Hz while reducing full-state broadcast
 * frequency in crowded zones. Clients interpolate remote entities between snapshots.
 */
export function snapshotStride(playerCount: number): number {
  // Compact remote payloads keep normal social-hub crowds affordable at full
  // cadence. Step down only once a single zone exceeds 64 concurrent players.
  if (playerCount <= 64) return 1; // up to 20 Hz
  if (playerCount <= 128) return 2; // up to 10 Hz
  if (playerCount <= 256) return 3; // up to ~6.7 Hz
  return 4; // up to 5 Hz safety valve for exceptional crowds
}

export function shouldBroadcastSnapshot(tick: number, playerCount: number): boolean {
  return tick % snapshotStride(playerCount) === 0;
}
