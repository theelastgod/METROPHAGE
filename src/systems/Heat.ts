import { HEAT } from "../config";

/**
 * HEAT meter (0..100). Pure game-logic — no Phaser. Rises from dealing damage /
 * infecting (the scene calls add()), decays after a grace window when passive.
 * Tiers (0/25/50/75/100) grant escalating damage / move-speed / ability-charge
 * buffs; >=50 enables ultimates; ==100 enables a manual Overdrive.
 */
export default class Heat {
  value = 0;
  private lastGainAt = -Infinity;

  add(amount: number, now: number) {
    if (amount <= 0) return;
    this.value = Math.min(HEAT.max, this.value + amount);
    this.lastGainAt = now;
  }

  spend(amount: number) {
    this.value = Math.max(0, this.value - amount);
  }

  reset(now: number) {
    this.value = 0;
    this.lastGainAt = now;
  }

  /** Advance decay. now/dtMs come from the game clock. */
  update(now: number, dtMs: number) {
    if (this.value > 0 && now - this.lastGainAt >= HEAT.decayDelayMs) {
      this.value = Math.max(0, this.value - HEAT.decayPerSec * (dtMs / 1000));
    }
  }

  /** 0..1 for shaders / bars. */
  get normalized(): number {
    return this.value / HEAT.max;
  }

  /** 0..4 */
  get tier(): number {
    return Math.min(HEAT.tiers.length - 1, Math.floor(this.value / HEAT.tierStep));
  }

  get damageMult(): number {
    return HEAT.tiers[this.tier].dmg;
  }
  get speedMult(): number {
    return HEAT.tiers[this.tier].spd;
  }
  get abilityRate(): number {
    return HEAT.tiers[this.tier].ability;
  }

  get canUlt(): boolean {
    return this.value >= HEAT.ultThreshold;
  }
  get canOverdrive(): boolean {
    return this.value >= HEAT.max;
  }
  /** "Powered up" — used for HUD accenting. */
  get buffActive(): boolean {
    return this.value > HEAT.ultThreshold;
  }
}
