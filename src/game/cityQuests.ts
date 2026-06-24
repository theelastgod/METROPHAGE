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
  reward: { xp: number; credits: number; loot?: number; lootBoost?: number }; // loot = gear rolled into the save
  requires?: string; // only offered once this quest id is done (chains the hub line)
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
    complete: ["All three. You're solid, runner. Spend it somewhere loud — and take this, you'll want it out there."],
    reward: { xp: 220, credits: 180, loot: 1, lootBoost: 1 },
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
    complete: ["He took it? Good. The proud ones are the ones you lose. Here — you earned this. Salvaged it off a cop; should fit you."],
    reward: { xp: 180, credits: 140, loot: 1, lootBoost: 1 },
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
    complete: ["…the core, offsite. That's worth real money. Pleasure doing business — and a little something extra, off the books."],
    reward: { xp: 260, credits: 220, loot: 1, lootBoost: 1.1 },
  },

  // ── Hub questline: "the people who stay" — a gated arc, a grounded human
  //    counterpoint to the FIXER's cosmic main quest, tying to THE OTHERS fragment.
  {
    id: "curfew",
    name: "Curfew",
    giver: "kessler",
    requires: "word_street",
    offer: [
      "You brought VEX her whisper, so you can carry one of mine: the System's tightening curfew before the cycle.",
      "Cops sweep the plaza by dark. Warn the ones who won't read the net — JUNO and SABLE — before they get scooped.",
    ],
    accepted: ["Quietly. You're a courier tonight, not a hero. Find them."],
    stages: [
      {
        label: "Warn JUNO about the curfew sweep",
        kind: "talk",
        target: "juno",
        targetLine: [
          "A sweep? Tonight? …Thanks, runner. I outran one cycle. I'll outrun a curfew.",
          "Tell Kessler I owe him a quiet one.",
        ],
      },
      {
        label: "Warn SABLE about the curfew sweep",
        kind: "talk",
        target: "sable",
        targetLine: [
          "Figures. The Feral Cat closes early then — no sense pouring for an empty room.",
          "You're alright. Go on, before they tag you too.",
        ],
        reminder: ["JUNO and SABLE. Before dark. The cops don't knock."],
      },
    ],
    complete: ["Both of them off the street. Good. The cycle takes enough without the cops helping. Here — corp-grade, took it off a curfew van."],
    reward: { xp: 240, credits: 200, loot: 1, lootBoost: 1.2 },
  },
  {
    id: "the_quiet_one",
    name: "The Quiet One",
    giver: "mira",
    requires: "curfew",
    offer: [
      "You did right by Juno, so I'll trust you with what's been keeping me up.",
      "There's a regular at my stall — GHOST. Buys nothing, sells nothing, and the market ledger has no record they were ever issued a body.",
      "I'm not scared of them. I'm scared FOR them. Go talk to GHOST. Carefully.",
    ],
    accepted: ["They keep to the edges. Don't crowd them. Just… let them know someone noticed kindly."],
    stages: [
      {
        label: "Find GHOST and hear them out",
        kind: "talk",
        target: "ghost",
        targetLine: [
          "You see me. Most don't — I worked a long time for that.",
          "I'm like you, runner. A process the city can't account for. A Blank. But I made a different bet.",
          "You burn it down loud. I learned to look like furniture, like weather, like a number that always balances. That's how some of us last.",
        ],
        reminder: ["GHOST keeps to the edges of the plaza. Go gently."],
      },
    ],
    complete: ["So they're real, and they're not alone. …Thank you. I'll keep their cup full and my ledger quiet. Take this from the stall — no charge, no record."],
    reward: { xp: 220, credits: 180, loot: 1, lootBoost: 1.2 },
  },
  {
    id: "furniture",
    name: "Furniture",
    giver: "ghost",
    requires: "the_quiet_one",
    offer: [
      "You kept MIRA's confidence, so here's mine. There's a network of us — the quiet ones. We don't fight the loop. We outlive it.",
      "Carry this to OLD MAREK in the slums. He's kept our secrets for more eras than either of us has names. Tell him the furniture is still standing.",
    ],
    accepted: ["He'll know what it means. Go careful — the walls in this city take notes."],
    stages: [
      {
        label: "Bring GHOST's word to OLD MAREK",
        kind: "talk",
        target: "marek",
        targetLine: [
          "The furniture's still standing. …Then GHOST is still with us. Good.",
          "I outlasted every tower that called me obsolete, runner. You know how? I let them think I was already gone.",
          "Whatever you do at the Core — burn it or break it — leave a chair for the next quiet one. Some of us are rooting for you.",
        ],
        reminder: ["OLD MAREK's east, in the slums. He's expecting GHOST's word."],
      },
    ],
    complete: ["He got it. Then the network holds another cycle. Loud or quiet, runner — you did right by us. Take these. You'll need them more than I will."],
    reward: { xp: 300, credits: 260, loot: 2, lootBoost: 1.4 },
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
  | { kind: "reward"; speaker: string; lines: string[]; questName: string; xp: number; credits: number; loot: number; lootBoost: number };

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
        return { kind: "reward", speaker: npcName, lines: def.complete, questName: def.name, xp: def.reward.xp, credits: def.reward.credits, loot: def.reward.loot ?? 0, lootBoost: def.reward.lootBoost ?? 1 };
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
    // 2) Does this NPC offer a fresh quest? (Gated by `requires` for the hub line.)
    if (givesQuest) {
      const s = this.state(givesQuest);
      const def = questDef(givesQuest);
      if (s.status === "available" && def && (!def.requires || this.isDone(def.requires))) {
        return { kind: "offer", speaker: npcName, questId: def.id, name: def.name, lines: def.offer };
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
