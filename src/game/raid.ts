// METROPHAGE — raid-tier boss mechanics: pure-data phase script, Phaser-FREE, shared by
// server (authoritative phase logic) and client (telegraph labels/colors). A world boss
// runs through HP-gated phases that escalate fire cadence, telegraph AoE hazard zones,
// summon adds, and finally enrage on a timer. The server owns all of it; this is the script.

export interface RaidPhase {
  atHpFrac: number; // enter this phase once hp/maxHp drops to ≤ this fraction
  name: string;
  fireMs: number; // boss fire cadence in this phase
  dmgMult: number; // multiplies the boss's per-shot damage
  speedMult: number; // multiplies the boss's chase speed
  aoeEveryMs: number; // telegraph a hazard zone this often (0 = none)
  aoeRadius: number;
  aoeWindupMs: number; // telegraph lead time before detonation (the dodge window)
  aoeDmg: number;
  summonOnEnter: number; // adds spawned when this phase begins
  summonKind: number; // ENEMY_ARCHES index for the adds
}

export interface EnrageSpec {
  fireMs: number;
  dmgMult: number;
  aoeEveryMs: number;
  aoeRadius: number;
  aoeWindupMs: number;
  aoeDmg: number;
}

export interface RaidScript {
  phases: RaidPhase[]; // ordered by DESCENDING atHpFrac (full-health phase first)
  enrageMs: number; // time after first engage until the boss enrages (a soft DPS check)
  enrage: EnrageSpec;
  hpPerExtraPlayer: number; // +fraction of base HP per additional player at engage
  maxHpScale: number; // cap on the player-count HP multiplier
}

/** Default script — used when no named variant matches. */
export const RAID_SCRIPT: RaidScript = {
  phases: [
    { atHpFrac: 1.0, name: "ASSAULT", fireMs: 1400, dmgMult: 1.0, speedMult: 1.0, aoeEveryMs: 6000, aoeRadius: 92, aoeWindupMs: 1400, aoeDmg: 40, summonOnEnter: 0, summonKind: 1 },
    { atHpFrac: 0.66, name: "ESCALATION", fireMs: 1100, dmgMult: 1.2, speedMult: 1.1, aoeEveryMs: 4500, aoeRadius: 112, aoeWindupMs: 1300, aoeDmg: 55, summonOnEnter: 3, summonKind: 1 },
    { atHpFrac: 0.33, name: "DESPERATION", fireMs: 850, dmgMult: 1.45, speedMult: 1.25, aoeEveryMs: 3000, aoeRadius: 132, aoeWindupMs: 1100, aoeDmg: 72, summonOnEnter: 4, summonKind: 3 },
  ],
  enrageMs: 35000,
  enrage: { fireMs: 480, dmgMult: 1.9, aoeEveryMs: 2200, aoeRadius: 150, aoeWindupMs: 950, aoeDmg: 95 },
  hpPerExtraPlayer: 0.6,
  maxHpScale: 4,
};

