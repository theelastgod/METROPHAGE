import { HEAT } from "../config";

/**
 * HEAT meter (0..100). Pure game-logic — no Phaser. Rises from dealing damage /
 * infecting (the scene calls add()), decays after a grace window when passive.
 * Above the buff threshold the player is "overclocked" (damage + move-speed).
 */
export default class Heat {
  value = 0;
  private lastGainAt = -Infinity;

  add(amount: number, now: number) {
    if (amount <= 0) return;
    this.value = Math.min(HEAT.max, this.value + amount);
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

  get buffActive(): boolean {
    return this.value > HEAT.buffThreshold;
  }

  get damageMult(): number {
    return this.buffActive ? HEAT.buffDamageMult : 1;
  }

  get speedMult(): number {
    return this.buffActive ? HEAT.buffSpeedMult : 1;
  }
}
