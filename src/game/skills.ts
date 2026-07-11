// METROPHAGE — per-class skill trees (data). 3 branches × a few nodes each,
// mixing passive boosts and ability upgrades (cooldown / infection potency).
// Authored examples per class; the rest is data — add a node = add an entry.

import type { ModBag } from "./stats";

export interface SkillNode {
  id: string;
  name: string;
  desc: string;
  col: number; // branch (0..2) -> column in the panel
  row: number; // tier within the branch
  maxRank: number;
  requires?: string; // prereq node id (>=1 rank)
  mods: Partial<ModBag>; // applied per allocated rank
}

// Shared branches: ASSAULT (col0, offense → crit) and CHASSIS (col1, survivability →
// lifesteal) are deep vertical chains ending in a keystone, kept as templates so every
// class shares the spine. The SYSTEMS branch (col2) is class-flavored. Each branch is a
// strict prereq chain (row N requires row N-1), so you commit down a line to its keystone.
const assault = (): SkillNode[] => [
  { id: "a1", name: "LIVE ROUNDS", desc: "+8% damage", col: 0, row: 0, maxRank: 3, mods: { dmgPct: 0.08 } },
  { id: "a2", name: "OVERCLOCKED", desc: "+12% damage", col: 0, row: 1, maxRank: 2, requires: "a1", mods: { dmgPct: 0.12 } },
  { id: "a3", name: "HOLLOW-POINT", desc: "+6% crit chance", col: 0, row: 2, maxRank: 3, requires: "a2", mods: { critPct: 0.06 } },
  { id: "a4", name: "EXECUTE", desc: "+10% dmg, +4% crit", col: 0, row: 3, maxRank: 2, requires: "a3", mods: { dmgPct: 0.1, critPct: 0.04 } },
  { id: "a5", name: "◆ APEX PREDATOR", desc: "+15% dmg, +8% crit", col: 0, row: 4, maxRank: 1, requires: "a4", mods: { dmgPct: 0.15, critPct: 0.08 } },
];
const chassis = (): SkillNode[] => [
  { id: "c1", name: "REINFORCED HULL", desc: "+20 max HP", col: 1, row: 0, maxRank: 3, mods: { hpAdd: 20 } },
  { id: "c2", name: "LIGHT FRAME", desc: "+6% move speed", col: 1, row: 1, maxRank: 2, requires: "c1", mods: { movePct: 0.06 } },
  { id: "c3", name: "ABLATIVE PLATING", desc: "+18 max shield", col: 1, row: 2, maxRank: 3, requires: "c2", mods: { shieldAdd: 18 } },
  { id: "c4", name: "VAMPIRIC CORE", desc: "+5% lifesteal", col: 1, row: 3, maxRank: 2, requires: "c3", mods: { lifestealPct: 0.05 } },
  { id: "c5", name: "◆ JUGGERNAUT", desc: "+30 HP, +6% lifesteal", col: 1, row: 4, maxRank: 1, requires: "c4", mods: { hpAdd: 30, lifestealPct: 0.06 } },
];

