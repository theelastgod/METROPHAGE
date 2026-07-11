// METROPHAGE — gear: data-driven items, rarities, and rarity-weighted generation.
// Item mods feed the same ModBag pipeline as skills (game/stats.ts).

import type { ModBag } from "./stats";
import { WEAPON_IDS, getWeapon, weaponDamageLine } from "./weapons";

export type Slot = "weapon" | "implant" | "armor" | "chip";
export const SLOTS: Slot[] = ["weapon", "implant", "armor", "chip"];
export const SLOT_NAMES: Record<Slot, string> = {
  weapon: "WEAPON-MOD",
  implant: "IMPLANT",
  armor: "ARMOR",
  chip: "CHIP",
};

export type Rarity = "standard" | "tuned" | "blackice" | "singular";

export interface RarityDef {
  id: Rarity;
  name: string;
  color: number;
  hex: string;
  budget: number; // stat budget multiplier
  lines: [number, number]; // min/max stat lines
  weight: number; // base drop weight
}

export const RARITIES: Record<Rarity, RarityDef> = {
  standard: { id: "standard", name: "Standard", color: 0x9aa3b2, hex: "#9aa3b2", budget: 1, lines: [1, 1], weight: 62 },
  tuned: { id: "tuned", name: "Tuned", color: 0x39ff88, hex: "#39ff88", budget: 1.9, lines: [2, 2], weight: 27 },
  blackice: { id: "blackice", name: "Black-ICE", color: 0x29e7ff, hex: "#29e7ff", budget: 3.1, lines: [2, 3], weight: 9 },
  singular: { id: "singular", name: "Singular", color: 0xff2bd6, hex: "#ff2bd6", budget: 4.6, lines: [3, 4], weight: 2 },
};
const RARITY_ORDER: Rarity[] = ["standard", "tuned", "blackice", "singular"];

export interface Item {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  mods: Partial<ModBag>; // BASE roll — the forge scales these into effective mods (see effectiveMods)
  weaponId?: string; // weapon-slot items carry a weapon — equipping it overrides your fire
  ilvl?: number; // forge upgrade level (0/undefined = base); scales effective mods by UPGRADE_PER_LVL each
}

/** Per-level effective-stat multiplier the gear forge grants when you UPGRADE an item. */
export const UPGRADE_PER_LVL = 0.08;

interface StatDef {
  key: keyof ModBag;
  label: string;
  perPoint: number; // magnitude per budget point
  slots: Slot[];
  pct: boolean; // display as % vs flat
  good: "+" | "-"; // beneficial direction for display
  minRarity?: Rarity; // kit-mods only roll at this rarity or better
}

const STAT_DEFS: StatDef[] = [
  { key: "dmgPct", label: "DMG", perPoint: 0.06, slots: ["weapon", "chip"], pct: true, good: "+" },
  { key: "cdReducePct", label: "ABILITY CD", perPoint: 0.05, slots: ["weapon", "implant", "chip"], pct: true, good: "-" },
  { key: "hpAdd", label: "HP", perPoint: 12, slots: ["armor", "implant"], pct: false, good: "+" },
  { key: "shieldAdd", label: "SHIELD", perPoint: 14, slots: ["armor", "chip"], pct: false, good: "+" },
  { key: "movePct", label: "MOVE", perPoint: 0.05, slots: ["armor", "chip"], pct: true, good: "+" },
  { key: "infectPct", label: "INFECT", perPoint: 0.08, slots: ["implant"], pct: true, good: "+" },
  { key: "hackPct", label: "HACK", perPoint: 0.07, slots: ["implant"], pct: true, good: "+" },
  { key: "heatGainPct", label: "HEAT GAIN", perPoint: 0.08, slots: ["implant", "chip"], pct: true, good: "+" },
  { key: "heatDecayPct", label: "HEAT DECAY", perPoint: 0.08, slots: ["chip"], pct: true, good: "-" },
  { key: "critPct", label: "CRIT", perPoint: 0.04, slots: ["weapon", "chip"], pct: true, good: "+" },
  { key: "lifestealPct", label: "LIFESTEAL", perPoint: 0.03, slots: ["implant", "chip"], pct: true, good: "+" },
  // ── kit-mods (Black-ICE+): these change what an ability DOES — the build-around lines ──
  { key: "dashTrailPct", label: "DASH TRAIL", perPoint: 0.09, slots: ["armor", "chip"], pct: true, good: "+", minRarity: "blackice" },
  { key: "abilityEchoPct", label: "Q ECHO", perPoint: 0.08, slots: ["implant", "chip"], pct: true, good: "+", minRarity: "blackice" },
  { key: "killNovaPct", label: "KILL NOVA", perPoint: 0.08, slots: ["weapon", "implant"], pct: true, good: "+", minRarity: "blackice" },
  { key: "ultHeatDiscount", label: "ULT HEAT", perPoint: 3.2, slots: ["chip"], pct: false, good: "-", minRarity: "singular" },
];

