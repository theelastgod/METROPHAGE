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
  // ── kit-mods: rare gear lines that change HOW the kit behaves, not just numbers ──
  dashTrailPct: number; // dash leaves a contagion damage trail (roll scales the damage)
  abilityEchoPct: number; // the signature (Q) echoes moments later at a damage fraction
  killNovaPct: number; // kills detonate a friendly nova (roll scales the damage)
  ultHeatDiscount: number; // flat HEAT-threshold reduction on the ultimate (R)
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
  dashTrailPct: 0,
  abilityEchoPct: 0,
  killNovaPct: 0,
  ultHeatDiscount: 0,
};

export function addMods(a: ModBag, b: Partial<ModBag>): ModBag {
  const out = { ...a };
  (Object.keys(ZERO_MODS) as (keyof ModBag)[]).forEach((key) => {
    out[key] = a[key] + (b[key] ?? 0);
  });
  return out;
}

export function scaleMods(b: Partial<ModBag>, k: number): Partial<ModBag> {
  const out: Partial<ModBag> = {};
  (Object.keys(b) as (keyof ModBag)[]).forEach((key) => {
    out[key] = (b[key] ?? 0) * k;
  });
  return out;
}
