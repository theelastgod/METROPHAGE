// METROPHAGE — achievements: pure-data milestone catalog, Phaser-FREE, imported by BOTH
// the server (authoritative unlock + reward on a stat crossing its threshold) and the
// client (renders the grid, marking which are unlocked). Stats are the cross-zone counters
// in D1 player_stats; the leaderboards ORDER BY the same stats. Add a milestone = add a row.

export type StatKey = "kills" | "bosses" | "captures" | "credits" | "pvp" | "deepest" | "rep";

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  stat: StatKey;
  threshold: number;
  reward: number; // credits granted by the server on unlock
}

/** Player-facing names for the leaderboard stat picker. */
export const STAT_LABELS: Record<StatKey, string> = {
  kills: "HSS PURGED",
  bosses: "BOSSES SLAIN",
  captures: "NODES TAKEN",
  credits: "CREDITS EARNED",
  pvp: "ARENA KILLS",
  deepest: "DEEPEST DISTRICT",
  rep: "REPUTATION",
};

/** Stats a leaderboard can rank by (in display order). */
export const BOARD_STATS: StatKey[] = ["kills", "bosses", "captures", "pvp", "credits", "rep", "deepest"];

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_blood", name: "FIRST BLOOD", desc: "Purge your first HSS unit", stat: "kills", threshold: 1, reward: 25 },
  { id: "purge_50", name: "STREET SWEEPER", desc: "Purge 50 HSS units", stat: "kills", threshold: 50, reward: 150 },
  { id: "purge_250", name: "PURGE PROTOCOL", desc: "Purge 250 HSS units", stat: "kills", threshold: 250, reward: 600 },
  { id: "purge_1000", name: "EXTINCTION EVENT", desc: "Purge 1000 HSS units", stat: "kills", threshold: 1000, reward: 2500 },
  { id: "boss_1", name: "GIANT-SLAYER", desc: "Fell a world boss", stat: "bosses", threshold: 1, reward: 200 },
  { id: "boss_10", name: "CORP-KILLER", desc: "Fell 10 world bosses", stat: "bosses", threshold: 10, reward: 1000 },
  { id: "hold_1", name: "GROUND TAKEN", desc: "Capture a territory node", stat: "captures", threshold: 1, reward: 60 },
  { id: "hold_25", name: "TIDE-TURNER", desc: "Capture 25 territory nodes", stat: "captures", threshold: 25, reward: 500 },
  { id: "arena_1", name: "BLOODED", desc: "Win an arena kill", stat: "pvp", threshold: 1, reward: 80 },
  { id: "arena_25", name: "GLADIATOR", desc: "Win 25 arena kills", stat: "pvp", threshold: 25, reward: 700 },
  { id: "rich_10k", name: "FIXER", desc: "Earn 10,000 credits", stat: "credits", threshold: 10000, reward: 500 },
  { id: "rich_100k", name: "KINGPIN", desc: "Earn 100,000 credits", stat: "credits", threshold: 100000, reward: 3000 },
  { id: "deep_3", name: "DOWN THE STACK", desc: "Reach the 3rd district", stat: "deepest", threshold: 3, reward: 120 },
  { id: "deep_5", name: "BELOW THE PLAZA", desc: "Reach the 5th district", stat: "deepest", threshold: 5, reward: 280 },
  { id: "deep_all", name: "THE WHOLE MACHINE", desc: "Reach the deepest district", stat: "deepest", threshold: 8, reward: 1200 },
];

/** Achievements whose threshold a given stat could newly cross (for the server check). */
export function achievementsForStat(stat: StatKey): Achievement[] {
  return ACHIEVEMENTS.filter((a) => a.stat === stat);
}
