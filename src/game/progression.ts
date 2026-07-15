/**
 * METROPHAGE — campaign-aligned combat progression.
 *
 * Districts are the campaign spine (d0 → d7). Enemy power, recommended level,
 * and subway tunnel danger are keyed off that spine so a real player following
 * the quest structure always has a fair next fight — not a wall, not a stomp.
 *
 * Level curve (levelForXp = 1 + floor(xp/100)):
 *   quest rewards alone push ~L3 after THE WAKE, ~L8 after RECKONING, ~L15 after
 *   REISSUE, ~L25+ after OUTER RING — kills accelerate this. Bands below include
 *   kill XP and gear upgrades so "recLevel" is practical UX, not pure math.
 *
 * Pure data — shared by server garrison + client map/tooltips.
 */

import { DISTRICTS } from "./districts";

export interface DistrictProgression {
  /** District index (0 = plaza, 7 = kernel). */
  district: number;
  /** Soft recommended player level [min, comfortable max]. */
  recLevel: [number, number];
  /** Main campaign quest that expects combat here. */
  campaignQuest: string;
  /** One-line UX hint for map / arrival. */
  blurb: string;
  /** HP mult on base archetypes (after 2026 soft-pass values). */
  enemyHpMult: number;
  /** Shot/slam damage mult. */
  enemyDmgMult: number;
  /** Elite promotion chance. */
  eliteChance: number;
  /** Boss HP mult vs BOSS_ROSTER base. */
  bossHpMult: number;
  /**
   * ENEMY_ARCHES indices for garrison rotation:
   * 0 patrol · 1 wasp · 2 lancer · 3 hound · 4 enforcer · 5 sniper · 6 wraith
   */
  kindPattern: number[];
}

/**
 * Progressive difficulty table — each rung is ~1 quest act harder.
 * Early: light trash, teach systems. Late: mixed packs, elites, real dps checks.
 */
export const DISTRICT_PROGRESSION: DistrictProgression[] = [
  {
    district: 0,
    recLevel: [1, 4],
    campaignQuest: "the_wake",
    blurb: "Street watch — new chrome, soft guns. Learn nodes + extract.",
    enemyHpMult: 0.88,
    enemyDmgMult: 0.82,
    eliteChance: 0.02,
    bossHpMult: 0.85,
    // Mostly patrols; one enforcer as a teachable spike
    kindPattern: [0, 0, 0, 1, 0, 0, 4],
  },
  {
    district: 1,
    recLevel: [3, 7],
    campaignQuest: "dead_reckoning",
    blurb: "Foundry lanes — snipers + wasps. Bring a mid-tier gun.",
    enemyHpMult: 1.0,
    enemyDmgMult: 0.95,
    eliteChance: 0.05,
    bossHpMult: 0.95,
    kindPattern: [0, 1, 5, 5, 2, 0, 4, 1],
  },
  {
    district: 2,
    recLevel: [5, 10],
    campaignQuest: "fixers_debt",
    blurb: "Spire security — hound packs and kiting lancers.",
    enemyHpMult: 1.12,
    enemyDmgMult: 1.05,
    eliteChance: 0.07,
    bossHpMult: 1.05,
    kindPattern: [1, 2, 3, 3, 2, 0, 4, 5],
  },
  {
    district: 3,
    recLevel: [8, 13],
    campaignQuest: "dock_run",
    blurb: "Tidal yards — mixed heavy. Expect enforcers on piers.",
    enemyHpMult: 1.28,
    enemyDmgMult: 1.12,
    eliteChance: 0.09,
    bossHpMult: 1.12,
    kindPattern: [2, 4, 3, 5, 1, 2, 4, 0],
  },
  {
    district: 4,
    recLevel: [11, 16],
    campaignQuest: "undercity_echo",
    blurb: "Buried transit cult — denser packs, first real elite density.",
    enemyHpMult: 1.45,
    enemyDmgMult: 1.2,
    eliteChance: 0.12,
    bossHpMult: 1.2,
    kindPattern: [2, 3, 4, 6, 3, 5, 2, 4],
  },
  {
    district: 5,
    recLevel: [14, 20],
    campaignQuest: "relay_break",
    blurb: "Orbital deny zone — wraiths + snipers. Bring medkits.",
    enemyHpMult: 1.65,
    enemyDmgMult: 1.3,
    eliteChance: 0.15,
    bossHpMult: 1.3,
    kindPattern: [5, 6, 4, 2, 6, 3, 5, 4],
  },
  {
    district: 6,
    recLevel: [18, 25],
    campaignQuest: "wastes_purge",
    blurb: "Outer scrap ring — heavies and elite skirmishers.",
    enemyHpMult: 1.9,
    enemyDmgMult: 1.4,
    eliteChance: 0.18,
    bossHpMult: 1.4,
    kindPattern: [4, 6, 3, 6, 5, 4, 2, 6],
  },
  {
    district: 7,
    recLevel: [22, 32],
    campaignQuest: "continue_q",
    blurb: "Kernel fortress — endgame garrison. Full bestiary + elites.",
    enemyHpMult: 2.2,
    enemyDmgMult: 1.55,
    eliteChance: 0.22,
    bossHpMult: 1.55,
    kindPattern: [6, 4, 5, 6, 3, 4, 6, 2, 5],
  },
];

