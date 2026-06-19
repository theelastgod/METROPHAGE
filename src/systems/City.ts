import { DISTRICTS, getDistrict, DistrictDef } from "../game/districts";

/**
 * CITY — campaign meta-state. Tracks which district the run is in, which have been
 * cleared (node infected), and the global contagion % (sum of cleared districts'
 * worth). When contagion hits 100 — i.e. the final district falls — the city melts
 * down. Pure logic, no Phaser; persisted in the save. NG+ cycle lives here too.
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

  get normalized(): number {
    return Math.min(1, this.contagion / 100);
  }

  /** True once the whole city is taken (final district cleared). */
  get isComplete(): boolean {
    return this.contagion >= 100;
  }

  /**
   * Mark the current district cleared: bank its contagion and advance the index.
   * Returns true if this completed the city (final district / contagion 100).
   */
  clearCurrent(): boolean {
    const d = this.current;
    if (!this.isCleared(d.id)) {
      this.cleared.push(d.id);
      this.contagion = Math.min(100, this.contagion + d.contagion);
    }
    const wasFinal = !!d.isFinal || this.index >= DISTRICTS.length - 1;
    if (!wasFinal) this.index++;
    return wasFinal || this.isComplete;
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
