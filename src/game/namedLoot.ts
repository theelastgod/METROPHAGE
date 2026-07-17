// METROPHAGE — city uniques / named drops (rare roll on high-rarity loot).
// Pure data; server uses when rolling kill loot at blackice+.

import type { Item, Rarity } from "./items";
import { rollModsFor } from "./items";
import type { Slot } from "./items";
import { getWeapon } from "./weapons";

export interface NamedLootDef {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  weaponId?: string;
  /** Weight among uniques. */
  weight: number;
  blurb: string;
}

export const NAMED_LOOT: NamedLootDef[] = [
  { id: "neon_requiem", name: "NEON REQUIEM", slot: "weapon", rarity: "singular", weaponId: "needler", weight: 1, blurb: "Plays a funeral for the grid." },
  { id: "plaza_oath", name: "PLAZA OATH", slot: "armor", rarity: "blackice", weight: 2, blurb: "Sworn under Palantir rain." },
  { id: "fixer_favor", name: "FIXER'S FAVOR", slot: "chip", rarity: "blackice", weight: 2, blurb: "They only give this once." },
  { id: "blank_pulse", name: "BLANK PULSE", slot: "implant", rarity: "singular", weight: 1, blurb: "Heartbeat of the unowned." },
  { id: "dock_harpoon", name: "DOCK HARPOON", slot: "weapon", rarity: "blackice", weaponId: "breacher", weight: 2, blurb: "Pierced a leviathan once." },
  { id: "stack_welder", name: "STACK WELDER", slot: "chip", rarity: "tuned", weight: 3, blurb: "Anduril scrap, still hot." },
  { id: "metro_ghost", name: "METRO GHOST", slot: "weapon", rarity: "blackice", weaponId: "sting", weight: 2, blurb: "Fires quieter than guilt." },
  { id: "kernel_shard", name: "KERNEL SHARD", slot: "implant", rarity: "singular", weight: 1, blurb: "A piece of the oldest cage." },
];

let counter = 0;

/** Chance to upgrade a high-rarity drop into a named unique (0..1). */
export function maybeNamedLoot(base: Item, level: number, forceChance?: number): Item {
  const chance = forceChance ?? (base.rarity === "singular" ? 0.22 : base.rarity === "blackice" ? 0.08 : 0);
  if (Math.random() >= chance) return base;
  const pool = NAMED_LOOT.filter((n) => n.rarity === base.rarity || (base.rarity === "singular" && n.rarity !== "tuned"));
  if (!pool.length) return base;
  const total = pool.reduce((s, n) => s + n.weight, 0);
  let r = Math.random() * total;
  let pick = pool[0];
  for (const n of pool) {
    r -= n.weight;
    if (r <= 0) {
      pick = n;
      break;
    }
  }
  // Never emit below the drop that triggered the roll. This is an upgrade (see the
  // docstring), but the singular pool deliberately widens to blackice entries for
  // variety — and taking the entry's own rarity turned ~3 of every 4 triggered Singular
  // rolls into a strictly worse item than the drop the player had already earned.
  const rarity: Rarity = base.rarity === "singular" ? "singular" : pick.rarity;
  const mods = rollModsFor(pick.slot, rarity, level + 1);
  mods.dmgPct = Math.max(mods.dmgPct ?? 0, pick.slot === "weapon" ? 0.1 : 0);
  return {
    id: `uniq_${++counter}_${Math.random().toString(36).slice(2, 7)}`,
    name: pick.name,
    slot: pick.slot,
    rarity,
    mods,
    weaponId: pick.weaponId ?? (pick.slot === "weapon" ? base.weaponId : undefined),
    ilvl: Math.min(3, base.ilvl ?? 0),
  };
}

export function namedLootBlurb(name: string): string | undefined {
  return NAMED_LOOT.find((n) => n.name === name)?.blurb;
}

/** Ensure weaponId still maps for named weapons. */
export function namedWeaponLabel(it: Item): string {
  if (it.weaponId) return getWeapon(it.weaponId)?.name ?? it.name;
  return it.name;
}
