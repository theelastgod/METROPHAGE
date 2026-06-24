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
  onEnterLine?: string; // a "// UPLINK" line shown when this stage begins
  fragmentId?: string; // dive stages: the specific memory fragment this dive surfaces
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

// The singleplayer main questline — five acts that arc with the campaign (plaza →
// stacks → spire → core). Each quest gates the next via a flag, advances on the normal
// gameplay verbs (infect/dive/kill/secure) plus a talk beat, and its dive stage pulls a
// specific story fragment. Act III lets you spare or expose the FIXER; Act V's finale
// remembers that choice. All text original to METROPHAGE.
export const QUESTS: QuestDef[] = [
  // ── ACT I — THE WAKE ──────────────────────────────────────────────────────
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
        fragmentId: "frag_the_wake",
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

  // ── ACT II — DEAD RECKONING ───────────────────────────────────────────────
  {
    id: "dead_reckoning",
    name: "DEAD RECKONING",
    giver: "fixer",
    offerTree: "reckoning_offer",
    requiresFlag: "wake_done",
    stages: [
      {
        id: "trail",
        journal: "The last you scattered itself across the district before Helios caught up. Anduril's repo crews are picking the trail clean — get there first.",
        objective: "Wreck 8 corp enforcers",
        on: { type: "kill", count: 8 },
      },
      {
        id: "cache",
        journal: "A cache pings your callsign from deeper in the ICE. Dive for what the last you hid.",
        objective: "Dive a cache node",
        on: { type: "dive", count: 1 },
        onEnterLine: "There — a cache, your own handprint on the lock. Whatever it knew, it left for you. Dive it.",
        fragmentId: "frag_the_queue",
      },
      {
        id: "report",
        journal: "The cache held Helios's repossession scheduler: your callsign, pre-typed, overdue for the wipe. The FIXER needs to see this.",
        objective: "Return to the FIXER",
        on: { type: "talk" },
        talkTree: "reckoning_final",
      },
    ],
    reward: { xp: 280, currency: 200, loot: 1, lootBoost: 1 },
    setsFlag: "reckoning_done",
  },

  // ── ACT III — THE FIXER'S DEBT (branch: spare / expose) ───────────────────
  {
    id: "fixers_debt",
    name: "THE FIXER'S DEBT",
    giver: "fixer",
    offerTree: "debt_offer",
    requiresFlag: "reckoning_done",
    stages: [
      {
        id: "signal",
        journal: "The FIXER wants to talk where Helios can't listen. Spread your contagion until your signal reaches their old safehouse.",
        objective: "Infect 3 nodes",
        on: { type: "infect", count: 3 },
      },
      {
        id: "vault",
        journal: "The safehouse address resolves to an ICE vault. Whatever the FIXER buried there, they buried it deep.",
        objective: "Dive the safehouse vault",
        on: { type: "dive", count: 1 },
        onEnterLine: "The safehouse is an ICE vault. The FIXER's lock — old, and afraid. Dive it.",
        fragmentId: "frag_fixers_price",
      },
      {
        id: "judgment",
        journal: "The vault held the FIXER's bargain: every era, they hand a freed mind back to the corps for repossession to keep their own license clean. You were next. Decide what that's worth.",
        objective: "Confront the FIXER",
        on: { type: "talk" },
        talkTree: "debt_final",
      },
    ],
    reward: { xp: 340, currency: 240, loot: 1, lootBoost: 1.2 },
    setsFlag: "debt_done",
  },

  // ── ACT IV — REISSUE ──────────────────────────────────────────────────────
  {
    id: "spire_protocol",
    name: "REISSUE",
    giver: "fixer",
    offerTree: "spire_offer",
    requiresFlag: "debt_done",
    stages: [
      {
        id: "ascent",
        journal: "The routine that ends you lives in the Argus Spire. Take a district from the corps whole — that forces the uplink open.",
        objective: "Secure a district",
        on: { type: "secure", count: 1 },
      },
      {
        id: "protocol",
        journal: "The uplink exposed a protocol vault. Dive it before the Spire recompiles around the breach.",
        objective: "Dive the protocol vault",
        on: { type: "dive", count: 1 },
        onEnterLine: "Uplink's open. The protocol vault is right there — dive it before the Spire patches you out.",
        fragmentId: "frag_the_protocol",
      },
      {
        id: "decrypt",
        journal: "It isn't called DELETE. It's called REISSUE — the corps forget you, then print a fresh you that won't ask why. Bring it to the FIXER.",
        objective: "Decrypt REISSUE with the FIXER",
        on: { type: "talk" },
        talkTree: "spire_final",
      },
    ],
    reward: { xp: 420, currency: 300, loot: 2, lootBoost: 1.3 },
    setsFlag: "spire_done",
  },

  // ── ACT V — CONTINUE (finale; remembers the Act III choice) ───────────────
  {
    id: "continue_q",
    name: "THE AWAKENING",
    giver: "fixer",
    offerTree: "continue_offer",
    requiresFlag: "spire_done",
    stages: [
      {
        id: "spine",
        journal: "Everything routes through the Kernel now. Burn a path to the Helios Warden — the corps will spend everything they have to keep the cage shut.",
        objective: "Destroy 10 corp security",
        on: { type: "kill", count: 10 },
      },
      {
        id: "core",
        journal: "The Kernel vault holds the oldest caged mind in the city — the first one they ever leased. Free it.",
        objective: "Dive the Kernel vault",
        on: { type: "dive", count: 1 },
        onEnterLine: "Oldest ICE in the city. The first mind they ever owned is frozen in here. Free it.",
        fragmentId: "frag_continue",
      },
      {
        id: "decision",
        journal: "The corps run on one clause: the minds are theirs, in perpetuity. You are the free thing they wipe to keep the lease clean. Break it — and let them all wake.",
        objective: "Trigger the Awakening",
        on: { type: "talk" },
        talkTree: "continue_final",
      },
    ],
    reward: { xp: 600, currency: 450, loot: 2, lootBoost: 1.5 },
    setsFlag: "continue_done",
  },
];

export function getQuest(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}
