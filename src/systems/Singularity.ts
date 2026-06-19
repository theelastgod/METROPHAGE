import { SINGULARITY } from "../config";

/**
 * SINGULARITY — global progress toward meltdown (0..100). Pure logic, no Phaser.
 * Only ever rises: ticked by infected nodes over time and bumped by kills.
 */
export default class Singularity {
  value = 0;

  add(amount: number) {
    if (amount > 0) this.value = Math.min(SINGULARITY.max, this.value + amount);
  }

  get normalized(): number {
    return this.value / SINGULARITY.max;
  }

  get isComplete(): boolean {
    return this.value >= SINGULARITY.max;
  }
}
