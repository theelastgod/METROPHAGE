import { QUESTS, QuestDef, QuestStage, QuestTriggerType, getQuest } from "../game/quests";

/**
 * QUESTS — quest state + flags. One active quest at a time (Quest 1 is enough to
 * prove the pipeline); stage progression on gameplay triggers (infect/dive/kill/
 * secure) or talk (resolved by dialogue). Pure logic; persisted in the save.
 */
export interface QuestsData {
  activeId: string | null;
  stage: number;
  progress: number;
  completed: string[];
  flags: string[];
}

export default class Quests {
  activeId: string | null = null;
  stage = 0;
  progress = 0;
  completed: string[] = [];
  flags = new Set<string>();

  constructor(data?: QuestsData) {
    if (data) {
      this.activeId = data.activeId ?? null;
      this.stage = data.stage ?? 0;
      this.progress = data.progress ?? 0;
      this.completed = [...(data.completed ?? [])];
      this.flags = new Set(data.flags ?? []);
    }
  }

  get active(): QuestDef | null {
    return this.activeId ? getQuest(this.activeId) ?? null : null;
  }
  get currentStage(): QuestStage | null {
    const q = this.active;
    return q ? q.stages[this.stage] ?? null : null;
  }

  hasFlag(f: string): boolean {
    return this.flags.has(f);
  }
  isCompleted(id: string): boolean {
    return this.completed.includes(id);
  }
  /** Offered = exists, not active, not done, and its flag gate (if any) is met. */
  isOffered(id: string): boolean {
    const q = getQuest(id);
    if (!q || this.activeId === id || this.isCompleted(id)) return false;
    return !q.requiresFlag || this.hasFlag(q.requiresFlag);
  }
  /** The next quest the FIXER can offer right now (data order), or null. */
  nextOffer(): QuestDef | null {
    return QUESTS.find((q) => this.isOffered(q.id)) ?? null;
  }
  isTalkStage(): boolean {
    return !!this.active && this.currentStage?.on.type === "talk";
  }

  accept(id: string) {
    if (!getQuest(id)) return;
    this.activeId = id;
    this.stage = 0;
    this.progress = 0;
  }

  /** Fire a gameplay trigger. Returns "advanced" if it moved to a new stage. */
  onTrigger(type: QuestTriggerType): "advanced" | "progress" | null {
    const s = this.currentStage;
    if (!this.active || !s || s.on.type !== type || type === "talk") return null;
    this.progress++;
    if (this.progress >= (s.on.count ?? 1)) {
      this.stage++;
      this.progress = 0;
      return "advanced";
    }
    return "progress";
  }

  /** Complete the active quest (its final talk dialogue resolved). */
  completeActive(): QuestDef | null {
    const q = this.active;
    if (!q) return null;
    if (!this.completed.includes(q.id)) this.completed.push(q.id);
    if (q.setsFlag) this.flags.add(q.setsFlag);
    this.activeId = null;
    this.stage = 0;
    this.progress = 0;
    return q;
  }

  toData(): QuestsData {
    return {
      activeId: this.activeId,
      stage: this.stage,
      progress: this.progress,
      completed: [...this.completed],
      flags: [...this.flags],
    };
  }
}
