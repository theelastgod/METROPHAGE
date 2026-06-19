import {
  Contract,
  AUTHORED,
  generateRepeatable,
  ObjectiveType,
} from "../game/contracts";

export interface ContractsData {
  active: Contract | null;
  offers: Contract[];
  completedAuthored: string[];
}

/**
 * Contract manager (pure logic). Holds 3 board offers + one active contract,
 * advances objective progress from game events, and reports completion. Authored
 * contracts unlock in order; the board fills with generated repeatables.
 */
export default class Contracts {
  offers: Contract[] = [];
  active: Contract | null = null;
  completedAuthored = new Set<string>();

  constructor(data?: ContractsData) {
    if (data) {
      this.active = data.active;
      this.offers = data.offers ?? [];
      this.completedAuthored = new Set(data.completedAuthored ?? []);
    }
  }

  /** Rebuild board offers: next uncompleted authored + generated repeatables. */
  refresh(level: number) {
    this.offers = [];
    const nextAuthored = AUTHORED.find((c) => !this.completedAuthored.has(c.id));
    if (nextAuthored && this.active?.id !== nextAuthored.id) {
      this.offers.push(structuredClone(nextAuthored));
    }
    while (this.offers.length < 3) this.offers.push(generateRepeatable(level));
  }

  accept(contract: Contract) {
    this.active = contract;
    this.offers = this.offers.filter((c) => c.id !== contract.id);
  }

  abandon() {
    this.active = null;
  }

  private progress(type: ObjectiveType, amount: number) {
    if (!this.active) return;
    for (const o of this.active.objectives) {
      if (o.type === type && o.have < o.need) o.have = Math.min(o.need, o.have + amount);
    }
  }

  onKill() {
    this.progress("eliminate", 1);
  }
  onShieldBreak() {
    this.progress("hack", 1);
  }
  onInfect() {
    this.progress("infect", 1);
  }

  /** Per-frame: advance hold (in-zone time) and deliver (reached) objectives. */
  tick(px: number, py: number, dtMs: number) {
    if (!this.active) return;
    for (const o of this.active.objectives) {
      if (!o.zone) continue;
      const inZone = Math.hypot(px - o.zone.x, py - o.zone.y) <= o.zone.r;
      if (o.type === "hold" && inZone) o.have = Math.min(o.need, o.have + dtMs / 1000);
      if (o.type === "deliver" && inZone) o.have = o.need;
    }
  }

  get isComplete(): boolean {
    return !!this.active && this.active.objectives.every((o) => o.have >= o.need);
  }

  /** Finalize the active contract; returns it (for rewards). */
  completeActive(): Contract | null {
    const c = this.active;
    if (!c) return null;
    if (c.authored) this.completedAuthored.add(c.id);
    this.active = null;
    return c;
  }

  toData(): ContractsData {
    return {
      active: this.active,
      offers: this.offers,
      completedAuthored: [...this.completedAuthored],
    };
  }
}
