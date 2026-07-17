// Shared civic archive-terminal geometry and rules. Phaser-free: client renders
// these offsets while the authoritative Worker validates the same positions.

export const HUB_DATA_TERMINAL_COOLDOWN_MS = 5 * 60_000;
export const HUB_DATA_TERMINAL_RANGE = 72;

export const HUB_DATA_TERMINALS = [
  { id: 0, dx: -2, dy: 2, name: "CASUALTY INDEX", archive: "names the city was paid to forget" },
  { id: 1, dx: 2, dy: 6, name: "TRANSIT GHOSTS", archive: "trains removed from the public timetable" },
  { id: 2, dx: -4, dy: 8, name: "EVICTION HASH", archive: "homes converted into clean ledger entries" },
] as const;

export function terminalCooldownRemaining(lastAt: number, now: number): number {
  if (!Number.isFinite(lastAt) || lastAt <= 0) return 0;
  return Math.max(0, HUB_DATA_TERMINAL_COOLDOWN_MS - Math.max(0, now - lastAt));
}
