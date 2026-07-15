/**
 * Keep the authoritative simulation at 20 Hz while reducing full-state broadcast
 * frequency in crowded zones. Clients interpolate remote entities between snapshots.
 *
 * Reliability-first (2026-07): step down earlier so hub ticks stay under budget when
 * social rooms fill. Paid Workers still handle 20 Hz sim; only the *network* cadence
 * drops so CPU isn't spent JSON-stringifying huge AOI frames.
 */
export function snapshotStride(playerCount: number): number {
  if (playerCount <= 40) return 1; // full 20 Hz — small fights / quiet rooms
  if (playerCount <= 64) return 2; // 10 Hz — busy hub starts here
  if (playerCount <= 100) return 3; // ~6.7 Hz
  if (playerCount <= 160) return 4; // 5 Hz
  return 5; // 4 Hz safety valve
}

export function shouldBroadcastSnapshot(tick: number, playerCount: number): boolean {
  return tick % snapshotStride(playerCount) === 0;
}

/** How often to embed the zone roster (id/faction/level) — rare, large, rarely changes. */
export function shouldIncludeRoster(tick: number): boolean {
  return tick % 20 === 0; // ~1 Hz at 20 Hz sim
}