export function progressionForDistrict(districtIndex: number): DistrictProgression {
  const i = Math.max(0, Math.min(DISTRICT_PROGRESSION.length - 1, Math.floor(districtIndex)));
  return DISTRICT_PROGRESSION[i];
}

/** Bridge corridors sit between districts — blend the harder endpoint. */
export function progressionForBridge(fromDistrict: number): DistrictProgression {
  const a = progressionForDistrict(fromDistrict);
  const b = progressionForDistrict(fromDistrict + 1);
  return {
    district: fromDistrict,
    recLevel: [a.recLevel[0], b.recLevel[1]],
    campaignQuest: a.campaignQuest,
    blurb: `Wilderness cut — threat between d${fromDistrict} and d${fromDistrict + 1}.`,
    enemyHpMult: (a.enemyHpMult + b.enemyHpMult) / 2,
    enemyDmgMult: (a.enemyDmgMult + b.enemyDmgMult) / 2,
    eliteChance: (a.eliteChance + b.eliteChance) / 2,
    bossHpMult: (a.bossHpMult + b.bossHpMult) / 2,
    kindPattern: [...a.kindPattern.slice(0, 4), ...b.kindPattern.slice(0, 4)],
  };
}

/**
 * Campaign threat rung 0..7 for a subway station zone id.
 * Hub = 0; dN = N; bridge wN ≈ N + 0.5 (between districts).
 */
export function campaignThreatForZone(zone: string | null | undefined): number {
  if (!zone || zone === "safe") return 0;
  const dm = /^d(\d+)$/.exec(zone);
  if (dm) return Math.min(7, Math.max(0, parseInt(dm[1], 10)));
  const wm = /^w(\d+)$/.exec(zone);
  if (wm) {
    const i = parseInt(wm[1], 10);
    return Math.min(7, Math.max(0, i + 0.5));
  }
  return 0;
}

/**
 * Tunnel combat power: prefer the *harder* endpoint so a path toward the Kernel
 * is dangerous even when leaving a soft station. Blend with t along the tunnel.
 */
export function tunnelCampaignThreat(aZone: string, bZone: string, t: number): number {
  const a = campaignThreatForZone(aZone);
  const b = campaignThreatForZone(bZone);
  const hard = Math.max(a, b);
  const soft = Math.min(a, b);
  // Weight toward the harder end as you walk toward it
  const towardHard = a >= b ? 1 - t : t;
  return soft + (hard - soft) * (0.35 + 0.65 * towardHard);
}

/** Map campaign threat (0..7+) → subway tier used for kinds + elite gates. */
export function subwayTierFromCampaignThreat(threat: number): 0 | 1 | 2 | 3 {
  if (threat < 1.2) return 0; // hub, plaza, early stack approach
  if (threat < 3.2) return 1; // stacks → docks band
  if (threat < 5.2) return 2; // undercity → relay
  return 3; // wastes → kernel
}

/**
 * Subway HP/dmg mult from campaign threat (continuous, not just tier steps).
 * Soft near hub so rookies can board; steep toward Kernel lines.
 */
export function subwayScaleFromThreat(threat: number): { hpMult: number; dmgMult: number; eliteChance: number } {
  const t = Math.max(0, Math.min(7.5, threat));
  // hp: 0.85 @ hub → ~2.4 @ kernel tunnels
  const hpMult = 0.85 + t * 0.22;
  const dmgMult = 0.8 + t * 0.12;
  const eliteChance = t < 1.5 ? 0 : 0.04 + (t - 1.5) * 0.035;
  return { hpMult, dmgMult, eliteChance: Math.min(0.28, eliteChance) };
}

/** Recommended level label for UI. */
export function recLevelLabel(districtIndex: number): string {
  const p = progressionForDistrict(districtIndex);
  return `LV ${p.recLevel[0]}–${p.recLevel[1]}`;
}

/** Sanity: table covers every campaign district. */
export function progressionCoversAllDistricts(): boolean {
  return DISTRICT_PROGRESSION.length >= DISTRICTS.length;
}
