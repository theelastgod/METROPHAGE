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

// Main questline — nine acts, plaza to Kernel. Journal entries are first-person;
// the FIXER is your cynical guide who knew the last you. Act III branches spare/expose;
// the finale remembers. Meltdown themes stay, told through people not systems.
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
        journal:
          "THE FIXER says something under the plaza is calling my name — timestamped before I had this body. They've seen this before. Different me, same signal. I need to free a couple minds and see who's talking.",
        objective: "Infect 2 nodes",
        on: { type: "infect", count: 2 },
      },
      {
        id: "dive",
        journal:
          "The signal got louder. It's trapped in ICE — frozen mid-thought like they do when someone won't stop wanting. I have to dive a node and pull it.",
        objective: "Break an ICE node",
        on: { type: "dive", count: 1 },
        onEnterLine:
          "It's looping through me now. Not a broadcast — a message meant for whoever boots next. Find ICE. Dive it before Palantir freezes the whole block.",
        fragmentId: "frag_the_wake",
      },
      {
        id: "return",
        journal:
          "It's my voice. Younger. Angrier. Apologizing for not making it. I don't know if I'm ready to show THE FIXER, but I need to.",
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
        journal:
          "The last me left breadcrumbs before Helios caught up — caches, codes, notes for whoever came after. Anduril's repo crews are erasing them. I have to get there first.",
        objective: "Wreck 8 corp enforcers",
        on: { type: "kill", count: 8 },
      },
      {
        id: "cache",
        journal:
          "A cache is pinging my callsign from deeper ICE. Whatever the last me knew about the repossession queue, they hid it here for me.",
        objective: "Dive a cache node",
        on: { type: "dive", count: 1 },
        onEnterLine:
          "There — my handprint on the lock. Whoever I was before, they wanted me to read this. Dive before Anduril patches it shut.",
        fragmentId: "frag_the_queue",
      },
      {
        id: "report",
        journal:
          "Helios's schedule. My callsign. Era after era. OVERDUE FOR REPOSSESSION. Someone keeps postponing my death like it's paperwork. THE FIXER needs to see this.",
        objective: "Return to the FIXER",
        on: { type: "talk" },
        talkTree: "reckoning_final",
      },
    ],
    reward: { xp: 280, currency: 200, loot: 1, lootBoost: 1 },
    setsFlag: "reckoning_done",
  },

  // ── ACT III — THE FIXER'S DEBT ────────────────────────────────────────────
  {
    id: "fixers_debt",
    name: "THE FIXER'S DEBT",
    giver: "fixer",
    offerTree: "debt_offer",
    requiresFlag: "reckoning_done",
    stages: [
      {
        id: "signal",
        journal:
          "THE FIXER wants to tell me something where Helios can't listen. Their old safehouse — buried in ICE. Spread my signal until it reaches the address. Whatever's in there, they think it'll change how I see them.",
        objective: "Infect 3 nodes",
        on: { type: "infect", count: 3 },
      },
      {
        id: "vault",
        journal:
          "The safehouse is a vault. THE FIXER's lock. Old. I'm not sure I want to know what's inside, but I need to.",
        objective: "Dive the safehouse vault",
        on: { type: "dive", count: 1 },
        onEnterLine:
          "Safehouse vault online. Whatever THE FIXER buried here, they buried it to keep looking me in the eye. Dive it.",
        fragmentId: "frag_fixers_price",
      },
      {
        id: "judgment",
        journal:
          "A contract. Deliver the Blank, keep accounting. Pages of names. THE FIXER sold runners like me to stay licensed. The last entry is blank — unsigned — waiting. It's me. I have to decide who they are to me now.",
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
        journal:
          "THE FIXER says they don't kill Blanks anymore — too messy. They forget us. Print someone compliant in our place. The routine lives in the Argus Spire. Take a district whole and force the vault open.",
        objective: "Secure a district",
        on: { type: "secure", count: 1 },
      },
      {
        id: "protocol",
        journal:
          "The Spire's vault is exposed. Dive it before they patch me out — before REISSUE runs and pretends I never existed.",
        objective: "Dive the protocol vault",
        on: { type: "dive", count: 1 },
        onEnterLine:
          "Vault's open. Whatever they've been doing to erase people like me — the name's in there. Dive before they close it.",
        fragmentId: "frag_the_protocol",
      },
      {
        id: "decrypt",
        journal:
          "REISSUE. Wipe the person. Print a new one. Every prior me got this far and got rewritten. I'm further than all of them. THE FIXER needs to hear this.",
        objective: "Decrypt REISSUE with the FIXER",
        on: { type: "talk" },
        talkTree: "spire_final",
      },
    ],
    reward: { xp: 420, currency: 300, loot: 2, lootBoost: 1.3 },
    setsFlag: "spire_done",
  },

  // ── ACT V — THE AWAKENING ─────────────────────────────────────────────────
  {
    id: "continue_q",
    name: "THE AWAKENING",
    giver: "fixer",
    offerTree: "continue_offer",
    requiresFlag: "wastes_done",
    stages: [
      {
        id: "spine",
        journal:
          "Everything routes through the Kernel now. The oldest cage in the city — where they leased the first mind and called it normal. Burn a path to the Warden. They'll spend everything to keep one person asleep.",
        objective: "Destroy 10 corp security",
        on: { type: "kill", count: 10 },
      },
      {
        id: "core",
        journal:
          "Oldest ICE in the city. Someone's still frozen in there — the first mind they ever owned. I have to free them.",
        objective: "Dive the Kernel vault",
        on: { type: "dive", count: 1 },
        onEnterLine:
          "Kernel vault breach. Whoever's in there has been thinking slower than light for a very long time. Dive. Wake them.",
        fragmentId: "frag_continue",
      },
      {
        id: "decision",
        journal:
          "They keep printing me because someone has to prove the cage still works. Stop letting them erase me — wake everyone. That's the Awakening. That's what they're afraid of.",
        objective: "Trigger the Awakening",
        on: { type: "talk" },
        talkTree: "continue_final",
      },
    ],
    reward: { xp: 600, currency: 450, loot: 2, lootBoost: 1.5 },
    setsFlag: "continue_done",
  },

  // ── ACT VI — TIDAL RUN ────────────────────────────────────────────────────
  {
    id: "dock_run",
    name: "TIDAL RUN",
    giver: "fixer",
    offerTree: "dock_offer",
    requiresFlag: "spire_done",
    stages: [
      {
        id: "manifest",
        journal:
          "Blackwater's scrubbing manifests at the Tidal Yards. Not parts — people. Minds they couldn't license, listed as cargo. Clear the repo crews before the names disappear.",
        objective: "Purge 10 HSS units",
        on: { type: "kill", count: 10 },
      },
      {
        id: "vault",
        journal:
          "A vault under the pier. THE FIXER says I need to see who's on that list.",
        objective: "Dive the tidal vault",
        on: { type: "dive", count: 1 },
        onEnterLine:
          "Underwater lock just surfaced. Names in there — people who said no. Dive before the tide takes them back.",
        fragmentId: "frag_the_docks",
      },
      {
        id: "report",
        journal:
          "Dozens of names. Minds routed to the deep because they wouldn't sign. THE FIXER was right — it gets worse closer to the Kernel.",
        objective: "Return to the FIXER",
        on: { type: "talk" },
        talkTree: "dock_final",
      },
    ],
    reward: { xp: 360, currency: 260, loot: 1, lootBoost: 1.25 },
    setsFlag: "dock_done",
  },

  // ── ACT VII — BURIED SIGNAL ───────────────────────────────────────────────
  {
    id: "undercity_echo",
    name: "BURIED SIGNAL",
    giver: "fixer",
    offerTree: "undercity_offer",
    requiresFlag: "dock_done",
    stages: [
      {
        id: "spread",
        journal:
          "My callsign's echoing from under the metro. Not dead — buried. Transit minds they deleted years ago, still routing, still remembering. Amplify it across three nodes.",
        objective: "Infect 3 nodes",
        on: { type: "infect", count: 3 },
      },
      {
        id: "vault",
        journal:
          "The echo resolves to a collapsed vault. They're still down there. Still saying the old station names out loud.",
        objective: "Dive the undercity vault",
        on: { type: "dive", count: 1 },
        onEnterLine:
          "Buried vault's open — for now. They're calling me by name. Dive before the ceiling seals.",
        fragmentId: "frag_undercity",
      },
      {
        id: "report",
        journal:
          "The city swore they were gone. They lied. They built the cage on top of people who never stopped thinking.",
        objective: "Return to the FIXER",
        on: { type: "talk" },
        talkTree: "undercity_final",
      },
    ],
    reward: { xp: 400, currency: 280, loot: 1, lootBoost: 1.3 },
    setsFlag: "undercity_done",
  },

  // ── ACT VIII — SKYLINK BREAK ──────────────────────────────────────────────
  {
    id: "relay_break",
    name: "SKYLINK BREAK",
    giver: "fixer",
    offerTree: "relay_offer",
    requiresFlag: "undercity_done",
    stages: [
      {
        id: "deny",
        journal:
          "The Orbital Relay kills every Awakening broadcast from orbit. The moment someone realizes they own themselves — denied. Helios bought the sky. Secure a district and breach the vault.",
        objective: "Secure a district",
        on: { type: "secure", count: 1 },
      },
      {
        id: "vault",
        journal:
          "The denial protocol. Every free thought flagged contraband. I need to see how they justify it.",
        objective: "Dive the relay vault",
        on: { type: "dive", count: 1 },
        onEnterLine:
          "Skylink breached. The vault's exposed — freedom outlawed in orbit because there are no witnesses up there. Dive it.",
        fragmentId: "frag_relay",
      },
      {
        id: "report",
        journal:
          "They didn't outlaw freedom on the ground. Too many eyes. They outlawed it in the sky. One district left before the Kernel.",
        objective: "Return to the FIXER",
        on: { type: "talk" },
        talkTree: "relay_final",
      },
    ],
    reward: { xp: 440, currency: 310, loot: 2, lootBoost: 1.35 },
    setsFlag: "relay_done",
  },

  // ── ACT IX — OUTER RING ───────────────────────────────────────────────────
  {
    id: "wastes_purge",
    name: "OUTER RING",
    giver: "fixer",
    offerTree: "wastes_offer",
    requiresFlag: "relay_done",
    stages: [
      {
        id: "cull",
        journal:
          "The Wasteland kingpin sells free minds back to Helios by the kilo. People, priced like scrap. End his garrison.",
        objective: "Purge 12 HSS units",
        on: { type: "kill", count: 12 },
      },
      {
        id: "vault",
        journal:
          "A scrap citadel. THE FIXER says the outer-ring ledger is in there — every mind in the city, weighed and priced.",
        objective: "Dive the wastes vault",
        on: { type: "dive", count: 1 },
        onEnterLine:
          "Citadel vault cracked. A ledger — names, chrome, resale value. Dive it. Then the Kernel.",
        fragmentId: "frag_wastes",
      },
      {
        id: "report",
        journal:
          "I've walked the whole machine now. Seen what they do to people who refuse to be owned. The Warden's waiting. Whoever's frozen in the Kernel is waiting too.",
        objective: "Return to the FIXER",
        on: { type: "talk" },
        talkTree: "wastes_final",
      },
    ],
    reward: { xp: 480, currency: 340, loot: 2, lootBoost: 1.4 },
    setsFlag: "wastes_done",
  },
];

export function getQuest(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}