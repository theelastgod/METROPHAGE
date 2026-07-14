// METROPHAGE — per-boss signature loot (pure data, server + client display).
// Guaranteed flavor drop on world-boss kill, on top of the normal rarity roll.

import type { Item, Rarity } from "./items";
import { rollModsFor } from "./items";
import type { Slot } from "./items";
import { getWeapon, WEAPON_IDS } from "./weapons";

export interface BossLootSpec {
  /** Boss name substring match (uppercase). */
  match: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  weaponId?: string;
  /** Flavor line shown on drop. */
  blurb: string;
}

export const BOSS_SIGNATURE_LOOT: BossLootSpec[] = [
  { match: "GUTTER KING", name: "RAT-KING BLADE", slot: "weapon", rarity: "blackice", weaponId: "arcblade", blurb: "Still warm with alley heat." },
  { match: "ANDURIL", name: "SENTINEL RAIL", slot: "weapon", rarity: "blackice", weaponId: "railgun", blurb: "Lock-on still pings in the chassis." },
  { match: "PALANTIR", name: "ORACLE LENS", slot: "implant", rarity: "blackice", blurb: "It saw this drop coming." },
  { match: "TIDAL", name: "LEVIATHAN PLATE", slot: "armor", rarity: "blackice", blurb: "Salt-scored and heavy." },
  { match: "THE MAW", name: "MAW-TOOTH CHIP", slot: "chip", rarity: "singular", blurb: "It wants to be fed again." },
  { match: "SKYLINK", name: "BEACON CHIP", slot: "chip", rarity: "blackice", blurb: "Uplink residue still sings." },
  { match: "SCRAP SOVEREIGN", name: "YARD KING PLATING", slot: "armor", rarity: "blackice", blurb: "Welded from a thousand failures." },
  { match: "HELIOS", name: "WARDEN SEAL", slot: "implant", rarity: "singular", blurb: "Solar gold under the grime." },
  { match: "VOID HERALD", name: "VOID HYMN", slot: "weapon", rarity: "singular", weaponId: "needler", blurb: "It hums in a language without owners." },
];

let counter = 0;

/** Build a signature item for a world-boss display name, or null if no match. */
export function rollBossSignature(bossName: string | undefined, level = 1): Item | null {
  if (!bossName) return null;
  const up = bossName.toUpperCase();
  const spec = BOSS_SIGNATURE_LOOT.find((s) => up.includes(s.match));
  if (!spec) return null;
  const mods = rollModsFor(spec.slot, spec.rarity, level + 2);
  // Boss pieces lean into combat stats.
  if (spec.slot === "weapon") {
    mods.dmgPct = Math.max(mods.dmgPct ?? 0, 0.12 + level * 0.004);
    mods.critPct = Math.max(mods.critPct ?? 0, 0.06);
  } else if (spec.slot === "armor") {
    mods.shieldAdd = Math.max(mods.shieldAdd ?? 0, 18 + level);
  } else if (spec.slot === "implant") {
    mods.hpAdd = Math.max(mods.hpAdd ?? 0, 12 + level);
  }
  let weaponId = spec.weaponId;
  if (spec.slot === "weapon" && !weaponId) {
    weaponId = WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)];
  }
  const wName = weaponId ? getWeapon(weaponId)?.name : undefined;
  return {
    id: `boss_${++counter}_${Math.random().toString(36).slice(2, 7)}`,
    name: spec.name + (wName && !spec.name.includes(wName) ? "" : ""),
    slot: spec.slot,
    rarity: spec.rarity,
    mods,
    weaponId,
    ilvl: Math.min(4, Math.floor(level / 5)),
  };
}

export function bossLootBlurb(bossName: string | undefined): string | undefined {
  if (!bossName) return undefined;
  const up = bossName.toUpperCase();
  return BOSS_SIGNATURE_LOOT.find((s) => up.includes(s.match))?.blurb;
}
