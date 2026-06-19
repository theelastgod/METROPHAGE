import { ModBag, ZERO_MODS, addMods, scaleMods } from "../game/stats";
import { treeFor, SkillNode } from "../game/skills";

export const LEVEL_CAP = 20;
export const RESPEC_COST = 50;

/** Serializable progression state (persisted in the save). */
export interface ProgressData {
  classId: string;
  level: number;
  xp: number;
  skillPoints: number;
  currency: number;
  allocations: Record<string, number>;
  consumables?: Record<string, number>;
}

const xpToNext = (level: number) => 60 + (level - 1) * 45;
const levelMods = (level: number): Partial<ModBag> => ({
  hpAdd: (level - 1) * 5,
  dmgPct: (level - 1) * 0.02,
});

/**
 * Pure progression logic: XP -> levels -> skill points + stat growth, currency,
 * skill allocations + respec, and the aggregate ModBag (level growth + skills).
 */
export default class Progression {
  classId: string;
  level = 1;
  xp = 0;
  skillPoints = 0;
  currency = 0;
  allocations: Record<string, number> = {};
  consumables: Record<string, number> = {};

  constructor(classId: string, data?: ProgressData) {
    this.classId = classId;
    if (data) {
      this.level = data.level;
      this.xp = data.xp;
      this.skillPoints = data.skillPoints;
      this.currency = data.currency;
      this.allocations = { ...data.allocations };
      this.consumables = { ...(data.consumables ?? {}) };
    }
  }

  addConsumable(id: string, n = 1) {
    this.consumables[id] = (this.consumables[id] ?? 0) + n;
  }
  /** Consume one; returns false if none held. */
  useConsumable(id: string): boolean {
    if ((this.consumables[id] ?? 0) <= 0) return false;
    this.consumables[id]--;
    return true;
  }

  get nextLevelXp(): number {
    return xpToNext(this.level);
  }
  get atCap(): boolean {
    return this.level >= LEVEL_CAP;
  }

  /** Add XP; returns the number of levels gained. */
  addXp(amount: number): number {
    if (this.atCap) {
      this.xp = 0;
      return 0;
    }
    this.xp += amount;
    let gained = 0;
    while (!this.atCap && this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      this.skillPoints++;
      gained++;
    }
    if (this.atCap) this.xp = 0;
    return gained;
  }

  addCurrency(n: number) {
    this.currency = Math.max(0, this.currency + n);
  }
  spendCurrency(n: number): boolean {
    if (this.currency < n) return false;
    this.currency -= n;
    return true;
  }

  rankOf(nodeId: string): number {
    return this.allocations[nodeId] ?? 0;
  }

  canAllocate(node: SkillNode): boolean {
    if (this.skillPoints <= 0) return false;
    if (this.rankOf(node.id) >= node.maxRank) return false;
    if (node.requires && this.rankOf(node.requires) <= 0) return false;
    return true;
  }

  allocate(node: SkillNode): boolean {
    if (!this.canAllocate(node)) return false;
    this.allocations[node.id] = this.rankOf(node.id) + 1;
    this.skillPoints--;
    return true;
  }

  /** Refund all spent points (costs currency). */
  respec(): boolean {
    if (!this.spendCurrency(RESPEC_COST)) return false;
    let refunded = 0;
    for (const id in this.allocations) refunded += this.allocations[id];
    this.skillPoints += refunded;
    this.allocations = {};
    return true;
  }

  /** Aggregate modifiers from level growth + allocated skill nodes. */
  mods(): ModBag {
    let m = addMods(ZERO_MODS, levelMods(this.level));
    for (const node of treeFor(this.classId)) {
      const rank = this.rankOf(node.id);
      if (rank > 0) m = addMods(m, scaleMods(node.mods, rank));
    }
    return m;
  }

  toData(): ProgressData {
    return {
      classId: this.classId,
      level: this.level,
      xp: this.xp,
      skillPoints: this.skillPoints,
      currency: this.currency,
      allocations: { ...this.allocations },
      consumables: { ...this.consumables },
    };
  }
}
