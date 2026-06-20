// METROPHAGE — ICE dives. Entering an ICE node drops you into an instanced run:
// a contained arena, escalating enemy waves, then an ICE core to break for a
// payout. Data-driven; procedural dives are generated per district, and scripted
// "story dives" are authored (a fixed fragment at the core). The DiveScene reads
// a DiveDef; GameScene assigns the memory-fragment hook.

export interface DiveWave {
  tier: string; // ENEMY_TIERS id
  count: number;
}

export interface DiveReward {
  xp: number;
  currency: number;
  loot: number;
  lootBoost: number;
}

export interface DiveDef {
  id: string;
  name: string;
  waves: DiveWave[]; // cleared in order; escalating
  reward: DiveReward;
  fragmentId?: string; // memory-fragment surfaced at the core (the story hook)
  scripted?: boolean; // hand-authored story dive vs. repeatable
}

/** Handed back to GameScene (via the registry) when a dive ends. */
export interface DiveResult {
  success: boolean;
  reward: DiveReward;
  fragmentId?: string;
}

/** A repeatable dive scaled to player level + district threat. */
export function generateDive(level: number, threat: number): DiveDef {
  const waveCount = 3 + Math.min(2, threat); // 3..5 waves
  const ladder = ["patrol", "patrol", "enforcer", "enforcer", "purge"];
  const waves: DiveWave[] = [];
  for (let w = 0; w < waveCount; w++) {
    // escalate the tier as waves go on; scale to threat so late districts bite
    const tierIdx = Math.min(ladder.length - 1, w + (threat >= 2 ? 1 : 0));
    waves.push({ tier: ladder[tierIdx], count: 2 + w + Math.floor(threat / 2) });
  }
  return {
    id: `dive_gen_${Math.floor(Math.random() * 1e9)}`,
    name: "ICE BREACH",
    waves,
    reward: {
      xp: 80 + level * 8 + threat * 30,
      currency: 60 + threat * 25,
      loot: 1 + (threat >= 2 ? 1 : 0),
      lootBoost: 0.6 + threat * 0.4,
    },
  };
}