let counter = 0;
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

/** Roll a fresh set of mod lines for a given slot+rarity at a level. Factored out so
 *  both fresh drops (rollItem) and the forge's REFORGE re-roll share one source. */
export function rollModsFor(slot: Slot, rarity: Rarity, level = 1): Partial<ModBag> {
  const def = RARITIES[rarity];
  const budget = def.budget * (1 + level * 0.04);
  const pool = STAT_DEFS.filter(
    (s) => s.slots.includes(slot) && (!s.minRarity || rarityRank(rarity) >= rarityRank(s.minRarity)),
  );
  const lines = Math.min(pool.length, randInt(def.lines[0], def.lines[1]));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const chosen = pool.slice(0, lines);
  const mods: Partial<ModBag> = {};
  for (const sd of chosen) {
    const pts = (budget / lines) * (0.85 + Math.random() * 0.3);
    const raw = sd.perPoint * pts;
    mods[sd.key] = sd.pct ? Math.round(raw * 100) / 100 : Math.max(1, Math.round(raw));
  }
  return mods;
}

const RARITY_ORDER_IDX = (r: Rarity) => RARITY_ORDER.indexOf(r);
/** 0..3 rank (standard→singular). */
export function rarityRank(r: Rarity): number {
  return RARITY_ORDER_IDX(r);
}
/** The rarity one tier above, or null at the top (singular). Drives the forge FUSE path. */
export function nextRarity(r: Rarity): Rarity | null {
  const i = RARITY_ORDER_IDX(r);
  return i >= 0 && i < RARITY_ORDER.length - 1 ? RARITY_ORDER[i + 1] : null;
}

/** Effective (post-upgrade) mods: BASE mods scaled by the item's forge level. Percentage
 *  lines keep 2 decimals; flat lines round to an int (min 1). Single source used by BOTH
 *  the server combat pipeline (deriveMods) and the client stat-line display. */
export function effectiveMods(item: Item): Partial<ModBag> {
  const lvl = item.ilvl ?? 0;
  if (lvl <= 0) return item.mods;
  const k = 1 + UPGRADE_PER_LVL * lvl;
  const out: Partial<ModBag> = {};
  for (const key of Object.keys(item.mods) as (keyof ModBag)[]) {
    const v = item.mods[key] ?? 0;
    const sd = STAT_DEFS.find((s) => s.key === key);
    out[key] = sd && !sd.pct ? Math.max(1, Math.round(v * k)) : Math.round(v * k * 100) / 100;
  }
  return out;
}

/** Pick a rarity. `boost` (0..) skews toward higher rarities (Purge Units drop better). */
export function pickRarity(boost = 0): Rarity {
  const weights = RARITY_ORDER.map((id, i) => RARITIES[id].weight * (i === 0 ? 1 : 1 + boost * i));
  let roll = Math.random() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return RARITY_ORDER[i];
  }
  return "standard";
}

