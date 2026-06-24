// METROPHAGE — stat modifiers. Skills (Step 4) and gear (Step 5) both contribute
// a ModBag; the scene resolves the aggregate into effective player stats.

export interface ModBag {
  dmgPct: number; // +damage (fraction, 0.1 = +10%)
  movePct: number; // +move speed
  hpAdd: number; // +max HP (flat)
  shieldAdd: number; // +max shield (flat)
  cdReducePct: number; // ability cooldown reduction
  infectPct: number; // infection/channel speed
  hackPct: number; // hack/shield-break potency
  heatGainPct: number; // +heat gained
  heatDecayPct: number; // -heat decay (slower cooldown)
  critPct: number; // chance a direct hit crits (×CRIT_MULT damage)
  lifestealPct: number; // fraction of direct-hit damage healed back
}

export const ZERO_MODS: ModBag = {
  dmgPct: 0,
  movePct: 0,
  hpAdd: 0,
  shieldAdd: 0,
  cdReducePct: 0,
  infectPct: 0,
  hackPct: 0,
  heatGainPct: 0,
  heatDecayPct: 0,
  critPct: 0,
  lifestealPct: 0,
};

export function addMods(a: ModBag, b: Partial<ModBag>): ModBag {
  return {
    dmgPct: a.dmgPct + (b.dmgPct ?? 0),
    movePct: a.movePct + (b.movePct ?? 0),
    hpAdd: a.hpAdd + (b.hpAdd ?? 0),
    shieldAdd: a.shieldAdd + (b.shieldAdd ?? 0),
    cdReducePct: a.cdReducePct + (b.cdReducePct ?? 0),
    infectPct: a.infectPct + (b.infectPct ?? 0),
    hackPct: a.hackPct + (b.hackPct ?? 0),
    heatGainPct: a.heatGainPct + (b.heatGainPct ?? 0),
    heatDecayPct: a.heatDecayPct + (b.heatDecayPct ?? 0),
    critPct: a.critPct + (b.critPct ?? 0),
    lifestealPct: a.lifestealPct + (b.lifestealPct ?? 0),
  };
}

export function scaleMods(b: Partial<ModBag>, k: number): Partial<ModBag> {
  const out: Partial<ModBag> = {};
  (Object.keys(b) as (keyof ModBag)[]).forEach((key) => {
    out[key] = (b[key] ?? 0) * k;
  });
  return out;
}
