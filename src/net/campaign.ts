// METROPHAGE — Path A: the full personal campaign arc, server-authoritative.
// Each player runs the same five-act storyline (THE WAKE → THE AWAKENING) inside the
// shared multiplayer world. Progress is per-player (phased lore); other Blanks advance
// their own beat in parallel. Shared data + pure logic — imported by client UI and
// the Cloudflare Worker alike.

import {
  QUESTS,
  getQuest,
  type QuestDef,
  type QuestStage,
  type QuestTriggerType,
  type QuestReward,
} from "../game/quests";

export type { QuestDef, QuestStage, QuestTriggerType, QuestReward };
export { QUESTS, getQuest };

/** Serializable campaign state — persisted to D1 (`players.campaign`). */
export interface CampaignData {
  activeId: string | null;
  stage: number;
  progress: number;
  completed: string[];
  flags: string[];
}

export const DEFAULT_CAMPAIGN: CampaignData = {
  activeId: null,
  stage: 0,
  progress: 0,
  completed: [],
  flags: [],
};

export function parseCampaign(raw: string | null | undefined): CampaignData {
  if (!raw) return { ...DEFAULT_CAMPAIGN, completed: [], flags: [] };
  try {
    const d = JSON.parse(raw) as Partial<CampaignData>;
    return {
      activeId: d.activeId ?? null,
      stage: d.stage ?? 0,
      progress: d.progress ?? 0,
      completed: [...(d.completed ?? [])],
      flags: [...(d.flags ?? [])],
    };
  } catch {
    return { ...DEFAULT_CAMPAIGN, completed: [], flags: [] };
  }
}

export function serializeCampaign(d: CampaignData): string {
  return JSON.stringify(d);
}

/** Per-player campaign engine — mirrors the old local Quests system, now on the server. */
export class Campaign {
  activeId: string | null = null;
  stage = 0;
  progress = 0;
  completed: string[] = [];
  flags = new Set<string>();

  constructor(data?: CampaignData) {
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

  get done(): boolean {
    return this.completed.length >= QUESTS.length;
  }

  hasFlag(f: string): boolean {
    return this.flags.has(f);
  }

  isCompleted(id: string): boolean {
    return this.completed.includes(id);
  }

  isOffered(id: string): boolean {
    const q = getQuest(id);
    if (!q || this.activeId === id || this.isCompleted(id)) return false;
    return !q.requiresFlag || this.hasFlag(q.requiresFlag);
  }

  nextOffer(): QuestDef | null {
    return QUESTS.find((q) => this.isOffered(q.id)) ?? null;
  }

  isTalkStage(): boolean {
    return !!this.active && this.currentStage?.on.type === "talk";
  }

  accept(id: string): QuestDef | null {
    const q = getQuest(id);
    if (!q || !this.isOffered(id)) return null;
    this.activeId = id;
    this.stage = 0;
    this.progress = 0;
    return q;
  }

  /** Fire a gameplay trigger. Returns "advanced" | "progress" | null. */
  onTrigger(type: QuestTriggerType, n = 1): "advanced" | "progress" | null {
    const s = this.currentStage;
    if (!this.active || !s || s.on.type !== type || type === "talk") return null;
    this.progress += n;
    if (this.progress >= (s.on.count ?? 1)) {
      this.stage++;
      this.progress = 0;
      return "advanced";
    }
    return "progress";
  }

  /** Resolve a talk beat (dialogue with the FIXER). */
  onTalk(): "advanced" | null {
    const s = this.currentStage;
    if (!this.active || !s || s.on.type !== "talk") return null;
    this.stage++;
    this.progress = 0;
    return "advanced";
  }

  /** Finish the active quest after its final stage resolves. */
  completeActive(): QuestDef | null {
    const q = this.active;
    if (!q || this.stage < q.stages.length) return null;
    if (!this.completed.includes(q.id)) this.completed.push(q.id);
    if (q.setsFlag) this.flags.add(q.setsFlag);
    this.activeId = null;
    this.stage = 0;
    this.progress = 0;
    return q;
  }

  /** After a stage advance, maybe the quest just finished. */
  tickAfterAdvance(): QuestDef | null {
    const q = this.active;
    if (!q) return null;
    if (this.stage >= q.stages.length) return this.completeActive();
    return null;
  }

  toData(): CampaignData {
    return {
      activeId: this.activeId,
      stage: this.stage,
      progress: this.progress,
      completed: [...this.completed],
      flags: [...this.flags],
    };
  }
}

/** HUD line for the campaign tracker. */
export function campaignHud(c: Campaign): string {
  const q = c.active;
  const s = c.currentStage;
  if (q && s) {
    const n = s.on.count ?? 1;
    const prog = s.on.type === "talk" ? "" : `   [${c.progress}/${n}]`;
    return `◈ ${q.name} — ${s.objective}${prog}`;
  }
  const next = c.nextOffer();
  if (next) return `◈ ${next.name} — visit THE FIXER`;
  if (c.done) return "◈ THE AWAKENING — the cycle is yours";
  return "◈ METROPHAGE — the city waits";
}

export const CAMPAIGN_DONE_TEXT =
  "You are the Wake. The grid resets, the warrens fill again — and somewhere a new Blank opens its eyes.";