export function rollItem(level = 1, rarityBoost = 0, forceRarity?: Rarity): Item {
  const rarity = forceRarity ?? pickRarity(rarityBoost);
  const def = RARITIES[rarity];
  const slot = SLOTS[randInt(0, SLOTS.length - 1)];
  const mods = rollModsFor(slot, rarity, level);

  // A weapon-slot drop IS a weapon: pick a type, name it by rarity + weapon.
  let weaponId: string | undefined;
  let name = `${def.name} ${SLOT_NAMES[slot]}`;
  if (slot === "weapon") {
    weaponId = WEAPON_IDS[randInt(0, WEAPON_IDS.length - 1)];
    name = `${def.name} ${getWeapon(weaponId)!.name}`;
  }

  return {
    id: `it_${++counter}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    slot,
    rarity,
    mods,
    weaponId,
  };
}

const TIER_RARITY: Record<string, Rarity> = { common: "tuned", rare: "blackice", exotic: "singular" };

/**
 * Build a store-bought weapon item carrying `weaponId` (so equipping it changes the
 * *feel*) with a strong, rarity-appropriate stat roll keyed to the weapon's tier
 * (common→Tuned, rare→Black-ICE, exotic→Singular). DMG + CRIT are guaranteed; one more
 * weapon line rounds it out — so the *numbers* match the price you paid.
 */
export function makeWeaponItem(weaponId: string, level = 1): Item {
  const w = getWeapon(weaponId);
  const rarity: Rarity = w ? (TIER_RARITY[w.tier] ?? "tuned") : "tuned";
  const def = RARITIES[rarity];
  const budget = def.budget * (1 + level * 0.04) * (rarity === "singular" ? 1.3 : 1.12);
  const pool = STAT_DEFS.filter(
    (s) => s.slots.includes("weapon") && (!s.minRarity || rarityRank(rarity) >= rarityRank(s.minRarity)),
  );
  const dmg = pool.find((s) => s.key === "dmgPct")!;
  const crit = pool.find((s) => s.key === "critPct")!;
  const rest = pool.filter((s) => s.key !== "dmgPct" && s.key !== "critPct");
  const extra = rest[Math.floor(Math.random() * rest.length)];
  const chosen = [dmg, crit, extra];
  const mods: Partial<ModBag> = {};
  for (const sd of chosen) {
    const pts = (budget / chosen.length) * (0.95 + Math.random() * 0.3);
    const raw = sd.perPoint * pts;
    mods[sd.key] = sd.pct ? Math.round(raw * 100) / 100 : Math.max(1, Math.round(raw));
  }
  return {
    id: `wp_${++counter}_${Math.random().toString(36).slice(2, 7)}`,
    name: `${w ? w.name : "WEAPON"}`,
    slot: "weapon",
    rarity,
    mods,
    weaponId,
  };
}

const RARITY_BASE: Record<Rarity, number> = {
  standard: 30,
  tuned: 80,
  blackice: 180,
  singular: 400,
};

/** Buy price (also the basis for sell value). Forge upgrades raise it. */
export function itemValue(item: Item): number {
  return Math.round((RARITY_BASE[item.rarity] + Object.keys(item.mods).length * 15) * (1 + (item.ilvl ?? 0) * 0.12));
}
export function sellValue(item: Item): number {
  return Math.max(5, Math.floor(itemValue(item) * 0.4));
}

/** Human-readable stat lines for tooltips/UI — shows EFFECTIVE (post-upgrade) values. */
export function itemStatLines(item: Item): string[] {
  const eff = effectiveMods(item);
  const lines = (Object.keys(eff) as (keyof ModBag)[]).map((key) => {
    const sd = STAT_DEFS.find((s) => s.key === key)!;
    const v = eff[key] ?? 0;
    const val = sd.pct ? `${Math.round(v * 100)}%` : `${v}`;
    return `${sd.good}${val} ${sd.label}`;
  });
  const w = getWeapon(item.weaponId);
  if (w) {
    lines.unshift(weaponDamageLine(item, item.weaponId));
    lines.unshift(`◈ ${w.klass} — ${w.desc}`);
  }
  if ((item.ilvl ?? 0) > 0 && !item.weaponId) lines.unshift(`▲ +${item.ilvl}`);
  else if ((item.ilvl ?? 0) > 0 && item.weaponId) lines.unshift(`▲ FORGE +${item.ilvl} — damage scales`);
  return lines;
}
