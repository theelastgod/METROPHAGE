// METROPHAGE — RuneScape-style single-player quests for the city hub. A quest is given
// by an NPC, runs an ordered list of stages (collect items, or talk to a target NPC),
// and is turned in back at the giver for a reward. The CityQuests state machine tracks
// progress; CityScene resolves what to say when you talk to an NPC, spawns collectibles,
// and shows the journal.

export interface QStage {
  label: string; // journal objective text
  kind: "collect" | "talk";
  // collect:
  item?: string; // collectible id spawned in the city
  count?: number;
  // talk:
  target?: string; // npc id to talk to
  targetLine?: string[]; // what the target says (advances the stage)
  // shown by the GIVER while this stage is active:
  reminder?: string[];
}

export interface CityQuestDef {
  id: string;
  name: string;
  giver: string; // npc id
  offer: string[]; // giver pitches the quest (player then accepts/declines)
  accepted: string[]; // giver's reply on accept
  stages: QStage[];
  complete: string[]; // giver's reply when you turn it in
  reward: { xp: number; credits: number };
}

export const CITY_QUESTS: CityQuestDef[] = [
  {
    id: "missing_shipment",
    name: "Missing Shipment",
    giver: "rin",
    offer: [
      "A drop went dark in the warrens — three data-cores, gone.",
      "Sweep the streets, recover them, bring them back. Credits in it for you.",
    ],
    accepted: ["Good. They glow — you won't miss them. Watch the alleys."],
    stages: [
      {
        label: "Recover 3 data-cores from the streets",
        kind: "collect",
        item: "datacore",
        count: 3,
        reminder: ["Still missing cores. Check the side-streets — they glow green."],
      },
    ],
    complete: ["All three. You're solid, runner. Spend it somewhere loud."],
    reward: { xp: 220, credits: 180 },
  },
  {
    id: "clinic_debt",
    name: "The Clinic's Debt",
    giver: "doc",
    offer: [
      "Old Marek in the slums is out of cell-mesh and too proud to ask.",
      "Carry this dose to him. He'll grumble. Let him.",
    ],
    accepted: ["Bless you. He's east, past the dirt. Tell him Halo sent you."],
    stages: [
      {
        label: "Deliver the cell-mesh to OLD MAREK",
        kind: "talk",
        target: "marek",
        targetLine: [
          "Cell-mesh? Halo sent you. Of course she did.",
          "…Tell her the old man says thank you. Quietly.",
        ],
        reminder: ["Marek's east, in the slums. Don't keep him waiting."],
      },
    ],
    complete: ["He took it? Good. The proud ones are the ones you lose. Here — you earned this."],
    reward: { xp: 180, credits: 140 },
  },
  {
    id: "word_street",
    name: "Word on the Street",
    giver: "vex",
    offer: [
      "I trade in whispers, and three mouths owe me a few.",
      "Find Juno, Sable, and Kessler. Hear them out. Bring it back to me.",
    ],
    accepted: ["Discreetly, runner. People clam up when they smell a broker."],
    stages: [
      {
        label: "Gather word from JUNO, SABLE, and KESSLER",
        kind: "talk",
        target: "juno",
        targetLine: ["Word? Yeah — corp convoys are running heavy through the Stacks. Someone's scared."],
      },
      {
        label: "Gather word from SABLE and KESSLER",
        kind: "talk",
        target: "sable",
        targetLine: ["Off the record? A tower exec drank here last night. Kept saying 'the meltdown's a feature'."],
      },
      {
        label: "Gather word from KESSLER",
        kind: "talk",
        target: "kessler",
        targetLine: ["You didn't hear it from me: they're moving the core offsite. Before the next cycle."],
        reminder: ["Three mouths: Juno, Sable, Kessler. I'm waiting."],
      },
    ],
    complete: ["…the core, offsite. That's worth real money. Pleasure doing business."],
    reward: { xp: 260, credits: 220 },
  },
];

export function questDef(id: string): CityQuestDef | undefined {
  return CITY_QUESTS.find((q) => q.id === id);
}

type Status = "available" | "active" | "turnin" | "done";

interface QState {
  status: Status;
  stage: number;
  progress: number; // collect count so far
}

/** What talking to an NPC should produce, for CityScene to render via the DialogueBox. */
export type TalkResult =
  | { kind: "lines"; speaker: string; lines: string[] }
  | { kind: "offer"; speaker: string; questId: string; name: string; lines: string[] }
  | { kind: "reward"; speaker: string; lines: string[]; questName: string; xp: number; credits: number };

