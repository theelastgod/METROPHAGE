/**
 * METROPHAGE — what a level is actually worth.
 *
 * DISTRICT_PROGRESSION (progression.ts) is the enemy half of the curve: d0 → d7
 * ramps enemy HP 0.88 → 2.2 and damage 0.82 → 1.55. This is the player half.
 * Without it, levelling grants nothing and gear alone has to carry the entire
 * ramp — so a runner who follows the campaign gets quietly poorer every act.
 *
 * Levels give the floor; gear gives the spread. Roughly, against the d7 band
 * (recLevel 22–32) a bare L25 runner carries:
 *   HP     140 → 284   (2.0×, vs 1.55× enemy damage)
 *   damage +28.8%       (vs 2.2× enemy HP — gear covers the rest, by design)
 * That deliberately leaves late districts unclearable in starting gear: the
 * level floor keeps you alive long enough to fight, it doesn't win the fight.
 *
 * Growth stops at LEVEL_SOFT_CAP. levelForXp is uncapped (1 + xp/100), so
 * without a cap a L500 grinder would carry ~3k HP and trivialise the Kernel.
 *
 * Pure data — no DOM, no Phaser. Shared by the Worker (authoritative) and the
 * client character sheet (display only).
 */

import type { ModBag } from "./stats";

/** Levels past this grant no further raw power — the band tops out past d7. */
export const LEVEL_SOFT_CAP = 40;

/** +max HP per level after the first. */
const HP_PER_LEVEL = 6;
/** +damage fraction per level after the first. */
const DMG_PER_LEVEL = 0.012;

/** Crit chance per level, and its ceiling (excludes the flat baseline crit). */
const CRIT_PER_LEVEL = 0.012;
const CRIT_CAP = 0.25;

/** Lifesteal per level, and its ceiling. */
const LIFESTEAL_PER_LEVEL = 0.004;
const LIFESTEAL_CAP = 0.08;

/**
 * The ModBag a character earns purely from levelling — aggregated with gear
 * mods, so every existing `p.mods.*` read picks it up automatically.
 *
 * L1 is all zeros: a fresh Blank's baseline is PLAYER_HP/PLAYER_DMG exactly.
 */
export function levelMods(level: number): Partial<ModBag> {
  const lv = Math.max(1, Math.floor(level || 1));
  // Raw power stops growing at the cap; crit/lifesteal keep their own ceilings.
  const growth = Math.min(lv, LEVEL_SOFT_CAP) - 1;
  return {
    hpAdd: growth * HP_PER_LEVEL,
    dmgPct: growth * DMG_PER_LEVEL,
    // `lv`, not `growth`: these deliberately reproduce the old inline server formulas
    // (min(0.05 + level*0.012, 0.3) and min(level*0.004, 0.08)) that levelCurve.test.ts
    // pins number-for-number, so L1's +1.2% crit is baseline, not a bug. The "L1 is all
    // zeros" note above is about raw power (hpAdd/dmgPct) only.
    critPct: Math.min(lv * CRIT_PER_LEVEL, CRIT_CAP),
    lifestealPct: Math.min(lv * LIFESTEAL_PER_LEVEL, LIFESTEAL_CAP),
  };
}

/** Character-sheet summary of what this level is worth. */
export function levelPowerLabel(level: number): string {
  const m = levelMods(level);
  const pct = Math.round((m.dmgPct ?? 0) * 100);
  return `+${Math.round(m.hpAdd ?? 0)} HP · +${pct}% DMG · +${Math.round((m.critPct ?? 0) * 100)}% CRIT`;
}
