// METROPHAGE — weekly Cell (guild) goals. Pure data + day seed; server tallies
// contributions into guild meta, client shows progress on the Cell panel.

import { currentDay } from "./dailies";

export interface GuildGoalDef {
  id: string;
  name: string;
  desc: string;
  /** Stat key tallied server-side for the week. */
  stat: "kills" | "bosses" | "captures" | "deposits";
  target: number;
  /** Bonus credits to each online member when claimed (server). */
  rewardCredits: number;
  rewardRep: number;
}

const POOL: GuildGoalDef[] = [
  { id: "wk_kills", name: "STREET WAR", desc: "Cell members purge 200 HSS", stat: "kills", target: 200, rewardCredits: 400, rewardRep: 25 },
  { id: "wk_boss", name: "COMMAND HUNT", desc: "Fell 3 world bosses as a cell", stat: "bosses", target: 3, rewardCredits: 600, rewardRep: 40 },
  { id: "wk_nodes", name: "GRID CLAIM", desc: "Capture 15 territory nodes", stat: "captures", target: 15, rewardCredits: 450, rewardRep: 30 },
  { id: "wk_bank", name: "WAR CHEST", desc: "Deposit ₵2500 into the cell bank", stat: "deposits", target: 2500, rewardCredits: 350, rewardRep: 20 },
];

/** One weekly goal for all cells (shared seed by week index). */
export function weeklyGuildGoal(now = Date.now()): GuildGoalDef {
  const week = Math.floor(currentDay(now) / 7);
  return POOL[(((week % POOL.length) + POOL.length) % POOL.length)];
}

export function guildGoalProgressKey(goalId: string, week: number): string {
  return `gg_${week}_${goalId}`;
}

export function currentGuildWeek(now = Date.now()): number {
  return Math.floor(currentDay(now) / 7);
}
