/**
 * METROPHAGE — how the world opens up as the campaign advances.
 *
 * The city is not walled off: a runner can walk anywhere from minute one. What
 * changes with the campaign is whether the game *vouches* for the trip. Each
 * district is the stage for one act (DISTRICT_PROGRESSION.campaignQuest), and
 * each act already gates itself on the previous act's flag — so the unlock
 * ladder is derived from the questline rather than authored twice.
 *
 *   d0 THE WAKE (open) → d1 DEAD RECKONING → d2 THE FIXER'S DEBT → d3 TIDAL RUN
 *   → d4 BURIED SIGNAL → d5 SKYLINK BREAK → d6 OUTER RING → d7 THE AWAKENING
 *
 * Two independent signals, deliberately kept apart:
 *   story  — has the campaign sent you here yet? ("ahead" if not)
 *   level  — is your character up to the local garrison? ("underleveled" if not)
 *
 * Both are advisory. Nothing here blocks travel; callers warn and let the
 * player choose. Level never gates, so out-questing your XP can't strand you.
 *
 * Keyed off completed quest ids, not flags: the wire sends `completed` and not
 * `flags`, so this resolves identically on the client and in the Worker.
 *
 * Pure data — no DOM, no Phaser. Imported by the map UI and the server alike.
 */

import { DISTRICT_PROGRESSION, progressionForDistrict } from "./progression";
import { getQuest, hasFlagFromCompleted, questSettingFlag } from "./quests";

/** Story standing for a zone, relative to campaign progress. */
export type ZoneStory = "open" | "ahead";

export interface ZoneAccess {
  zone: string;
  /** District index this zone belongs to; null for hub/interiors/subway. */
  district: number | null;
  story: ZoneStory;
  /** Recommended level band, or null where combat isn't scaled. */
  recLevel: [number, number] | null;
  /** The level this was resolved against. */
  level: number;
  /** Levels short of the recommended minimum; 0 when comfortable. */
  levelGap: number;
  /** Act that sends you here (e.g. "dock_run"), or null for non-combat zones. */
  actId: string | null;
  actName: string | null;
  /** Act you must finish first — the reason it reads "ahead". */
  requiredQuestId: string | null;
  requiredQuestName: string | null;
}

export interface CampaignStanding {
  completed: Iterable<string>;
  level: number;
}

/** Districts are `dN`; wilderness cuts are `wN` (between dN and dN+1). */
function districtOfZone(zone: string): number | null {
  const d = /^d(\d+)$/.exec(zone);
  if (d) return parseInt(d[1], 10);
  const w = /^w(\d+)$/.exec(zone);
  // A cut is the approach to the next district but belongs to the one behind it:
  // roaming the frontier you've earned stays vouched-for.
  if (w) return parseInt(w[1], 10);
  return null;
}

/** The act that must be done before district `i`'s act is offered. */
function prerequisiteFor(districtIndex: number): { id: string; name: string } | null {
  const act = getQuest(progressionForDistrict(districtIndex).campaignQuest);
  if (!act?.requiresFlag) return null;
  const setter = questSettingFlag(act.requiresFlag);
  return setter ? { id: setter.id, name: setter.name } : null;
}

/**
 * Resolve how a zone stands against a player's campaign + level.
 * Unknown/hub/interior zones come back open and unscaled.
 */
export function zoneAccess(zone: string, standing: CampaignStanding): ZoneAccess {
  const district = districtOfZone(zone);
  if (district === null || district >= DISTRICT_PROGRESSION.length) {
    return {
      zone,
      district: null,
      story: "open",
      recLevel: null,
      level: standing.level,
      levelGap: 0,
      actId: null,
      actName: null,
      requiredQuestId: null,
      requiredQuestName: null,
    };
  }

  const prog = progressionForDistrict(district);
  const act = getQuest(prog.campaignQuest);
  const required = prerequisiteFor(district);
  const flag = act?.requiresFlag;
  const story: ZoneStory = !flag || hasFlagFromCompleted(flag, standing.completed) ? "open" : "ahead";

  // Bridges blend toward the harder end; use the band that matches the garrison.
  const recLevel: [number, number] = /^w\d+$/.test(zone)
    ? [prog.recLevel[0], progressionForDistrict(district + 1).recLevel[1]]
    : [prog.recLevel[0], prog.recLevel[1]];

  return {
    zone,
    district,
    story,
    recLevel,
    level: standing.level,
    levelGap: Math.max(0, recLevel[0] - standing.level),
    actId: act?.id ?? null,
    actName: act?.name ?? null,
    requiredQuestId: required?.id ?? null,
    requiredQuestName: required?.name ?? null,
  };
}

/** True when the trip is worth a word of warning before it happens. */
export function zoneNeedsWarning(a: ZoneAccess): boolean {
  return a.story === "ahead" || a.levelGap > 0;
}

/**
 * One-line advisory for a zone, or null when the trip is unremarkable.
 * Story reads first — it's the reason the district exists at this rung.
 */
export function zoneWarning(a: ZoneAccess): string | null {
  if (a.story === "ahead" && a.requiredQuestName) {
    return `THE FIXER hasn't sent you here — ${a.requiredQuestName} comes first.`;
  }
  if (a.levelGap > 0 && a.recLevel) {
    return `Garrison expects LV ${a.recLevel[0]}–${a.recLevel[1]}. You are LV ${a.level}.`;
  }
  return null;
}

/**
 * The frontier: districts the campaign currently vouches for. Useful for
 * "where should I go next" UI.
 */
export function openDistricts(standing: CampaignStanding): number[] {
  const out: number[] = [];
  for (const p of DISTRICT_PROGRESSION) {
    if (zoneAccess(`d${p.district}`, standing).story === "open") out.push(p.district);
  }
  return out;
}
