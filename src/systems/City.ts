import { DISTRICTS, getDistrict, DistrictDef } from "../game/districts";

/**
 * CITY — campaign meta-state + the save-wide SINGULARITY. Tracks the current
 * district, which are secured, and the contagion meter (0..100) that ALL activity
 * pushes — kills, node infections, held-cluster ticks, and securing districts.
 * It can't pass 96 until every district is secured (so the boss-gated HSS CORE
 * must fall first); the final secure completes it → meltdown. Pure logic, no
 * Phaser; persisted in the save. NG+ cycle lives here too.
 */
export interface CityData {
  index: number;
  contagion: number; // 0..100
  cleared: string[]; // district ids
  cycle: number; // NG+ counter (Step 6)
}

export default class City {
  index = 0;
  contagion = 0;
  cleared: string[] = [];
  cycle = 0;

  constructor(data?: CityData) {
    if (data) {
      this.index = data.index ?? 0;
      this.contagion = data.contagion ?? 0;
      this.cleared = [...(data.cleared ?? [])];
      this.cycle = data.cycle ?? 0;
    }
  }

  /** The district currently being run. */
  get current(): DistrictDef {
    return getDistrict(this.index);
  }

  get next(): DistrictDef {
    return getDistrict(this.index + 1);
  }

  isCleared(id: string): boolean {
    return this.cleared.includes(id);
  }

  /** A district is reachable once the previous one is secured (index 0 is always). */
  isUnlocked(index: number): boolean {
    if (index <= 0) return true;
    const prev = DISTRICTS[index - 1];
    return !!prev && this.isCleared(prev.id);
  }

  /** Every district secured — the last gate before the city can melt down. */
  get allSecured(): boolean {
    return DISTRICTS.every((d) => this.cleared.includes(d.id));
  }

  get normalized(): number {
    return Math.min(1, this.contagion / 100);
  }

  /** Threshold reached → meltdown (only possible once every district is secured). */
  get isComplete(): boolean {
    return this.contagion >= 100;
  }

  /** Push the Singularity. Clamped to 96 until the whole city is secured. */
  addSingularity(amount: number) {
    if (amount <= 0) return;
    const cap = this.allSecured ? 100 : 96;
    this.contagion = Math.min(cap, this.contagion + amount);
  }

  /** Mark a district secured + bank its worth. The final secure completes the city. */
  secure(id: string, bonus: number) {
    if (!this.cleared.includes(id)) this.cleared.push(id);
    this.addSingularity(bonus);
    if (this.allSecured) this.contagion = 100;
  }

  toData(): CityData {
    return {
      index: this.index,
      contagion: this.contagion,
      cleared: [...this.cleared],
      cycle: this.cycle,
    };
  }
}