/** Quest state machine for the city. Self-contained (no GameScene coupling). */
export class CityQuests {
  private states = new Map<string, QState>();
  xp = 0;
  credits = 0;

  private state(id: string): QState {
    let s = this.states.get(id);
    if (!s) {
      s = { status: "available", stage: 0, progress: 0 };
      this.states.set(id, s);
    }
    return s;
  }

  isActive(id: string): boolean {
    const s = this.states.get(id);
    return !!s && (s.status === "active" || s.status === "turnin");
  }
  isDone(id: string): boolean {
    return this.states.get(id)?.status === "done";
  }

  /** Accept an offered quest. */
  accept(id: string) {
    const s = this.state(id);
    if (s.status === "available") {
      s.status = "active";
      s.stage = 0;
      s.progress = 0;
    }
  }

  /** The collectible item id the active collect-stage needs (or null). */
  activeCollectItem(): { item: string; remaining: number } | null {
    for (const def of CITY_QUESTS) {
      const s = this.states.get(def.id);
      if (!s || s.status !== "active") continue;
      const stage = def.stages[s.stage];
      if (stage?.kind === "collect" && stage.item) return { item: stage.item, remaining: (stage.count ?? 1) - s.progress };
    }
    return null;
  }

  /** Picked up a collectible — advances a matching collect stage. Returns a toast, if completed. */
  collect(item: string): string | null {
    for (const def of CITY_QUESTS) {
      const s = this.states.get(def.id);
      if (!s || s.status !== "active") continue;
      const stage = def.stages[s.stage];
      if (stage?.kind === "collect" && stage.item === item) {
        s.progress++;
        if (s.progress >= (stage.count ?? 1)) {
          this.advance(def, s);
          return `${def.name}: objective complete — return to ${def.giver.toUpperCase()}`;
        }
        return `${def.name}: ${(stage.count ?? 1) - s.progress} ${item} left`;
      }
    }
    return null;
  }

  private advance(def: CityQuestDef, s: QState) {
    s.stage++;
    s.progress = 0;
    if (s.stage >= def.stages.length) s.status = "turnin";
  }

  /** Resolve a conversation with an NPC against the quest state. */
  onTalk(npcId: string, npcName: string, flavor: string[], givesQuest?: string): TalkResult {
    // 1) Is this NPC involved in an active quest's current stage, or a turn-in?
    for (const def of CITY_QUESTS) {
      const s = this.states.get(def.id);
      if (!s) continue;
      if (s.status === "turnin" && def.giver === npcId) {
        s.status = "done";
        this.xp += def.reward.xp;
        this.credits += def.reward.credits;
        return { kind: "reward", speaker: npcName, lines: def.complete, questName: def.name, xp: def.reward.xp, credits: def.reward.credits };
      }
      if (s.status === "active") {
        const stage = def.stages[s.stage];
        if (stage.kind === "talk" && stage.target === npcId) {
          const lines = stage.targetLine ?? ["…"];
          this.advance(def, s);
          return { kind: "lines", speaker: npcName, lines };
        }
        if (def.giver === npcId && stage.reminder) return { kind: "lines", speaker: npcName, lines: stage.reminder };
      }
    }
    // 2) Does this NPC offer a fresh quest?
    if (givesQuest) {
      const s = this.state(givesQuest);
      if (s.status === "available") {
        const def = questDef(givesQuest);
        if (def) return { kind: "offer", speaker: npcName, questId: def.id, name: def.name, lines: def.offer };
      }
    }
    // 3) Flavour.
    return { kind: "lines", speaker: npcName, lines: flavor };
  }

  /** Active quests + their current objective, for the journal. */
  journal(): Array<{ name: string; objective: string }> {
    const out: Array<{ name: string; objective: string }> = [];
    for (const def of CITY_QUESTS) {
      const s = this.states.get(def.id);
      if (!s) continue;
      if (s.status === "active") {
        const stage = def.stages[s.stage];
        let obj = stage.label;
        if (stage.kind === "collect") obj += `  (${s.progress}/${stage.count})`;
        out.push({ name: def.name, objective: obj });
      } else if (s.status === "turnin") {
        out.push({ name: def.name, objective: `Return to ${def.giver.toUpperCase()}` });
      } else if (s.status === "done") {
        out.push({ name: def.name, objective: "✓ complete" });
      }
    }
    return out;
  }
}
