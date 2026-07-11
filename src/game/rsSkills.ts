// RuneScape-style skill tracks — visible grind progress separate from class trees.

export type RsSkillId = "combat" | "trading" | "exploration" | "crafting" | "mining";

export interface RsSkill {
  id: RsSkillId;
  name: string;
  icon: string;
  color: string;
}

export const RS_SKILLS: RsSkill[] = [
  { id: "combat", name: "Combat", icon: "⚔", color: "#ff3b6b" },
  { id: "trading", name: "Trading", icon: "₵", color: "#f7ff3c" },
  { id: "exploration", name: "Exploration", icon: "◎", color: "#00e5ff" },
  { id: "crafting", name: "Crafting", icon: "◆", color: "#b06bff" },
  { id: "mining", name: "Data Mining", icon: "▣", color: "#39ff88" },
];

/** XP required to reach level L (RS-flavoured exponential curve). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 1; l < level; l++) total += Math.floor(l + 220 * Math.pow(1.12, l));
  return total;
}

export function levelForXp(xp: number): number {
  let lvl = 1;
  while (xpForLevel(lvl + 1) <= xp && lvl < 99) lvl++;
  return lvl;
}

export function xpProgress(xp: number) {
  const lvl = levelForXp(xp);
  const cur = xpForLevel(lvl);
  const next = xpForLevel(lvl + 1);
  const span = Math.max(1, next - cur);
  return { level: lvl, into: xp - cur, need: span, norm: (xp - cur) / span };
}

export type RsSkillXp = Record<RsSkillId, number>;

export function emptyRsSkills(): RsSkillXp {
  return { combat: 0, trading: 0, exploration: 0, crafting: 0, mining: 0 };
}

const KEY = "metrophage_rs_skills_v1";

export function loadRsSkills(): RsSkillXp {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyRsSkills();
    return { ...emptyRsSkills(), ...(JSON.parse(raw) as Partial<RsSkillXp>) };
  } catch {
    return emptyRsSkills();
  }
}

export function saveRsSkills(sk: RsSkillXp) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sk));
  } catch {
    /* ignore */
  }
}

export function grantSkillXp(sk: RsSkillXp, id: RsSkillId, amount: number): { leveled: boolean; level: number } {
  const before = levelForXp(sk[id]);
  sk[id] += amount;
  const after = levelForXp(sk[id]);
  saveRsSkills(sk);
  return { leveled: after > before, level: after };
}