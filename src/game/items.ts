// METROPHAGE — gear: data-driven items, rarities, and rarity-weighted generation.
// Item mods feed the same ModBag pipeline as skills (game/stats.ts).

import type { ModBag } from "./stats";

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
  mods: Partial<ModBag>;
}

interface StatDef {
  key: keyof ModBag;
  label: string;
  perPoint: number; // magnitude per budget point
  slots: Slot[];
  pct: boolean; // display as % vs flat
  good: "+" | "-"; // beneficial direction for display
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
];

let counter = 0;
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

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
  const budget = def.budget * (1 + level * 0.04);

  const pool = STAT_DEFS.filter((s) => s.slots.includes(slot));
  const lines = Math.min(pool.length, randInt(def.lines[0], def.lines[1]));
  // shuffle pool
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

  return {
    id: `it_${++counter}_${Math.random().toString(36).slice(2, 7)}`,
    name: `${def.name} ${SLOT_NAMES[slot]}`,
    slot,
    rarity,
    mods,
  };
}

const RARITY_BASE: Record<Rarity, number> = {
  standard: 30,
  tuned: 80,
  blackice: 180,
  singular: 400,
};

/** Buy price (also the basis for sell value). */
export function itemValue(item: Item): number {
  return RARITY_BASE[item.rarity] + Object.keys(item.mods).length * 15;
}
export function sellValue(item: Item): number {
  return Math.max(5, Math.floor(itemValue(item) * 0.4));
}

/** Human-readable stat lines for tooltips/UI. */
export function itemStatLines(item: Item): string[] {
  return (Object.keys(item.mods) as (keyof ModBag)[]).map((key) => {
    const sd = STAT_DEFS.find((s) => s.key === key)!;
    const v = item.mods[key] ?? 0;
    const val = sd.pct ? `${Math.round(v * 100)}%` : `${v}`;
    return `${sd.good}${val} ${sd.label}`;
  });
}
