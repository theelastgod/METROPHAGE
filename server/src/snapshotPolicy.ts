/**
 * Keep the authoritative simulation at 20 Hz while reducing full-state broadcast
 * frequency in crowded zones. Clients interpolate remote entities between snapshots.
 *
 * Thresholds raised for Workers Paid ($5): free-tier was conservative at 64 full-rate;
 * Paid DO request/CPU budget comfortably holds ~100 concurrent players at full 20 Hz
 * per zone with compact remote snapshots.
 */
export function snapshotStride(playerCount: number): number {
  if (playerCount <= 100) return 1; // up to 20 Hz — social hub + multi-party fights
  if (playerCount <= 180) return 2; // up to 10 Hz
  if (playerCount <= 300) return 3; // up to ~6.7 Hz
  return 4; // up to 5 Hz safety valve for exceptional crowds
}

export function shouldBroadcastSnapshot(tick: number, playerCount: number): boolean {
  return tick % snapshotStride(playerCount) === 0;
}
