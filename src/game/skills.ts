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

// Shared branch templates (ASSAULT col0, CHASSIS col1) keep authoring tight; the
// SYSTEMS branch (col2) is class-flavored.
const assault = (): SkillNode[] => [
  { id: "a1", name: "LIVE ROUNDS", desc: "+8% damage", col: 0, row: 0, maxRank: 3, mods: { dmgPct: 0.08 } },
  { id: "a2", name: "OVERCLOCKED", desc: "+12% damage", col: 0, row: 1, maxRank: 2, requires: "a1", mods: { dmgPct: 0.12 } },
];
const chassis = (): SkillNode[] => [
  { id: "c1", name: "REINFORCED HULL", desc: "+20 max HP", col: 1, row: 0, maxRank: 3, mods: { hpAdd: 20 } },
  { id: "c2", name: "LIGHT FRAME", desc: "+6% move speed", col: 1, row: 1, maxRank: 2, requires: "c1", mods: { movePct: 0.06 } },
];

export const SKILL_TREES: Record<string, SkillNode[]> = {
  metrophage: [
    ...assault(),
    ...chassis(),
    { id: "s1", name: "VIRAL LOAD", desc: "+15% infection speed", col: 2, row: 0, maxRank: 3, mods: { infectPct: 0.15 } },
    { id: "s2", name: "RECURSION", desc: "-8% ability cooldown", col: 2, row: 1, maxRank: 2, requires: "s1", mods: { cdReducePct: 0.08 } },
    { id: "s3", name: "CONTAGION BLOOM+", desc: "+10% dmg, +10% infect", col: 2, row: 2, maxRank: 1, requires: "s2", mods: { dmgPct: 0.1, infectPct: 0.1 } },
  ],
  "k-guerilla": [
    ...assault(),
    ...chassis(),
    { id: "s1", name: "DEMO CHARGE", desc: "+10% damage", col: 2, row: 0, maxRank: 3, mods: { dmgPct: 0.1 } },
    { id: "s2", name: "FAST HANDS", desc: "-9% ability cooldown", col: 2, row: 1, maxRank: 2, requires: "s1", mods: { cdReducePct: 0.09 } },
    { id: "s3", name: "BLITZ", desc: "+8% move, -8% cd", col: 2, row: 2, maxRank: 1, requires: "s2", mods: { movePct: 0.08, cdReducePct: 0.08 } },
  ],
  wintermute: [
    ...assault(),
    ...chassis(),
    { id: "s1", name: "CRYO CAPACITOR", desc: "-10% ability cooldown", col: 2, row: 0, maxRank: 3, mods: { cdReducePct: 0.1 } },
    { id: "s2", name: "HEAT SINK", desc: "+12% heat gain", col: 2, row: 1, maxRank: 2, requires: "s1", mods: { heatGainPct: 0.12 } },
    { id: "s3", name: "ICE LANCE", desc: "+14% damage", col: 2, row: 2, maxRank: 1, requires: "s2", mods: { dmgPct: 0.14 } },
  ],
  swarm: [
    ...assault(),
    ...chassis(),
    { id: "s1", name: "HIVE MIND", desc: "-10% ability cooldown", col: 2, row: 0, maxRank: 3, mods: { cdReducePct: 0.1 } },
    { id: "s2", name: "FRENZY", desc: "+10% damage", col: 2, row: 1, maxRank: 2, requires: "s1", mods: { dmgPct: 0.1 } },
    { id: "s3", name: "INFESTATION", desc: "+8% move, +8% dmg", col: 2, row: 2, maxRank: 1, requires: "s2", mods: { movePct: 0.08, dmgPct: 0.08 } },
  ],
};

export function treeFor(classId: string): SkillNode[] {
  return SKILL_TREES[classId] ?? SKILL_TREES.metrophage;
}
