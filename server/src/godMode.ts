// Hardcoded operator accounts — full privileges, invulnerable, map unlocked.
// Address list lives in shared src/net/godAccounts.ts (client + server).

import { DISTRICTS } from "../../src/game/districts";
import { BRIDGES } from "../../src/game/bridges";
import { DIVE_ZONE_IDS } from "../../src/world/district";
import { isGodAccount, normalizeWalletAddress } from "../../src/net/godAccounts";

export { isGodAccount as isGodPlayerId, normalizeWalletAddress };

/**
 * Zones the map graph cares about for fast travel.
 * Keep this tight — used for client unlock AND optional D1 seeding.
 */
export function allDiscoverableZones(): string[] {
  const zones = new Set<string>([
    "safe",
    "clinic",
    "shop",
    "bar",
    "den",
    "subway",
    "estates",
  ]);
  for (let i = 0; i < DISTRICTS.length; i++) zones.add("d" + i);
  for (const b of BRIDGES) zones.add(b.id);
  for (const v of DIVE_ZONE_IDS) zones.add(v);
  return [...zones];
}
