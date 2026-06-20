import { FRAGMENTS } from "../game/fragments";

/**
 * MEMORY — the save-wide log of recovered memory fragments. Dives surface fragments
 * at their core (the required story hook); the questline reads `count` and specific
 * ids. Pure logic, no Phaser; persisted in the save. Order = recovery order.
 */
export interface MemoryData {
  recovered: string[];
}

export default class Memory {
  recovered: string[] = [];

  constructor(data?: MemoryData) {
    if (data?.recovered) this.recovered = [...data.recovered];
  }

  has(id: string): boolean {
    return this.recovered.includes(id);
  }

  /** Record a fragment. Returns true if it was newly recovered. */
  recover(id: string): boolean {
    if (this.has(id)) return false;
    this.recovered.push(id);
    return true;
  }

  /** fragments_recovered counter the quest specs reference. */
  get count(): number {
    return this.recovered.length;
  }

  get total(): number {
    return FRAGMENTS.length;
  }

  toData(): MemoryData {
    return { recovered: [...this.recovered] };
  }
}