export const SKILL_TREES: Record<string, SkillNode[]> = {
  metrophage: [
    ...assault(),
    ...chassis(),
    { id: "s1", name: "VIRAL LOAD", desc: "+15% infection speed", col: 2, row: 0, maxRank: 3, mods: { infectPct: 0.15 } },
    { id: "s2", name: "RECURSION", desc: "-8% ability cooldown", col: 2, row: 1, maxRank: 2, requires: "s1", mods: { cdReducePct: 0.08 } },
    { id: "s3", name: "PLAGUE BEARER", desc: "+5% lifesteal", col: 2, row: 2, maxRank: 2, requires: "s2", mods: { lifestealPct: 0.05 } },
    { id: "s4", name: "EPIDEMIC", desc: "+10% dmg, +10% infect", col: 2, row: 3, maxRank: 2, requires: "s3", mods: { dmgPct: 0.1, infectPct: 0.1 } },
    { id: "s5", name: "◆ PATIENT ZERO", desc: "+12% dmg/infect, +4% steal", col: 2, row: 4, maxRank: 1, requires: "s4", mods: { dmgPct: 0.12, infectPct: 0.12, lifestealPct: 0.04 } },
  ],
  "k-guerilla": [
    ...assault(),
    ...chassis(),
    { id: "s1", name: "DEMO CHARGE", desc: "+10% damage", col: 2, row: 0, maxRank: 3, mods: { dmgPct: 0.1 } },
    { id: "s2", name: "FAST HANDS", desc: "-9% ability cooldown", col: 2, row: 1, maxRank: 2, requires: "s1", mods: { cdReducePct: 0.09 } },
    { id: "s3", name: "ADRENALINE", desc: "+8% move speed", col: 2, row: 2, maxRank: 2, requires: "s2", mods: { movePct: 0.08 } },
    { id: "s4", name: "GUERILLA TACTICS", desc: "+6% crit, -6% cd", col: 2, row: 3, maxRank: 2, requires: "s3", mods: { critPct: 0.06, cdReducePct: 0.06 } },
    { id: "s5", name: "◆ BLITZ DOCTRINE", desc: "+12% dmg/move, -8% cd", col: 2, row: 4, maxRank: 1, requires: "s4", mods: { dmgPct: 0.12, movePct: 0.1, cdReducePct: 0.08 } },
  ],
  wintermute: [
    ...assault(),
    ...chassis(),
    { id: "s1", name: "CRYO CAPACITOR", desc: "-10% ability cooldown", col: 2, row: 0, maxRank: 3, mods: { cdReducePct: 0.1 } },
    { id: "s2", name: "HEAT SINK", desc: "+12% heat gain", col: 2, row: 1, maxRank: 2, requires: "s1", mods: { heatGainPct: 0.12 } },
    { id: "s3", name: "OVERVOLT", desc: "+10% damage", col: 2, row: 2, maxRank: 2, requires: "s2", mods: { dmgPct: 0.1 } },
    { id: "s4", name: "SYSTEM SHOCK", desc: "+8% crit, +8% hack", col: 2, row: 3, maxRank: 2, requires: "s3", mods: { critPct: 0.08, hackPct: 0.08 } },
    { id: "s5", name: "◆ ABSOLUTE ZERO", desc: "+14% dmg, +10% hack, +6% crit", col: 2, row: 4, maxRank: 1, requires: "s4", mods: { dmgPct: 0.14, hackPct: 0.1, critPct: 0.06 } },
  ],
  swarm: [
    ...assault(),
    ...chassis(),
    { id: "s1", name: "HIVE MIND", desc: "-10% ability cooldown", col: 2, row: 0, maxRank: 3, mods: { cdReducePct: 0.1 } },
    { id: "s2", name: "FRENZY", desc: "+10% damage", col: 2, row: 1, maxRank: 2, requires: "s1", mods: { dmgPct: 0.1 } },
    { id: "s3", name: "SCAVENGE", desc: "+5% lifesteal", col: 2, row: 2, maxRank: 2, requires: "s2", mods: { lifestealPct: 0.05 } },
    { id: "s4", name: "INFESTATION", desc: "+8% move, +8% dmg", col: 2, row: 3, maxRank: 2, requires: "s3", mods: { movePct: 0.08, dmgPct: 0.08 } },
    { id: "s5", name: "◆ BROODLORD", desc: "+14% dmg, +6% steal/crit", col: 2, row: 4, maxRank: 1, requires: "s4", mods: { dmgPct: 0.14, lifestealPct: 0.06, critPct: 0.06 } },
  ],
};

export function treeFor(classId: string): SkillNode[] {
  return SKILL_TREES[classId] ?? SKILL_TREES.metrophage;
}
