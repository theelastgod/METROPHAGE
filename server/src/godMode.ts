// Hardcoded operator accounts — full privileges, invulnerable, map unlocked.
// Keep this list short; never ship broad admin tools.

import { getAddress } from "ethers";
import { DISTRICTS } from "../../src/game/districts";
import { BRIDGES } from "../../src/game/bridges";
import { DIVE_ZONE_IDS } from "../../src/world/district";

/** Lowercase EVM addresses with god privileges. */
const GOD_WALLETS = new Set<string>([
  "0x7bf8195c181fbb74d10aed7035c26eca18ea726d",
]);

/** Canonical player id form is `w:<checksummed>` after auth. */
export function isGodPlayerId(id: string | null | undefined): boolean {
  if (!id || typeof id !== "string") return false;
  if (!id.startsWith("w:")) return false;
  try {
    const raw = id.slice(2).trim();
    if (!/^0x[a-fA-F0-9]{40}$/i.test(raw)) return false;
    const checksummed = getAddress(raw).toLowerCase();
    return GOD_WALLETS.has(checksummed);
  } catch {
    return GOD_WALLETS.has(id.slice(2).toLowerCase());
  }
}

/** Every zone the map / fast-travel graph can reference. */
export function allDiscoverableZones(): string[] {
  const zones = new Set<string>([
    "safe",
    "clinic",
    "shop",
    "bar",
    "den",
    "subway",
    "estates",
    "guild",
    "home",
    "tutorial",
  ]);
  for (let i = 0; i < DISTRICTS.length; i++) zones.add("d" + i);
  for (const b of BRIDGES) zones.add(b.id);
  for (const v of DIVE_ZONE_IDS) zones.add(v);
  // Hub building interiors + estate homes (wide net so travel never 404s).
  for (let i = 0; i < 40; i++) {
    zones.add("h" + i);
    zones.add("est" + i);
    zones.add("b" + i);
  }
  return [...zones];
}
