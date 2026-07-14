// METROPHAGE — gear forge: the pure-data cost curves + rules for the upgrade/reforge/
// fuse/salvage loop. Phaser-FREE; imported by BOTH client (cost preview) and server
// (authoritative validation). The server owns every mutation + currency move; this file
// only says what a thing COSTS and whether it's legal.

import type { Item, Rarity } from "./items";
import { rarityRank, nextRarity } from "./items";

/** Hard cap on the item-level treadmill — keeps effective mods bounded. */
export const UPGRADE_MAX = 10;

/** Rarity drives every forge cost (a Singular costs far more to push than a Standard). */
const RARITY_MULT: Record<Rarity, number> = { standard: 1, tuned: 1.7, blackice: 2.8, singular: 4.2 };

export interface Cost {
  credits: number;
  cores: number;
}

/** UPGRADE — +1 item level (scales effective mods). Cost climbs with current level + rarity. */
export function upgradeCost(item: Item): Cost {
  const lvl = item.ilvl ?? 0;
  const m = RARITY_MULT[item.rarity];
  // ~40% higher than launch curve so forge is a real sink vs kill emit.
  return {
    credits: Math.round(74 * (lvl + 1) * m),
    cores: 1 + Math.floor(lvl / 3) + Math.floor(rarityRank(item.rarity) / 2),
  };
}
export function canUpgrade(item: Item): boolean {
  return (item.ilvl ?? 0) < UPGRADE_MAX;
}

/** REFORGE — gamble: re-roll an item's mod lines (same slot+rarity), keeping its level. */
export function reforgeCost(item: Item): Cost {
  const m = RARITY_MULT[item.rarity];
  return { credits: Math.round(105 * m), cores: 1 + rarityRank(item.rarity) };
}

/** SALVAGE — break an item down for cores + a few credits (cleanup; not a faucet). */
export function salvageYield(item: Item): Cost {
  const rank = rarityRank(item.rarity);
  const lvl = item.ilvl ?? 0;
  return {
    cores: 1 + rank + Math.floor(lvl / 3),
    // Credits returned are intentionally low so salvage is a core path, not re-emit.
    credits: Math.round((4 + rank * 7) * (1 + lvl * 0.08)),
  };
}

/** FUSE — combine two SAME-rarity items into one of the next rarity up (consumes both). */
export function canFuse(a: Item, b: Item): boolean {
  return !!a && !!b && a.id !== b.id && a.rarity === b.rarity && nextRarity(a.rarity) !== null;
}
export function fuseCost(a: Item): Cost {
  const m = RARITY_MULT[a.rarity];
  return { credits: Math.round(300 * m), cores: 5 + rarityRank(a.rarity) * 2 };
}
