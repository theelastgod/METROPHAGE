// METROPHAGE — weekly District War (mid-game spine). Pure data + day seed.
// Factions fight for node control; weekly winner gets a city-wide bonus window.
// Server tallies via existing meta f0..fN; client shows war status.

import { currentDay } from "./dailies";
import { DISTRICTS } from "./districts";

export interface DistrictWarDef {
  week: number;
  /** Featured district index this week (focus objective). */
  focusDistrict: number;
  name: string;
  blurb: string;
  /** Bonus credits granted once per player when they capture in the focus district. */
  captureBonus: number;
  /** End-of-week mailbox prize for members of winning faction (server). */
  weeklyPrize: number;
}

/** One war week for the whole city. */
export function currentDistrictWar(now = Date.now()): DistrictWarDef {
  const week = Math.floor(currentDay(now) / 7);
  const focusDistrict = ((week % DISTRICTS.length) + DISTRICTS.length) % DISTRICTS.length;
  const d = DISTRICTS[focusDistrict];
  return {
    week,
    focusDistrict,
    name: `WAR FOR ${d.name.toUpperCase()}`,
    blurb: `Hold nodes in ${d.name} — Cell + faction score counts double this week`,
    captureBonus: 45,
    weeklyPrize: 280,
  };
}

export function warMetaKey(week: number, faction: number): string {
  return `war_w${week}_f${faction}`;
}

export function warFocusMetaKey(week: number): string {
  return `war_w${week}_focus`;
}

/** Third-hour coach line when war is active and player hasn't captured this week. */
export function districtWarCoachLine(capturedThisWeek: boolean): string | null {
  if (capturedThisWeek) return null;
  const w = currentDistrictWar();
  return `▶ DISTRICT WAR · ${w.name} — flip a node in that district for bonus ₵`;
}
