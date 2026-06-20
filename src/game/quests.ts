// METROPHAGE — quests as data. A quest is an ordered list of stages; each stage
// advances on a trigger (infect / dive / kill / secure via gameplay, or talk via
// dialogue). Talk stages run a dialogue tree; the giver's offer tree activates the
// quest. Rewards + a completion flag gate later quests. The Quests system tracks
// state; GameScene fires triggers + resolves dialogue actions. "The Wake" is Quest 1.

export type QuestTriggerType = "infect" | "dive" | "kill" | "secure" | "talk";

export interface QuestStage {
  id: string;
  journal: string; // journal entry for this stage
  objective: string; // short objective label
  on: { type: QuestTriggerType; count?: number };
  talkTree?: string; // for talk stages — dialogue tree to run at the giver
  onEnterLine?: string; // a "// SYSTEM" line shown when this stage begins
}

export interface QuestReward {
  xp: number;
  currency: number;
  loot: number;
  lootBoost: number;
}

export interface QuestDef {
  id: string;
  name: string;
  giver: string; // npc id (the FIXER)
  offerTree: string; // dialogue tree shown when offered (accept → activate)
  stages: QuestStage[];
  reward: QuestReward;
  setsFlag?: string; // set on completion (gates later quests)
  requiresFlag?: string; // only offered once this flag is set
}

export const QUESTS: QuestDef[] = [
  {
    id: "the_wake",
    name: "THE WAKE",
    giver: "fixer",
    offerTree: "wake_offer",
    stages: [
      {
        id: "infect",
        journal: "The FIXER says a signal under the plaza pings your own callsign. Spread the infection to surface it.",
        objective: "Infect 2 nodes",
        on: { type: "infect", count: 2 },
      },
      {
        id: "dive",
        journal: "The signal sharpened — it's frozen behind ICE. Dive an ICE node to pull it.",
        objective: "Break an ICE node",
        on: { type: "dive", count: 1 },
        onEnterLine: "The signal just spiked. It's coming from inside the ICE — find a node and dive it.",
      },
      {
        id: "return",
        journal: "You pulled the fragment. It's your own voice, frozen before you booted. Take it back to the FIXER.",
        objective: "Return to the FIXER",
        on: { type: "talk" },
        talkTree: "wake_final",
      },
    ],
    reward: { xp: 200, currency: 150, loot: 1, lootBoost: 1 },
    setsFlag: "wake_done",
  },
];

export function getQuest(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}