/** Named world-boss flavors — different cadence/summons so each portrait fights differently. */
const NAMED_SCRIPTS: Record<string, Partial<RaidScript> & { phases?: RaidPhase[] }> = {
  "THE GUTTER KING": {
    phases: [
      { atHpFrac: 1.0, name: "PACK HUNT", fireMs: 1200, dmgMult: 0.95, speedMult: 1.15, aoeEveryMs: 7000, aoeRadius: 80, aoeWindupMs: 1200, aoeDmg: 32, summonOnEnter: 2, summonKind: 1 },
      { atHpFrac: 0.55, name: "RABID", fireMs: 900, dmgMult: 1.25, speedMult: 1.35, aoeEveryMs: 4000, aoeRadius: 100, aoeWindupMs: 1100, aoeDmg: 50, summonOnEnter: 4, summonKind: 1 },
      { atHpFrac: 0.25, name: "KING'S FURY", fireMs: 700, dmgMult: 1.5, speedMult: 1.45, aoeEveryMs: 2800, aoeRadius: 120, aoeWindupMs: 1000, aoeDmg: 68, summonOnEnter: 5, summonKind: 3 },
    ],
    enrageMs: 32000,
  },
  "ANDURIL SENTINEL": {
    phases: [
      { atHpFrac: 1.0, name: "LOCK-ON", fireMs: 1600, dmgMult: 1.15, speedMult: 0.85, aoeEveryMs: 5500, aoeRadius: 100, aoeWindupMs: 1600, aoeDmg: 48, summonOnEnter: 0, summonKind: 2 },
      { atHpFrac: 0.7, name: "RAIL BARRAGE", fireMs: 1000, dmgMult: 1.35, speedMult: 0.9, aoeEveryMs: 3800, aoeRadius: 130, aoeWindupMs: 1400, aoeDmg: 70, summonOnEnter: 2, summonKind: 2 },
      { atHpFrac: 0.35, name: "OVERHEAT", fireMs: 750, dmgMult: 1.6, speedMult: 1.05, aoeEveryMs: 2600, aoeRadius: 150, aoeWindupMs: 1100, aoeDmg: 90, summonOnEnter: 3, summonKind: 5 },
    ],
    enrageMs: 40000,
    enrage: { fireMs: 420, dmgMult: 2.1, aoeEveryMs: 1800, aoeRadius: 160, aoeWindupMs: 900, aoeDmg: 110 },
  },
  "PALANTIR ORACLE": {
    phases: [
      { atHpFrac: 1.0, name: "PREDICTION", fireMs: 1300, dmgMult: 1.05, speedMult: 1.0, aoeEveryMs: 5000, aoeRadius: 110, aoeWindupMs: 1500, aoeDmg: 44, summonOnEnter: 1, summonKind: 1 },
      { atHpFrac: 0.6, name: "OMNISCIENCE", fireMs: 950, dmgMult: 1.3, speedMult: 1.1, aoeEveryMs: 3200, aoeRadius: 140, aoeWindupMs: 1200, aoeDmg: 62, summonOnEnter: 3, summonKind: 4 },
      { atHpFrac: 0.3, name: "INEVITABLE", fireMs: 800, dmgMult: 1.55, speedMult: 1.2, aoeEveryMs: 2400, aoeRadius: 155, aoeWindupMs: 1000, aoeDmg: 80, summonOnEnter: 4, summonKind: 4 },
    ],
    enrageMs: 38000,
  },
  "TIDAL LEVIATHAN": {
    phases: [
      { atHpFrac: 1.0, name: "SURGE", fireMs: 1500, dmgMult: 1.1, speedMult: 0.95, aoeEveryMs: 4800, aoeRadius: 140, aoeWindupMs: 1700, aoeDmg: 55, summonOnEnter: 0, summonKind: 3 },
      { atHpFrac: 0.65, name: "UNDERTON", fireMs: 1100, dmgMult: 1.25, speedMult: 1.05, aoeEveryMs: 3600, aoeRadius: 160, aoeWindupMs: 1400, aoeDmg: 72, summonOnEnter: 2, summonKind: 3 },
      { atHpFrac: 0.35, name: "DROWN", fireMs: 850, dmgMult: 1.5, speedMult: 1.15, aoeEveryMs: 2800, aoeRadius: 180, aoeWindupMs: 1200, aoeDmg: 95, summonOnEnter: 3, summonKind: 3 },
    ],
    enrageMs: 42000,
  },
  "THE MAW": {
    phases: [
      { atHpFrac: 1.0, name: "HUNGER", fireMs: 1100, dmgMult: 1.2, speedMult: 1.2, aoeEveryMs: 6500, aoeRadius: 90, aoeWindupMs: 1100, aoeDmg: 50, summonOnEnter: 3, summonKind: 1 },
      { atHpFrac: 0.5, name: "DEVOUR", fireMs: 850, dmgMult: 1.45, speedMult: 1.35, aoeEveryMs: 3500, aoeRadius: 115, aoeWindupMs: 1000, aoeDmg: 75, summonOnEnter: 5, summonKind: 3 },
      { atHpFrac: 0.2, name: "VOID GULP", fireMs: 650, dmgMult: 1.7, speedMult: 1.5, aoeEveryMs: 2200, aoeRadius: 130, aoeWindupMs: 900, aoeDmg: 100, summonOnEnter: 6, summonKind: 6 },
    ],
    enrageMs: 30000,
  },
  "VOID HERALD": {
    phases: [
      { atHpFrac: 1.0, name: "ECLIPSE", fireMs: 1350, dmgMult: 1.15, speedMult: 1.05, aoeEveryMs: 5200, aoeRadius: 120, aoeWindupMs: 1500, aoeDmg: 58, summonOnEnter: 2, summonKind: 4 },
      { atHpFrac: 0.6, name: "NULL FIELD", fireMs: 950, dmgMult: 1.4, speedMult: 1.15, aoeEveryMs: 3000, aoeRadius: 145, aoeWindupMs: 1200, aoeDmg: 78, summonOnEnter: 4, summonKind: 5 },
      { atHpFrac: 0.28, name: "APOCALYPSE", fireMs: 700, dmgMult: 1.75, speedMult: 1.3, aoeEveryMs: 2000, aoeRadius: 170, aoeWindupMs: 950, aoeDmg: 105, summonOnEnter: 5, summonKind: 6 },
    ],
    enrageMs: 36000,
    enrage: { fireMs: 400, dmgMult: 2.2, aoeEveryMs: 1600, aoeRadius: 180, aoeWindupMs: 850, aoeDmg: 120 },
    hpPerExtraPlayer: 0.7,
    maxHpScale: 4.5,
  },
};

function mergeScript(base: RaidScript, partial: Partial<RaidScript> & { phases?: RaidPhase[] }): RaidScript {
  return {
    phases: partial.phases ?? base.phases,
    enrageMs: partial.enrageMs ?? base.enrageMs,
    enrage: partial.enrage ?? base.enrage,
    hpPerExtraPlayer: partial.hpPerExtraPlayer ?? base.hpPerExtraPlayer,
    maxHpScale: partial.maxHpScale ?? base.maxHpScale,
  };
}

/** Resolve the raid script for a world-boss display name (case-insensitive). */
export function raidScriptFor(bossName?: string): RaidScript {
  if (!bossName) return RAID_SCRIPT;
  const key = bossName.trim().toUpperCase();
  const named = NAMED_SCRIPTS[key];
  if (named) return mergeScript(RAID_SCRIPT, named);
  // Partial match (e.g. "GUTTER KING" without THE)
  for (const [k, v] of Object.entries(NAMED_SCRIPTS)) {
    if (key.includes(k) || k.includes(key)) return mergeScript(RAID_SCRIPT, v);
  }
  return RAID_SCRIPT;
}

/** Current phase index from the boss's HP fraction (deepest phase whose gate is met). */
export function phaseForHp(script: RaidScript, hpFrac: number): number {
  let idx = 0;
  for (let i = 0; i < script.phases.length; i++) if (hpFrac <= script.phases[i].atHpFrac) idx = i;
  return idx;
}

/** The HP multiplier for a raid of `n` players (locked in when the fight begins). */
export function raidHpScale(script: RaidScript, n: number): number {
  return Math.min(script.maxHpScale, 1 + script.hpPerExtraPlayer * Math.max(0, n - 1));
}
