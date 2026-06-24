// METROPHAGE — elite enemy modifiers. A rolled-on-spawn prefix that buffs an HSS unit,
// gives it a coloured aura + a louder deploy bark, and pays out better. One modifier is
// status-resistance (WARDED); heavier tiers also resist innately (EnemyTierDef.statusResist).
// Pure data; GameScene applies hp/speed, the status-duration cut, the volatile death
// burst, and the loot/XP bonus.

export interface EliteModifier {
  id: string;
  name: string; // prefix shown on the deploy callout ("ARMORED PATROL")
  aura: number; // aura ring + tint colour
  hpMult: number;
  speedMult: number;
  statusResist: number; // 0..1 — fraction of a status's duration removed (1 = immune)
  volatile: boolean; // bursts for AoE on death
  lootBonus: number; // added to the loot rarity boost
  xpMult: number; // kill XP/credits multiplier
}

export const ELITE_MODS: EliteModifier[] = [
  // Tanky, slow, shrugs off some status.
  { id: "armored", name: "ARMORED", aura: 0xc6d2e6, hpMult: 1.9, speedMult: 0.9, statusResist: 0.35, volatile: false, lootBonus: 1.0, xpMult: 1.9 },
  // Fast harasser.
  { id: "swift", name: "SWIFT", aura: 0x39ffd0, hpMult: 1.15, speedMult: 1.55, statusResist: 0, volatile: false, lootBonus: 0.8, xpMult: 1.6 },
  // Explodes on death — punishes greedy point-blank kills.
  { id: "volatile", name: "VOLATILE", aura: 0xff7a3c, hpMult: 1.3, speedMult: 1.1, statusResist: 0, volatile: true, lootBonus: 1.1, xpMult: 1.9 },
  // Status-warded: burns/chills barely take, shock rarely lands.
  { id: "warded", name: "WARDED", aura: 0xb06bff, hpMult: 1.45, speedMult: 1.0, statusResist: 0.85, volatile: false, lootBonus: 1.3, xpMult: 2.1 },
];

/** Roll an elite modifier at the given probability (else undefined). */
export function rollElite(chance: number): EliteModifier | undefined {
  if (Math.random() >= chance) return undefined;
  return ELITE_MODS[Math.floor(Math.random() * ELITE_MODS.length)];
}
