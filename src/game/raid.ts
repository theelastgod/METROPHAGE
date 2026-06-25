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

/** One script drives every world boss (its base HP comes from the roster). */
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
