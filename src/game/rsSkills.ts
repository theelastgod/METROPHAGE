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

export const RS_SKILL_IDS: RsSkillId[] = ["combat", "trading", "exploration", "crafting", "mining"];

export const RS_SKILL_XP_CAP = xpForLevel(99);

export function emptyRsSkills(): RsSkillXp {
  return { combat: 0, trading: 0, exploration: 0, crafting: 0, mining: 0 };
}

export function skillStatKey(id: RsSkillId): `skill_${RsSkillId}` {
  return `skill_${id}`;
}

/** Sanitize the authoritative player_stats counters into the fixed wire shape. */
export function skillSnapshot(stats: Record<string, number>): RsSkillXp {
  const out = emptyRsSkills();
  for (const id of RS_SKILL_IDS) {
    const raw = stats[skillStatKey(id)] ?? 0;
    out[id] = Math.min(RS_SKILL_XP_CAP, Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0)));
  }
  return out;
}

/** Capped award amount, used by the Worker before it bumps a durable stat. */
export function skillAwardAmount(stats: Record<string, number>, id: RsSkillId, amount: number): number {
  const current = skillSnapshot(stats)[id];
  return Math.min(Math.max(0, Math.floor(amount)), RS_SKILL_XP_CAP - current);
}
