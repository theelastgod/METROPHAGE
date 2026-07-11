// METROPHAGE — guilds ("Cells"): pure-data constants + progression curve, Phaser-FREE,
// shared by server (authoritative) and client (display). A Cell is a player-run resistance
// group with a shared bank; its bank deposits feed cell XP → cell level → a credit-find perk.

/** Founding a Cell costs credits (a sink + a commitment gate). */
export const GUILD_CREATE_COST = 500;

export type GuildRank = "leader" | "officer" | "member";
export const RANK_LABEL: Record<GuildRank, string> = { leader: "LEADER", officer: "OFFICER", member: "MEMBER" };

/** Cell level from accumulated XP (1 XP per credit banked). Soft, capped at 20. */
export function guildLevel(xp: number): number {
  return Math.min(20, 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 800)));
}

/** XP needed to reach a given level (inverse of guildLevel) — for the progress bar. */
export function guildXpForLevel(level: number): number {
  return Math.round(Math.pow(Math.max(0, level - 1), 2) * 800);
}

/** The Cell perk: a credit-find bonus that scales with level (capped). Applied
 *  server-side to kill payouts of members — modest, so it never warps balance. */
export function guildPerkPct(level: number): number {
  return Math.min(0.02 * (level - 1), 0.2); // +2% per level, cap +20%
}

/** Validate a proposed Cell name + tag; returns an error string or null if OK. */
export function validateGuild(name: string, tag: string): string | null {
  if (name.trim().length < 3) return "name must be 3+ characters";
  if (name.trim().length > 24) return "name too long (max 24)";
  if (tag.trim().length < 2 || tag.trim().length > 5) return "tag must be 2–5 characters";
  return null;
}
